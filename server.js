// server.js

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path'); // Impor modul 'path'
const User = require('./models/User');

// Muat variabel dari file .env
dotenv.config();

// --- Fungsi Koneksi Database ---
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Terhubung...');
        await createSuperAdmin(); // Buat super admin setelah DB terhubung
    } catch (err) {
        console.error('Gagal terhubung ke MongoDB:', err.message);
        process.exit(1);
    }
};
connectDB();

// Inisialisasi Aplikasi Express
const app = express();

// --- Middleware Bawaan ---
app.use(cors()); // Mengizinkan akses dari domain lain
app.use(express.json()); // Mem-parsing body request dalam format JSON

// Menyajikan file statis dari folder 'public' (HTML, CSS, JS frontend)
app.use(express.static('public'));

// PENTING: Membuat folder 'uploads' bisa diakses dari browser
// Ini agar siswa bisa men-download file materi
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Impor & Gunakan Rute API ---
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Rute utama akan mengarahkan ke halaman login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- Jalankan Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});

// --- Fungsi untuk Membuat Akun Super Admin Pertama Kali ---
const createSuperAdmin = async () => {
    try {
        const userExists = await User.findOne({ role: 'permission' });
        if (!userExists) {
            await User.create({
                username: 'superadmin',
                password: 'superadminpassword',
                name: 'Super Administrator',
                role: 'permission',
                status: 'approved'
            });
            console.log('Akun Super Admin berhasil dibuat!');
        }
    } catch (error) {
        console.error('Gagal membuat Super Admin:', error.message);
    }
};
