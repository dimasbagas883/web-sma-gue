    // routes/auth.js
    const express = require('express');
    const router = express.Router();
    const nodemailer = require('nodemailer');
    const bcrypt = require('bcryptjs');
    const User = require('../models/User');
    const Otp = require('../models/Otp'); // Impor model OTP baru
    const jwt = require('jsonwebtoken');

    // --- Konfigurasi Nodemailer untuk mengirim email ---
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    // --- RUTE BARU: Meminta OTP ---
    router.post('/request-otp', async (req, res) => {
        try {
            const { email } = req.body;
            // Cek apakah email sudah terdaftar di database utama
            if (await User.findOne({ email })) {
                return res.status(400).json({ message: 'Email sudah terdaftar.' });
            }

            // Hapus OTP lama jika ada untuk email ini
            await Otp.deleteOne({ email });

            // Buat OTP baru (6 digit angka)
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

            // Kirim email
            await transporter.sendMail({
                from: `"EduPortal" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Kode Verifikasi Registrasi Anda',
                html: `
                    <p>Halo,</p>
                    <p>Gunakan kode di bawah ini untuk menyelesaikan pendaftaran Anda.</p>
                    <h2 style="font-size: 24px; letter-spacing: 2px; text-align: center;">${otpCode}</h2>
                    <p>Kode ini hanya berlaku selama 5 menit.</p>
                `
            });

            // Simpan OTP yang sudah di-hash ke database sementara
            await Otp.create({ email, otp: otpCode });
            
            res.status(200).json({ message: 'OTP telah dikirim ke email Anda.' });

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Gagal mengirim OTP.' });
        }
    });

    // --- RUTE BARU: Verifikasi OTP dan Registrasi Final ---
    router.post('/verify-and-register', async (req, res) => {
        try {
            const { name, email, password, role, otp } = req.body;
            
            const otpRecord = await Otp.findOne({ email });
            if (!otpRecord) {
                return res.status(400).json({ message: 'OTP tidak ditemukan atau sudah kedaluwarsa. Silakan minta lagi.' });
            }
            
            // Cocokkan OTP yang diinput user dengan yang di-hash di DB
            const isMatch = await bcrypt.compare(otp, otpRecord.otp);
            if (!isMatch) {
                return res.status(400).json({ message: 'OTP salah.' });
            }

            // Jika OTP benar, buat user di database utama
            await User.create({ name, email, password, role, status: 'pending' });
            
            // Hapus OTP dari database sementara
            await Otp.deleteOne({ email });
            
            res.status(201).json({ message: 'Verifikasi berhasil! Akun Anda telah dibuat dan menunggu persetujuan admin.' });

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Terjadi kesalahan saat registrasi.' });
        }
    });


    // --- Rute Login (tidak berubah) ---
    router.post('/login', async (req, res) => {
        // ... (Kode login tetap sama seperti sebelumnya, menggunakan email & password)
        try {
            const { email, password } = req.body;
            const user = await User.findOne({ email });
            if (!user || !(await user.matchPassword(password))) {
                return res.status(401).json({ message: 'Email atau password salah.' });
            }
            if (user.status === 'pending' && !['permission', 'akademik', 'pimpinan'].includes(user.role)) {
                return res.status(403).json({ message: 'Akun Anda belum disetujui oleh staf akademik.' });
            }
            const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '1d' });
            res.json({
                token,
                user: { id: user._id, name: user.name, role: user.role }
            });
        } catch (error) {
            res.status(500).json({ message: 'Server Error' });
        }
    });

    module.exports = router;
    