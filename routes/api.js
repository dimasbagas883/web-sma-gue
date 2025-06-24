// routes/api.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');

// --- Impor Middleware & Model ---
const { protect, authorize } = require('../middleware/authmiddleware');
const User = require('../models/User');
const MataPelajaran = require('../models/MataPelajaran');
const Kelas = require('../models/Kelas');
const Jadwal = require('../models/Jadwal');
const TugasNilai = require('../models/TugasNilai');
const Materi = require('../models/Materi');
const Tugas = require('../models/Tugas');
const PengumpulanTugas = require('../models/PengumpulanTugas');
const Absensi = require('../models/Absensi');
const Profile = require('../models/Profile');
const JenisPembayaran = require('../models/JenisPembayaran');
const Pembayaran = require('../models/Pembayaran');
const Pengumuman = require('../models/Pengumuman');
const KonfirmasiPembayaran = require('../models/KonfirmasiPembayaran'); // MODEL BARU

// --- Konfigurasi Multer untuk File Upload ---
const materiStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const uploadMateri = multer({ storage: materiStorage });

const tugasStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/tugas/'),
    filename: (req, file, cb) => {
        const siswaId = req.user._id;
        const unik = Date.now();
        cb(null, `${siswaId}-tugas-${unik}${path.extname(file.originalname)}`);
    }
});
const uploadTugas = multer({ storage: tugasStorage });

const profilStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/profil/'),
    filename: (req, file, cb) => {
        const userId = req.user._id;
        cb(null, `${userId}${path.extname(file.originalname)}`);
    }
});
const uploadFotoProfil = multer({ storage: profilStorage });
// NEW: Konfigurasi Multer untuk upload bukti pembayaran
const buktiStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/bukti_pembayaran/'),
    filename: (req, file, cb) => {
        const unik = Date.now();
        cb(null, `${req.user._id}-bukti-${unik}${path.extname(file.originalname)}`);
    }
});
const uploadBukti = multer({ storage: buktiStorage });


// =================================================================
// --- RUTE DASBOR & DATA KHUSUS ---
// =================================================================

// @desc    Siswa mendapatkan data lengkap untuk dasbornya
router.get('/dashboard/siswa', protect, authorize('siswa'), async (req, res) => {
    try {
        const siswaId = req.user._id;
        const semuaNilai = await TugasNilai.find({
            siswa: siswaId
        }).populate('mataPelajaran', 'namaMapel');
        const ringkasan = {
            tugasBelumSelesai: 1,
            ujianMendatang: 3,
            persentaseKehadiran: 95
        }; // Data dummy
        const nilaiPerMapel = {};
        semuaNilai.forEach(item => {
            if (item.mataPelajaran) {
                const namaMapel = item.mataPelajaran.namaMapel;
                if (!nilaiPerMapel[namaMapel]) {
                    nilaiPerMapel[namaMapel] = {
                        total: 0,
                        count: 0
                    };
                }
                nilaiPerMapel[namaMapel].total += item.nilai;
                nilaiPerMapel[namaMapel].count += 1;
            }
        });
        const performaNilai = {
            labels: Object.keys(nilaiPerMapel),
            data: Object.values(nilaiPerMapel).map(mapel => mapel.total / mapel.count)
        };
        res.json({
            ringkasan,
            performaNilai
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

// @desc    Guru mendapatkan data ringkasan untuk dasbornya
router.get('/dashboard/guru', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const guruId = req.user._id;
        const jadwalGuru = await Jadwal.find({
            guru: guruId
        }).populate('kelas');

        const kelasIds = new Set();
        const siswaDihitung = new Set();

        jadwalGuru.forEach(j => {
            if (j.kelas) { // Saring data yang rusak
                kelasIds.add(j.kelas._id.toString());
                j.kelas.siswa.forEach(siswaId => {
                    siswaDihitung.add(siswaId.toString());
                });
            }
        });

        const totalSiswa = siswaDihitung.size;

        const namaHariIni = new Date().toLocaleDateString('id-ID', {
            weekday: 'long'
        });
        const jadwalHariIniCount = jadwalGuru.filter(j => j.hari === namaHariIni && j.kelas).length; // Pastikan kelasnya ada

        const ringkasan = {
            jumlahKelas: kelasIds.size,
            totalSiswa: totalSiswa,
            jadwalHariIni: jadwalHariIniCount
        };
        res.json({
            ringkasan
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/dashboard/pimpinan-analytics', protect, authorize('pimpinan', 'permission'), async (req, res) => {
    try {
        // --- 1. KPI: Total Guru & Siswa ---
        const totalGuru = await User.countDocuments({ role: 'guru' });
        const totalSiswa = await User.countDocuments({ role: 'siswa', status: 'approved' });
        const pendaftarBaru = await User.countDocuments({ status: 'pending' });

        // --- 2. KPI: Rata-rata Kehadiran Hari Ini ---
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const siswaHadirHariIni = await Absensi.distinct('siswa', { 
            tanggal: { $gte: todayStart, $lte: todayEnd },
            status: 'Hadir' 
        });
        const rataRataKehadiran = totalSiswa > 0 ? ((siswaHadirHariIni.length / totalSiswa) * 100).toFixed(1) : 0;
        
        // --- 3. KPI: Total Tunggakan Sekolah ---
        const semuaJenisPembayaran = await JenisPembayaran.find({});
        const totalTagihanPerSiswa = semuaJenisPembayaran.reduce((sum, item) => sum + item.jumlah, 0);
        const totalHarusBayar = totalSiswa * totalTagihanPerSiswa;
        
        const totalSudahBayarResult = await Pembayaran.aggregate([
            { $group: { _id: null, total: { $sum: '$jumlahBayar' } } }
        ]);
        const totalSudahBayar = totalSudahBayarResult.length > 0 ? totalSudahBayarResult[0].total : 0;
        const totalTunggakan = totalHarusBayar - totalSudahBayar;

        // --- 4. Grafik: Performa Akademik per Kelas ---
        const nilaiPerKelas = await Kelas.aggregate([
            { $lookup: { from: 'users', localField: 'siswa', foreignField: '_id', as: 'dataSiswa' } },
            { $unwind: '$dataSiswa' },
            { $lookup: { from: 'tugasnilais', localField: 'dataSiswa._id', foreignField: 'siswa', as: 'dataNilai' } },
            { $unwind: '$dataNilai' },
            {
                $group: {
                    _id: '$namaKelas',
                    rataRataNilai: { $avg: '$dataNilai.nilai' }
                }
            },
            { $sort: { rataRataNilai: -1 } },
            { $project: { _id: 0, namaKelas: '$_id', rataRata: { $round: ['$rataRataNilai', 1] } } }
        ]);

        // --- 5. Grafik: Distribusi Tunggakan per Jenis Pembayaran ---
        const pembayaranPerJenis = await Pembayaran.aggregate([
            { $group: { _id: '$jenisPembayaran', totalBayar: { $sum: '$jumlahBayar' } } }
        ]);
        
        const distribusiTunggakan = semuaJenisPembayaran.map(jenis => {
            const pembayaranTerkait = pembayaranPerJenis.find(p => p._id.equals(jenis._id));
            const totalTagihanJenis = totalSiswa * jenis.jumlah;
            const totalBayarJenis = pembayaranTerkait ? pembayaranTerkait.totalBayar : 0;
            const tunggakan = totalTagihanJenis - totalBayarJenis;
            return {
                nama: jenis.nama,
                tunggakan: tunggakan > 0 ? tunggakan : 0
            };
        }).filter(t => t.tunggakan > 0);

        res.json({
            success: true,
            data: {
                kpi: {
                    totalGuru,
                    totalSiswa,
                    pendaftarBaru,
                    rataRataKehadiran,
                    totalTunggakan
                },
                grafik: {
                    nilaiPerKelas,
                    distribusiTunggakan
                }
            }
        });

    } catch (error) {
        console.error("Error fetching pimpinan analytics:", error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});


// @desc    Pimpinan mendapatkan laporan performa akademik per kelas
// @route   GET /api/laporan/performa-akademik
// @access  Private (Pimpinan)
router.get('/laporan/performa-akademik', protect, authorize('pimpinan', 'permission'), async (req, res) => {
    try {
        const performaKelas = await Kelas.aggregate([
            // 1. Ambil data wali kelas
            {
                $lookup: {
                    from: 'users',
                    localField: 'waliKelas',
                    foreignField: '_id',
                    as: 'dataWaliKelas'
                }
            },
            // 2. Hitung jumlah siswa per kelas
            {
                $addFields: {
                    jumlahSiswa: { $size: '$siswa' }
                }
            },
            // 3. Ambil data nilai siswa di setiap kelas
            {
                $lookup: {
                    from: 'tugasnilais', // Pastikan nama koleksi ini benar (biasanya jamak dan lowercase)
                    localField: 'siswa',
                    foreignField: 'siswa',
                    as: 'nilaiSiswa'
                }
            },
            // 4. Ambil data absensi siswa di setiap kelas
            {
                $lookup: {
                    from: 'absensis', // Pastikan nama koleksi ini benar
                    localField: 'siswa',
                    foreignField: 'siswa',
                    as: 'absensiSiswa'
                }
            },
            // 5. Olah data yang sudah di-lookup
            {
                $project: {
                    namaKelas: 1,
                    jumlahSiswa: 1,
                    waliKelas: { $arrayElemAt: ['$dataWaliKelas.name', 0] },
                    // Hitung rata-rata nilai, handle jika tidak ada nilai
                    rataRataNilai: {
                        $cond: {
                            if: { $gt: [{ $size: '$nilaiSiswa' }, 0] },
                            then: { $avg: '$nilaiSiswa.nilai' },
                            else: 0
                        }
                    },
                    // Hitung total absensi 'Hadir'
                    totalHadir: {
                        $size: {
                            $filter: {
                                input: '$absensiSiswa',
                                as: 'absen',
                                cond: { $eq: ['$$absen.status', 'Hadir'] }
                            }
                        }
                    },
                    // Hitung total absensi keseluruhan
                    totalAbsensi: { $size: '$absensiSiswa' }
                }
            },
            // 6. Hitung persentase kehadiran
             {
                $addFields: {
                    tingkatKehadiran: {
                        $cond: {
                            if: { $gt: ['$totalAbsensi', 0] },
                            then: { $multiply: [{ $divide: ['$totalHadir', '$totalAbsensi'] }, 100] },
                            else: 0
                        }
                    }
                }
            },
            // 7. Format output akhir
            {
                $project: {
                    _id: 0,
                    namaKelas: 1,
                    waliKelas: { $ifNull: ['$waliKelas', 'N/A'] },
                    jumlahSiswa: 1,
                    rataRataNilai: { $round: ['$rataRataNilai', 1] },
                    tingkatKehadiran: { $round: ['$tingkatKehadiran', 1] }
                }
            },
            { $sort: { rataRataNilai: -1 } }
        ]);

        res.json({ success: true, data: performaKelas });

    } catch (error) {
        console.error("Error fetching academic performance report:", error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});
router.get('/laporan/tren-keuangan', protect, authorize('pimpinan', 'permission'), async (req, res) => {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyRevenue = await Pembayaran.aggregate([
            { $match: { tanggalBayar: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: { year: { $year: "$tanggalBayar" }, month: { $month: "$tanggalBayar" } },
                    total: { $sum: "$jumlahBayar" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);
        
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
        
        const formattedData = monthlyRevenue.map(item => ({
            label: `${monthNames[item._id.month - 1]} ${item._id.year}`,
            total: item.total
        }));

        res.json({ success: true, data: formattedData });

    } catch (error) {
        console.error("Error fetching financial trend data:", error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});


// =================================================================
// --- RUTE PROFIL PENGGUNA ---
// =================================================================

router.get('/profil/saya', protect, async (req, res) => {
    try {
        let profile = await Profile.findOne({
            user: req.user._id
        });
        if (!profile) {
            profile = await Profile.create({
                user: req.user._id
            });
        }
        const user = await User.findById(req.user._id).select('name email');
        const userProfile = { ...profile.toObject(),
            name: user.name,
            email: user.email
        };
        res.json({
            data: userProfile
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.put('/profil/saya', protect, async (req, res) => {
    try {
        const {
            name,
            nisn,
            alamat,
            noTelepon,
            namaOrangTua
        } = req.body;
        const user = await User.findById(req.user._id);
        user.name = name;
        await user.save();
        const profile = await Profile.findOneAndUpdate({
            user: req.user._id
        }, {
            nisn,
            alamat,
            noTelepon,
            namaOrangTua
        }, {
            new: true,
            upsert: true
        });
        res.json({
            message: 'Profil berhasil diperbarui',
            data: profile
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.put('/users/ubah-password', protect, async (req, res) => {
    try {
        const {
            passwordLama,
            passwordBaru
        } = req.body;
        const user = await User.findById(req.user._id);
        const isMatch = await user.matchPassword(passwordLama);
        if (!isMatch) return res.status(400).json({
            message: 'Password lama salah.'
        });
        user.password = passwordBaru;
        await user.save();
        res.json({
            message: 'Password berhasil diubah.'
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.put('/profil/foto', protect, uploadFotoProfil.single('fotoProfil'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: 'Tidak ada file yang diunggah.'
            });
        }
        const filePath = `/uploads/profil/${req.file.filename}`;
        const profile = await Profile.findOneAndUpdate({
            user: req.user._id
        }, {
            fotoProfil: filePath
        }, {
            new: true,
            upsert: true
        });
        res.json({
            message: 'Foto profil berhasil diperbarui.',
            data: profile
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

// =================================================================
// --- RUTE MANAJEMEN (ADMIN) ---
// =================================================================

router.post('/users/create', protect, authorize('permission'), async (req, res) => {
    try {
        const {
            email,
            password,
            name,
            role
        } = req.body;
        if (!email || !password || !name || !role) return res.status(400).json({
            message: 'Semua field wajib diisi'
        });
        if (await User.findOne({
                email
            })) return res.status(400).json({
            message: 'Email sudah digunakan'
        });
        const user = await User.create({
            email,
            password,
            name,
            role,
            status: 'approved'
        });
        await Profile.create({
            user: user._id
        });
        const userResult = {
            _id: user._id,
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status
        };
        res.status(201).json({
            message: `User ${role} berhasil dibuat`,
            data: userResult
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/users', protect, authorize('akademik', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json({
            count: users.length,
            data: users
        });
    } catch (error) {
        res.status(500).json({
            message: "Server Error"
        });
    }
});

router.get('/users/pending', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const users = await User.find({
            status: 'pending'
        }).select('-password');
        res.json({
            data: users
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/users/by-role/:role', protect, authorize('akademik', 'tata_usaha', 'permission'), async (req, res) => {
    try {
        const validRoles = ['guru', 'siswa'];
        if (!validRoles.includes(req.params.role)) return res.status(400).json({
            message: 'Peran tidak valid.'
        });
        const users = await User.find({
            role: req.params.role
        }).select('_id name');
        res.json({
            data: users
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.put('/users/:id', protect, authorize('permission'), async (req, res) => {
    try {
        const {
            name,
            role,
            status
        } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({
            message: 'User tidak ditemukan'
        });
        user.name = name || user.name;
        user.role = role || user.role;
        user.status = status || user.status;
        await user.save();
        const updatedUser = user.toObject();
        delete updatedUser.password;
        res.json({
            message: 'User berhasil diperbarui',
            data: updatedUser
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.put('/users/approve/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, {
            status: 'approved'
        }, {
            new: true
        });
        if (!user) return res.status(404).json({
            message: 'User tidak ditemukan'
        });
        res.json({
            message: `User ${user.name} telah disetujui.`
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server error'
        });
    }
});

router.delete('/users/:id', protect, authorize('permission'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({
            message: 'User tidak ditemukan'
        });
        if (user._id.toString() === req.user._id.toString()) return res.status(400).json({
            message: 'Anda tidak dapat menghapus akun Anda sendiri.'
        });
        await User.findByIdAndDelete(req.params.id);
        res.json({
            message: 'User berhasil dihapus'
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

// =================================================================
// --- RUTE MANAJEMEN MATA PELAJARAN ---
// =================================================================

router.post('/matapelajaran', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const {
            kodeMapel,
            namaMapel
        } = req.body;
        if (await MataPelajaran.findOne({
                kodeMapel
            })) return res.status(400).json({
            message: 'Kode Mata Pelajaran sudah ada'
        });
        const mataPelajaran = await MataPelajaran.create({
            kodeMapel,
            namaMapel
        });
        res.status(201).json({
            message: 'Mata Pelajaran berhasil dibuat',
            data: mataPelajaran
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/matapelajaran', protect, authorize('akademik', 'pimpinan', 'permission', 'guru', 'tata_usaha'), async (req, res) => {
    try {
        const daftarMapel = await MataPelajaran.find().populate('pengajar', 'name');
        res.json({
            data: daftarMapel
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.put('/matapelajaran/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const {
            kodeMapel,
            namaMapel
        } = req.body;
        const mataPelajaran = await MataPelajaran.findByIdAndUpdate(req.params.id, {
            kodeMapel,
            namaMapel
        }, {
            new: true,
            runValidators: true
        });
        if (!mataPelajaran) return res.status(404).json({
            message: 'Mata pelajaran tidak ditemukan'
        });
        res.json({
            message: 'Mata pelajaran berhasil diperbarui',
            data: mataPelajaran
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.delete('/matapelajaran/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const mataPelajaran = await MataPelajaran.findByIdAndDelete(req.params.id);
        if (!mataPelajaran) return res.status(404).json({
            message: 'Mata pelajaran tidak ditemukan'
        });
        res.json({
            message: 'Mata pelajaran berhasil dihapus'
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

// =================================================================
// --- RUTE MANAJEMEN KELAS ---
// =================================================================

router.post('/kelas', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const {
            namaKelas,
            waliKelas
        } = req.body;
        if (!namaKelas || !waliKelas) return res.status(400).json({
            message: 'Nama kelas dan wali kelas wajib diisi.'
        });
        const newClass = await Kelas.create({
            namaKelas,
            waliKelas,
            siswa: []
        });
        res.status(201).json({
            message: 'Kelas berhasil dibuat',
            data: newClass
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/kelas', protect, authorize('akademik', 'pimpinan', 'permission', 'tata_usaha'), async (req, res) => {
    try {
        const classes = await Kelas.find({}).populate('waliKelas', 'name').populate('siswa', 'name');
        res.json({
            data: classes
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/kelas/guru/saya', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const kelasIds = await Jadwal.find({
            guru: req.user._id
        }).distinct('kelas');
        const kelasGuru = await Kelas.find({
            '_id': {
                $in: kelasIds
            }
        }).select('namaKelas siswa').populate('siswa', 'name');
        res.json({
            data: kelasGuru
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/kelas/siswa/saya', protect, authorize('siswa'), async (req, res) => {
    try {
        const kelasSiswa = await Kelas.findOne({
            siswa: req.user._id
        }).select('_id namaKelas');
        if (!kelasSiswa) return res.status(404).json({
            message: 'Anda tidak terdaftar di kelas manapun.'
        });
        res.json({
            data: kelasSiswa
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.put('/kelas/:id/tambah-siswa', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const {
            siswaId
        } = req.body;
        const updatedClass = await Kelas.findByIdAndUpdate(req.params.id, {
            $addToSet: {
                siswa: siswaId
            }
        }, {
            new: true
        }).populate('waliKelas', 'name').populate('siswa', 'name');
        if (!updatedClass) return res.status(404).json({
            message: 'Kelas tidak ditemukan'
        });
        res.json({
            message: 'Siswa berhasil ditambahkan',
            data: updatedClass
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.delete('/kelas/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const deletedClass = await Kelas.findByIdAndDelete(req.params.id);
        if (!deletedClass) return res.status(404).json({
            message: 'Kelas tidak ditemukan'
        });
        res.json({
            message: 'Kelas berhasil dihapus'
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

// =================================================================
// --- RUTE MANAJEMEN JADWAL ---
// =================================================================

router.post('/jadwal', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const {
            kelas,
            hari,
            jamMulai,
            jamSelesai,
            mataPelajaran,
            guru
        } = req.body;
        if (!kelas || !hari || !jamMulai || !jamSelesai || !mataPelajaran || !guru) return res.status(400).json({
            message: 'Semua field jadwal wajib diisi.'
        });
        const newJadwal = await Jadwal.create({
            kelas,
            hari,
            jamMulai,
            jamSelesai,
            mataPelajaran,
            guru
        });
        res.status(201).json({
            message: 'Jadwal berhasil dibuat',
            data: newJadwal
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/jadwal/by-kelas/:kelasId', protect, async (req, res) => {
    try {
        const jadwalKelas = await Jadwal.find({
                kelas: req.params.kelasId
            })
            .populate('mataPelajaran', '_id namaMapel')
            .populate('guru', '_id name');
        res.json({
            data: jadwalKelas
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/jadwal/saya', protect, authorize('siswa'), async (req, res) => {
    try {
        const kelasSiswa = await Kelas.findOne({
            siswa: req.user._id
        });
        if (!kelasSiswa) return res.json({
            data: []
        });
        const jadwalKelas = await Jadwal.find({
            kelas: kelasSiswa._id
        }).sort({
            jamMulai: 'asc'
        }).populate('mataPelajaran', 'namaMapel').populate('guru', 'name');
        res.json({
            data: jadwalKelas
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/jadwal/guru/saya', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        let jadwalGuru = await Jadwal.find({
            guru: req.user._id
        }).sort({
            jamMulai: 'asc'
        }).populate('mataPelajaran', 'namaMapel').populate('kelas', 'namaKelas');
        jadwalGuru = jadwalGuru.filter(j => j.mataPelajaran && j.kelas);
        res.json({
            data: jadwalGuru
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.delete('/jadwal/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const deletedJadwal = await Jadwal.findByIdAndDelete(req.params.id);
        if (!deletedJadwal) return res.status(404).json({
            message: 'Entri jadwal tidak ditemukan'
        });
        res.json({
            message: 'Jadwal berhasil dihapus'
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

// =================================================================
// --- RUTE TUGAS, MATERI, NILAI, ABSENSI ---
// =================================================================

router.post('/materi/upload', protect, authorize('guru', 'permission'), uploadMateri.single('fileMateri'), async (req, res) => {
    try {
        const {
            judul,
            deskripsi,
            kelas,
            mataPelajaran
        } = req.body;
        if (!req.file) return res.status(400).json({
            message: 'File materi wajib diunggah.'
        });
        const newMateri = await Materi.create({
            judul,
            deskripsi,
            kelas,
            mataPelajaran,
            namaFile: req.file.originalname,
            pathFile: `/uploads/${req.file.filename}`,
            diunggahOleh: req.user._id
        });
        res.status(201).json({
            message: 'Materi berhasil diunggah',
            data: newMateri
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/materi/by-kelas/:kelasId', protect, authorize('siswa', 'guru', 'permission'), async (req, res) => {
    try {
        const daftarMateri = await Materi.find({
            kelas: req.params.kelasId
        }).populate('mataPelajaran', 'namaMapel').populate('diunggahOleh', 'name').sort({
            createdAt: -1
        });
        res.json({
            data: daftarMateri
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.post('/tugas', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const {
            judul,
            deskripsi,
            kelas,
            mataPelajaran,
            deadline
        } = req.body;
        const tugasBaru = await Tugas.create({
            judul,
            deskripsi,
            kelas,
            mataPelajaran,
            deadline,
            diberikanOleh: req.user._id
        });
        res.status(201).json({
            message: 'Tugas berhasil dibuat',
            data: tugasBaru
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/tugas/by-kelas/:kelasId', protect, authorize('siswa', 'guru', 'permission'), async (req, res) => {
    try {
        const daftarTugas = await Tugas.find({
            kelas: req.params.kelasId
        }).populate('mataPelajaran', 'namaMapel').populate('diberikanOleh', 'name').sort({
            createdAt: -1
        }).lean();
        const pengumpulanSiswa = await PengumpulanTugas.find({
            siswa: req.user._id
        }).select('tugas');
        const idTugasTerkumpul = new Set(pengumpulanSiswa.map(p => p.tugas.toString()));
        const tugasDenganStatus = daftarTugas.map(tugas => ({ ...tugas,
            sudahTerkumpul: idTugasTerkumpul.has(tugas._id.toString())
        }));
        res.json({
            data: tugasDenganStatus
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/tugas/guru/saya', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        let daftarTugas = await Tugas.find({
                diberikanOleh: req.user._id
            })
            .populate('kelas', '_id namaKelas')
            .populate('mataPelajaran', '_id namaMapel')
            .sort({
                createdAt: -1
            });
        daftarTugas = daftarTugas.filter(t => t.kelas && t.mataPelajaran);
        res.json({
            data: daftarTugas
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.post('/tugas/:tugasId/submit', protect, authorize('siswa'), uploadTugas.single('fileTugas'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({
            message: 'File tugas wajib diunggah.'
        });
        const pengumpulan = await PengumpulanTugas.create({
            tugas: req.params.tugasId,
            siswa: req.user._id,
            namaFile: req.file.originalname,
            pathFile: `/uploads/tugas/${req.file.filename}`
        });
        res.status(201).json({
            message: 'Tugas berhasil dikumpulkan!',
            data: pengumpulan
        });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({
            message: 'Anda sudah pernah mengumpulkan tugas ini.'
        });
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/pengumpulan/by-tugas/:tugasId', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const daftarPengumpulan = await PengumpulanTugas.find({
            tugas: req.params.tugasId
        }).populate('siswa', 'name');
        res.json({
            data: daftarPengumpulan
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.put('/pengumpulan/:pengumpulanId/nilai', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const {
            nilai,
            siswaId,
            mataPelajaranId
        } = req.body;
        const pengumpulan = await PengumpulanTugas.findByIdAndUpdate(req.params.pengumpulanId, {
            nilai
        }, {
            new: true
        });
        if (!pengumpulan) return res.status(404).json({
            message: 'Data pengumpulan tidak ditemukan'
        });
        await TugasNilai.findOneAndUpdate({
            tugas: pengumpulan.tugas,
            siswa: siswaId
        }, {
            siswa: siswaId,
            mataPelajaran: mataPelajaranId,
            tugas: pengumpulan.tugas,
            jenis: 'TUGAS',
            nilai: nilai,
            diberikanOleh: req.user._id
        }, {
            upsert: true,
            new: true
        });
        res.json({
            message: 'Nilai berhasil disimpan',
            data: pengumpulan
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.post('/penilaian', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const {
            siswa,
            mataPelajaran,
            jenis,
            nilai
        } = req.body;
        const penilaianBaru = await TugasNilai.create({
            siswa,
            mataPelajaran,
            jenis,
            nilai,
            diberikanOleh: req.user._id
        });
        res.status(201).json({
            message: 'Nilai berhasil dimasukkan',
            data: penilaianBaru
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/penilaian/saya', protect, authorize('siswa'), async (req, res) => {
    try {
        const nilaiSaya = await TugasNilai.find({
            siswa: req.user._id
        }).populate('mataPelajaran', 'namaMapel').populate('diberikanOleh', 'name');
        res.json({
            data: nilaiSaya
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.post('/absensi', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const {
            kelas,
            mataPelajaran,
            tanggal,
            absensi
        } = req.body;
        const bulkOps = absensi.map(item => ({
            updateOne: {
                filter: {
                    siswa: item.siswa,
                    tanggal: new Date(tanggal),
                    mataPelajaran
                },
                update: {
                    $set: {
                        status: item.status,
                        kelas: kelas,
                        dicatatOleh: req.user._id
                    }
                },
                upsert: true
            }
        }));
        await Absensi.bulkWrite(bulkOps);
        res.status(200).json({
            message: 'Absensi berhasil disimpan.'
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/absensi/saya', protect, authorize('siswa'), async (req, res) => {
    try {
        const daftarAbsensi = await Absensi.find({
            siswa: req.user._id
        }).populate('mataPelajaran', 'namaMapel').sort({
            tanggal: -1
        });
        res.json({
            data: daftarAbsensi
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

// =================================================================
// --- RUTE TATA USAHA (YANG SUDAH ADA & BARU) ---
// =================================================================

router.post('/jenis-pembayaran', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const {
            nama,
            deskripsi,
            jumlah
        } = req.body;
        const jenisPembayaran = await JenisPembayaran.create({
            nama,
            deskripsi,
            jumlah
        });
        res.status(201).json({
            message: 'Jenis Pembayaran berhasil dibuat',
            data: jenisPembayaran
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/jenis-pembayaran', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const daftarJenis = await JenisPembayaran.find().sort({
            createdAt: -1
        });
        res.json({
            data: daftarJenis
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

// NEW: Rute untuk siswa mengirimkan konfirmasi pembayaran
// @desc    Siswa membuat konfirmasi pembayaran baru
// @route   POST /api/pembayaran/konfirmasi
// @access  Private (Siswa)
router.post('/pembayaran/konfirmasi', protect, authorize('siswa'), uploadBukti.single('buktiPembayaran'), async (req, res) => {
    try {
        const {
            jenisPembayaran,
            jumlah
        } = req.body;

        if (!req.file) {
            return res.status(400).json({
                message: 'Bukti pembayaran wajib diunggah.'
            });
        }

        // Cek apakah sudah ada konfirmasi pending untuk jenis pembayaran ini
        const existingConfirmation = await KonfirmasiPembayaran.findOne({
            siswa: req.user._id,
            jenisPembayaran: jenisPembayaran,
            status: 'Pending'
        });

        if (existingConfirmation) {
            return res.status(400).json({
                message: 'Anda sudah memiliki konfirmasi yang sedang diproses untuk tagihan ini.'
            });
        }

        const konfirmasi = await KonfirmasiPembayaran.create({
            siswa: req.user._id,
            jenisPembayaran,
            jumlah: parseInt(jumlah),
            buktiPembayaran: `/uploads/bukti_pembayaran/${req.file.filename}`,
            status: 'Pending',
            tanggalKonfirmasi: new Date()
        });

        res.status(201).json({
            message: 'Konfirmasi berhasil dikirim.',
            data: konfirmasi
        });
    } catch (error) {
        console.error('Error submitting payment confirmation:', error);
        res.status(500).json({
            message: 'Server Error'
        });
    }
});

router.put('/jenis-pembayaran/:id', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const {
            nama,
            deskripsi,
            jumlah
        } = req.body;
        const jenis = await JenisPembayaran.findByIdAndUpdate(req.params.id, {
            nama,
            deskripsi,
            jumlah
        }, {
            new: true,
            runValidators: true
        });
        if (!jenis) return res.status(404).json({
            message: 'Jenis pembayaran tidak ditemukan'
        });
        res.json({
            message: 'Jenis pembayaran berhasil diperbarui',
            data: jenis
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.delete('/jenis-pembayaran/:id', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const jenis = await JenisPembayaran.findByIdAndDelete(req.params.id);
        if (!jenis) return res.status(404).json({
            message: 'Jenis pembayaran tidak ditemukan'
        });
        res.json({
            message: 'Jenis pembayaran berhasil dihapus'
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.post('/pembayaran', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const { siswa, jenisPembayaran, jumlahBayar, keterangan } = req.body;
        const kelasSiswa = await Kelas.findOne({ siswa: siswa });
        if (!kelasSiswa) {
            return res.status(400).json({ message: 'Gagal mencatat: Siswa tidak terdaftar di kelas manapun.' });
        }
        const pembayaran = await Pembayaran.create({ 
            siswa, 
            kelas: kelasSiswa._id, 
            jenisPembayaran, 
            jumlahBayar, 
            // ==========================================================
            // --- PERBAIKAN KONSISTENSI 1 ---
            status: 'lunas', // Menggunakan 'lunas' lowercase
            // ==========================================================
            keterangan, 
            dicatatOleh: req.user._id 
        });
        res.status(201).json({ message: 'Pembayaran berhasil dicatat', data: pembayaran });
    } catch (error) {
        if (error.code === 11000) { return res.status(400).json({ message: 'Siswa ini sudah lunas untuk jenis pembayaran ini.' }); }
        console.error('Error creating manual payment:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

router.get('/pembayaran', protect, authorize('tata_usaha', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const { tanggalMulai, tanggalSelesai } = req.query;
        let filter = {};
        if (tanggalMulai && tanggalSelesai) {
            filter.tanggalBayar = {
                $gte: new Date(tanggalMulai),
                $lt: new Date(new Date(tanggalSelesai).setDate(new Date(tanggalSelesai).getDate() + 1))
            };
        }
        const riwayat = await Pembayaran.find(filter)
            .populate('siswa', 'name')
            .populate('jenisPembayaran', 'nama jumlah')
            .populate('dicatatOleh', 'name')
            .sort({ tanggalBayar: -1 });
        res.json({ data: riwayat });
    } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// **FIXED**: Rute ini sekarang ada dengan implementasi lengkap
router.get('/pembayaran', protect, authorize('tata_usaha', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const {
            tanggalMulai,
            tanggalSelesai
        } = req.query;
        let filter = {};
        if (tanggalMulai && tanggalSelesai) {
            filter.tanggalBayar = {
                $gte: new Date(tanggalMulai),
                $lt: new Date(new Date(tanggalSelesai).setDate(new Date(tanggalSelesai).getDate() + 1))
            };
        }
        const riwayat = await Pembayaran.find(filter)
            .populate('siswa', 'name')
            .populate('jenisPembayaran', 'nama jumlah')
            .populate('dicatatOleh', 'name')
            .sort({
                tanggalBayar: -1
            });
        res.json({
            data: riwayat
        });
    } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

// NEW: Rute untuk mengedit transaksi pembayaran
// @desc    Update sebuah transaksi pembayaran
// @route   PUT /api/pembayaran/:id
// @access  Private (Tata Usaha, Permission)
router.put('/pembayaran/:id', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const {
            jenisPembayaran,
            jumlahBayar,
            keterangan
        } = req.body;
        const pembayaran = await Pembayaran.findByIdAndUpdate(
            req.params.id, {
                jenisPembayaran,
                jumlahBayar,
                keterangan
            }, {
                new: true,
                runValidators: true
            } // Opsi untuk mengembalikan dokumen baru & menjalankan validator
        );

        if (!pembayaran) {
            return res.status(404).json({
                message: 'Transaksi tidak ditemukan'
            });
        }

        res.json({
            message: 'Transaksi berhasil diperbarui',
            data: pembayaran
        });
    } catch (error) {
        console.error('Error updating pembayaran:', error);
        res.status(500).json({
            message: 'Server Error'
        });
    }
});

// NEW: Rute untuk menghapus transaksi pembayaran
// @desc    Hapus sebuah transaksi pembayaran
// @route   DELETE /api/pembayaran/:id
// @access  Private (Tata Usaha, Permission)
router.delete('/pembayaran/:id', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const pembayaran = await Pembayaran.findByIdAndDelete(req.params.id);

        if (!pembayaran) {
            return res.status(404).json({
                message: 'Transaksi tidak ditemukan'
            });
        }

        res.json({
            message: 'Transaksi berhasil dihapus'
        });
    } catch (error) {
        console.error('Error deleting pembayaran:', error);
        res.status(500).json({
            message: 'Server Error'
        });
    }
});

router.get('/keuangan/detail-siswa/saya', protect, authorize('siswa'), async (req, res) => {
    try {
        const siswaId = req.user._id;
        const semuaJenisTagihan = await JenisPembayaran.find({}).lean();
        const riwayatPembayaran = await Pembayaran.find({ siswa: siswaId }).populate('jenisPembayaran', 'nama').lean();
        const konfirmasiPending = await KonfirmasiPembayaran.find({ siswa: siswaId, status: 'Pending' }).lean();

        const totalTagihan = semuaJenisTagihan.reduce((sum, tagihan) => sum + tagihan.jumlah, 0);
        const totalBayar = riwayatPembayaran.reduce((sum, bayar) => sum + bayar.jumlahBayar, 0);
        
        const rincianTagihan = semuaJenisTagihan.map(tagihan => {
            // 1. Filter SEMUA pembayaran yang relevan untuk tagihan ini
            const pembayaranTerkait = riwayatPembayaran.filter(p => p.jenisPembayaran._id.toString() === tagihan._id.toString());
            // 2. Jumlahkan semua cicilan yang sudah dibayar
            const totalPembayaranUntukTagihanIni = pembayaranTerkait.reduce((sum, p) => sum + p.jumlahBayar, 0);

            const adaKonfirmasiPending = konfirmasiPending.find(k => k.jenisPembayaran.toString() === tagihan._id.toString());

            let status = 'Belum Lunas';
            // 3. Bandingkan total cicilan dengan jumlah tagihan
            if (totalPembayaranUntukTagihanIni >= tagihan.jumlah) {
                status = 'Lunas';
            } else if (adaKonfirmasiPending) {
                status = 'Pending';
            }
            return { ...tagihan, status };
        });

        res.json({ success: true, data: { summary: { totalTagihan, totalBayar, sisaTunggakan: totalTagihan - totalBayar }, rincianTagihan, riwayatPembayaran } });
    } catch (error) { res.status(500).json({ message: 'Server Error' }); }
});
// NEW: Rute untuk TU memverifikasi (menyetujui/menolak) konfirmasi
// @desc    Verify a payment confirmation
// @route   POST /api/pembayaran/konfirmasi/:id/verifikasi
// @access  Private (Tata Usaha, Permission)
// RUTE VERIFIKASI DENGAN PERBAIKAN
// @desc     Verify a payment confirmation
// @route    POST /api/pembayaran/konfirmasi/:id/verifikasi
// @access   Private (Tata Usaha, Permission)
router.post('/pembayaran/konfirmasi/:id/verifikasi', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const { status } = req.body; // status akan 'Approved' atau 'Rejected'
        const konfirmasiId = req.params.id;
        const pemeriksaId = req.user._id;

        const konfirmasi = await KonfirmasiPembayaran.findById(konfirmasiId);
        if (!konfirmasi || konfirmasi.status !== 'Pending') {
            return res.status(404).json({ message: 'Konfirmasi tidak ditemukan atau sudah diverifikasi.' });
        }

        if (status === 'Approved') {
            const kelasSiswa = await Kelas.findOne({ siswa: konfirmasi.siswa });
            if (!kelasSiswa) {
                return res.status(400).json({ message: 'Gagal memproses: Siswa ini tidak terdaftar di kelas manapun.' });
            }

            // ==========================================================
            // --- PERBAIKAN KUNCI DI SINI ---
            // Mengganti Pembayaran.create() dengan Pembayaran.findOneAndUpdate()
            // untuk mencegah error "duplicate key"
            // ==========================================================

            // 1. Tentukan kriteria pencarian berdasarkan unique key
            const filter = { 
                siswa: konfirmasi.siswa,
                jenisPembayaran: konfirmasi.jenisPembayaran 
            };
            
            // 2. Tentukan data yang akan diperbarui atau dibuat
            const update = { 
                $set: {
                    kelas: kelasSiswa._id,
                    jumlahBayar: konfirmasi.jumlah,
                    status: 'lunas',
                    keterangan: `Diverifikasi dari konfirmasi #${konfirmasiId}`,
                    dicatatOleh: pemeriksaId,
                    tanggalBayar: new Date()
                }
            };
            
            // 3. Tentukan opsi: upsert=true berarti akan membuat dokumen baru jika tidak ditemukan
            const options = { 
                upsert: true, 
                new: true 
            };

            // Jalankan operasi "update or insert"
            await Pembayaran.findOneAndUpdate(filter, update, options);

            // 4. Update status konfirmasi menjadi 'Approved'
            konfirmasi.status = 'Approved';
            konfirmasi.diperiksaOleh = pemeriksaId;
            await konfirmasi.save();

            res.json({ message: 'Konfirmasi berhasil disetujui dan pembayaran telah dicatat.' });

        } else if (status === 'Rejected') {
            // Cukup update status konfirmasi
            konfirmasi.status = 'Rejected';
            konfirmasi.diperiksaOleh = pemeriksaId;
            await konfirmasi.save();

            res.json({ message: 'Konfirmasi telah ditolak.' });

        } else {
            return res.status(400).json({ message: 'Status tidak valid.' });
        }

    } catch (error) {
        console.error('Error verifying confirmation:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

router.get('/keuangan/tunggakan/:kelasId', protect, authorize('tata_usaha', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const kelas = await Kelas.findById(req.params.kelasId).populate('siswa', '_id name');
        if (!kelas) {
            return res.status(404).json({
                message: 'Kelas tidak ditemukan'
            });
        }
        const semuaJenisTagihan = await JenisPembayaran.find({});
        const totalNilaiSemuaTagihan = semuaJenisTagihan.reduce((sum, item) => sum + item.jumlah, 0);
        const laporanTunggakan = [];
        for (const siswa of kelas.siswa) {
            const pembayaranSiswa = await Pembayaran.find({
                siswa: siswa._id
            });
            const totalBayar = pembayaranSiswa.reduce((sum, item) => sum + item.jumlahBayar, 0);
            laporanTunggakan.push({
                siswa: {
                    _id: siswa._id,
                    name: siswa.name
                },
                totalTagihan: totalNilaiSemuaTagihan,
                totalBayar: totalBayar,
            });
        }
        res.json({
            success: true,
            data: laporanTunggakan
        });
    } catch (error) {
        console.error('Error fetching tunggakan data:', error);
        res.status(500).json({
            message: 'Server Error'
        });
    }
});

// @desc    Mendapatkan detail tagihan dan pembayaran seorang siswa (untuk TU)
// @route   GET /api/keuangan/detail-siswa/:siswaId
// @access  Private (Tata Usaha, Pimpinan, Permission)
router.get('/keuangan/detail-siswa/:siswaId', protect, authorize('tata_usaha', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const { siswaId } = req.params;
        const siswa = await User.findById(siswaId).select('_id name');
        if (!siswa) { return res.status(404).json({ message: 'Siswa tidak ditemukan' }); }
        
        const semuaJenisTagihan = await JenisPembayaran.find({}).lean();
        const riwayatPembayaran = await Pembayaran.find({ siswa: siswaId }).populate('jenisPembayaran', 'nama').lean();
        const konfirmasiPending = await KonfirmasiPembayaran.find({ siswa: siswaId, status: 'Pending' }).lean();

        const totalTagihan = semuaJenisTagihan.reduce((sum, tagihan) => sum + tagihan.jumlah, 0);
        const totalBayar = riwayatPembayaran.reduce((sum, bayar) => sum + bayar.jumlahBayar, 0);
        
        const rincianTagihan = semuaJenisTagihan.map(tagihan => {
            const pembayaranTerkait = riwayatPembayaran.filter(p => p.jenisPembayaran._id.toString() === tagihan._id.toString());
            const totalPembayaranUntukTagihanIni = pembayaranTerkait.reduce((sum, p) => sum + p.jumlahBayar, 0);
            const adaKonfirmasiPending = konfirmasiPending.find(k => k.jenisPembayaran.toString() === tagihan._id.toString());
            
            let status = 'Belum Lunas';
            if (totalPembayaranUntukTagihanIni >= tagihan.jumlah) {
                status = 'Lunas';
            } else if (adaKonfirmasiPending) {
                status = 'Pending';
            }
            return { ...tagihan, status };
        });

        res.json({ success: true, data: { siswa, summary: { totalTagihan, totalBayar, sisaTunggakan: totalTagihan - totalBayar }, rincianTagihan, riwayatPembayaran } });
    } catch (error) { res.status(500).json({ message: 'Server Error' }); }
});


// =================================================================
// --- RUTE PENGUMUMAN ---
// =================================================================

router.post('/pengumuman', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const {
            judul,
            isi,
            ditujukanUntuk
        } = req.body;
        const pengumuman = await Pengumuman.create({
            judul,
            isi,
            ditujukanUntuk,
            dibuatOleh: req.user._id
        });
        res.status(201).json({
            message: 'Pengumuman berhasil dibuat',
            data: pengumuman
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.get('/pengumuman', protect, async (req, res) => {
    try {
        const pengumuman = await Pengumuman.find({
            $or: [{
                ditujukanUntuk: 'semua'
            }, {
                ditujukanUntuk: req.user.role
            }]
        }).populate('dibuatOleh', 'name').sort({
            createdAt: -1
        });
        res.json({
            data: pengumuman
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.delete('/pengumuman/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const pengumuman = await Pengumuman.findByIdAndDelete(req.params.id);
        if (!pengumuman) return res.status(404).json({
            message: 'Pengumuman tidak ditemukan'
        });
        res.json({
            message: 'Pengumuman berhasil dihapus.'
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});


// =================================================================
// --- RUTE REKAP AKADEMIK & KEUANGAN (TERMASUK YG BARU) ---
// =================================================================

router.get('/nilai/by-kelas/:kelasId', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const kelas = await Kelas.findById(req.params.kelasId);
        if (!kelas) return res.status(404).json({
            message: 'Kelas tidak ditemukan'
        });

        const daftarNilai = await TugasNilai.find({
                siswa: {
                    $in: kelas.siswa
                }
            })
            .populate('siswa', 'name')
            .populate('mataPelajaran', 'namaMapel')
            .sort({
                'siswa.name': 1,
                'mataPelajaran.namaMapel': 1
            });

        res.json({
            data: daftarNilai
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.put('/nilai/:nilaiId', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const {
            nilai
        } = req.body;
        const updatedNilai = await TugasNilai.findByIdAndUpdate(req.params.nilaiId, {
            nilai
        }, {
            new: true
        });
        if (!updatedNilai) return res.status(404).json({
            message: 'Data nilai tidak ditemukan'
        });
        res.json({
            message: 'Nilai berhasil diperbarui',
            data: updatedNilai
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.post('/rekap/siswa', protect, authorize('akademik', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const {
            siswaId,
            tahunAjaran,
            semester
        } = req.body;
        const siswa = await User.findById(siswaId).select('name email');
        if (!siswa) {
            return res.status(404).json({
                message: 'Siswa tidak ditemukan.'
            });
        }
        let profil = await Profile.findOne({
            user: siswaId
        });
        if (!profil) {
            profil = {
                nisn: '-'
            };
        }

        const semuaNilai = await TugasNilai.find({
            siswa: siswaId
        }).populate('mataPelajaran', 'namaMapel');
        const semuaAbsensi = await Absensi.find({
            siswa: siswaId
        });

        const nilaiRekap = {};
        semuaNilai.forEach(item => {
            if (item.mataPelajaran) {
                const mapel = item.mataPelajaran.namaMapel;
                if (!nilaiRekap[mapel]) {
                    nilaiRekap[mapel] = {
                        tugas: [],
                        uts: null,
                        uas: null,
                        rataRata: 0
                    };
                }
                if (item.jenis === 'TUGAS') nilaiRekap[mapel].tugas.push(item.nilai);
                if (item.jenis === 'UTS') nilaiRekap[mapel].uts = item.nilai;
                if (item.jenis === 'UAS') nilaiRekap[mapel].uas = item.nilai;
            }
        });

        Object.keys(nilaiRekap).forEach(mapel => {
            const dataNilai = nilaiRekap[mapel];
            const rataRataTugas = dataNilai.tugas.length > 0 ? dataNilai.tugas.reduce((a, b) => a + b, 0) / dataNilai.tugas.length : 0;
            const nilaiAkhir = (rataRataTugas * 0.4) + ((dataNilai.uts || 0) * 0.3) + ((dataNilai.uas || 0) * 0.3);
            nilaiRekap[mapel].rataRata = nilaiAkhir.toFixed(2);
        });

        const absensiRekap = {
            Hadir: 0,
            Sakit: 0,
            Izin: 0,
            Alpa: 0
        };
        semuaAbsensi.forEach(item => {
            if (absensiRekap.hasOwnProperty(item.status)) {
                absensiRekap[item.status]++;
            }
        });

        res.json({
            success: true,
            data: {
                siswa: { ...siswa.toObject(),
                    nisn: profil.nisn
                },
                nilai: nilaiRekap,
                absensi: absensiRekap
            }
        });
    } catch (error) {
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.post('/absensi/rekap', protect, authorize('akademik', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const {
            kelasId,
            tanggalMulai,
            tanggalSelesai
        } = req.body;
        if (!kelasId || !tanggalMulai || !tanggalSelesai) {
            return res.status(400).json({
                message: 'Parameter tidak lengkap.'
            });
        }

        const absensi = await Absensi.find({
                kelas: kelasId,
                tanggal: {
                    $gte: new Date(tanggalMulai),
                    $lte: new Date(tanggalSelesai)
                }
            })
            .populate('siswa', 'name')
            .populate('mataPelajaran', 'namaMapel')
            .sort({
                tanggal: 1,
                'siswa.name': 1
            });

        res.json({
            success: true,
            data: absensi
        });
    } catch (error) {
        console.error('Error rekap absensi kelas:', error);
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

router.post('/absensi/rekap-individu', protect, authorize('akademik', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const {
            siswaId,
            tanggalMulai,
            tanggalSelesai
        } = req.body;
        if (!siswaId || !tanggalMulai || !tanggalSelesai) {
            return res.status(400).json({
                message: 'Parameter tidak lengkap.'
            });
        }
        const siswa = await User.findById(siswaId).select('name');
        if (!siswa) {
            return res.status(404).json({
                message: 'Siswa tidak ditemukan'
            });
        }
        const absensi = await Absensi.find({
                siswa: siswaId,
                tanggal: {
                    $gte: new Date(tanggalMulai),
                    $lte: new Date(tanggalSelesai)
                }
            })
            .populate('mataPelajaran', 'namaMapel')
            .sort({
                tanggal: 1
            });

        res.json({
            success: true,
            data: {
                siswa,
                absensi
            }
        });
    } catch (error) {
        console.error('Error rekap absensi individu:', error);
        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
});

// @desc    Mendapatkan data ringkasan untuk dashboard keuangan
// @route   GET /api/dashboard/keuangan
// @access  Private (Tata Usaha, Pimpinan, Permission)
router.get('/dashboard/keuangan', protect, authorize('tata_usaha', 'pimpinan', 'permission'), async (req, res) => {
    try {
        // --- 1. Pemasukan & Transaksi Hari Ini (Logika Tetap Sama) ---
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const pemasukanResult = await Pembayaran.aggregate([{
            $match: {
                tanggalBayar: {
                    $gte: todayStart,
                    $lte: todayEnd
                }
            }
        }, {
            $group: {
                _id: null,
                total: {
                    $sum: "$jumlahBayar"
                },
                count: {
                    $sum: 1
                }
            }
        }]);
        const pemasukanHariIni = pemasukanResult.length > 0 ? pemasukanResult[0].total : 0;
        const transaksiHariIni = pemasukanResult.length > 0 ? pemasukanResult[0].count : 0;

        // --- 2. Total Tunggakan (Logika Baru yang Lebih Akurat) ---
        // Ambil semua data yang dibutuhkan dalam satu kali panggilan untuk efisiensi
        const semuaSiswaAktif = await User.find({
            role: 'siswa',
            status: 'approved'
        }).select('_id');
        const semuaJenisTagihan = await JenisPembayaran.find({});
        const semuaPembayaran = await Pembayaran.find({}).select('siswa jumlahBayar');

        // Hitung total nilai dari semua jenis tagihan yang ada
        const totalNilaiSemuaTagihan = semuaJenisTagihan.reduce((sum, tagihan) => sum + tagihan.jumlah, 0);

        let totalTunggakanKeseluruhan = 0;

        // Iterasi per siswa untuk menghitung tunggakan individu
        for (const siswa of semuaSiswaAktif) {
            // Filter pembayaran untuk siswa saat ini dari data yang sudah diambil
            const pembayaranSiswa = semuaPembayaran.filter(p => p.siswa.toString() === siswa._id.toString());
            const totalBayarSiswa = pembayaranSiswa.reduce((sum, p) => sum + p.jumlahBayar, 0);

            const tunggakanSiswa = totalNilaiSemuaTagihan - totalBayarSiswa;

            if (tunggakanSiswa > 0) {
                totalTunggakanKeseluruhan += tunggakanSiswa;
            }
        }

        // --- 3. Grafik Pemasukan (Logika Tetap Sama) ---
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyRevenue = await Pembayaran.aggregate([{
            $match: {
                tanggalBayar: {
                    $gte: sixMonthsAgo
                }
            }
        }, {
            $group: {
                _id: {
                    year: {
                        $year: "$tanggalBayar"
                    },
                    month: {
                        $month: "$tanggalBayar"
                    }
                },
                total: {
                    $sum: "$jumlahBayar"
                }
            }
        }, {
            $sort: {
                "_id.year": 1,
                "_id.month": 1
            }
        }]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
        const grafikPemasukan = {
            labels: monthlyRevenue.map(item => `${monthNames[item._id.month - 1]} ${item._id.year}`),
            data: monthlyRevenue.map(item => item.total)
        };

        res.json({
            success: true,
            data: {
                ringkasan: {
                    pemasukanHariIni,
                    transaksiHariIni,
                    totalTunggakan: totalTunggakanKeseluruhan
                },
                grafikPemasukan
            }
        });

    } catch (error) {
        console.error('Error fetching financial dashboard data:', error);
        res.status(500).json({
            message: 'Server Error'
        });
    }
});

// NEW: Rute untuk TU melihat daftar konfirmasi yang pending
router.get('/pembayaran/konfirmasi/pending', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const pendingConfirmations = await KonfirmasiPembayaran.find({
                status: 'Pending'
            })
            .populate('siswa', 'name')
            .populate('jenisPembayaran', 'nama')
            .sort({
                tanggalKonfirmasi: 'asc'
            });

        res.json({
            success: true,
            data: pendingConfirmations
        });
    } catch (error) {
        console.error('Error fetching pending confirmations:', error);
        res.status(500).json({
            message: 'Server Error'
        });
    }
});

// FIXED: Rute untuk TU memverifikasi (menyetujui/menolak) konfirmasi
// @desc    Verify a payment confirmation
// @route   POST /api/pembayaran/konfirmasi/:id/verifikasi
// @access  Private (Tata Usaha, Permission)
router.post('/pembayaran/konfirmasi/:id/verifikasi', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const { status } = req.body; // status akan 'Approved' atau 'Rejected'
        const konfirmasiId = req.params.id;
        const pemeriksaId = req.user._id;

        const konfirmasi = await KonfirmasiPembayaran.findById(konfirmasiId);
        if (!konfirmasi || konfirmasi.status !== 'Pending') {
            return res.status(404).json({ message: 'Konfirmasi tidak ditemukan atau sudah diverifikasi.' });
        }

        if (status === 'Approved') {
            const kelasSiswa = await Kelas.findOne({ siswa: konfirmasi.siswa });
            if (!kelasSiswa) {
                return res.status(400).json({ message: 'Gagal memproses: Siswa ini tidak terdaftar di kelas manapun.' });
            }

            // 1. Buat entri pembayaran baru
            await Pembayaran.create({
                siswa: konfirmasi.siswa,
                kelas: kelasSiswa._id, // Menambahkan kelas siswa
                jenisPembayaran: konfirmasi.jenisPembayaran,
                jumlahBayar: konfirmasi.jumlah,
                // ==========================================================
                // --- PERBAIKAN KONSISTENSI 2 ---
                // Menyamakan nilai status menjadi 'lunas' (lowercase)
                // agar sesuai dengan model dan tidak menyebabkan error validasi.
                status: 'lunas', 
                // ==========================================================
                keterangan: `Diverifikasi dari konfirmasi #${konfirmasiId}`,
                dicatatOleh: pemeriksaId,
                tanggalBayar: new Date() // Tanggal saat disetujui
            });

            // 2. Update status konfirmasi
            konfirmasi.status = 'Approved';
            konfirmasi.diperiksaOleh = pemeriksaId;
            await konfirmasi.save();

            res.json({ message: 'Konfirmasi berhasil disetujui dan pembayaran telah dicatat.' });

        } else if (status === 'Rejected') {
            // Cukup update status konfirmasi
            konfirmasi.status = 'Rejected';
            konfirmasi.diperiksaOleh = pemeriksaId;
            await konfirmasi.save();

            res.json({ message: 'Konfirmasi telah ditolak.' });

        } else {
            return res.status(400).json({ message: 'Status tidak valid.' });
        }

    } catch (error) {
        console.error('Error verifying confirmation:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;