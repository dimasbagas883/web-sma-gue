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
const Pengumuman = require('../models/Pengumuman'); // Pastikan ini ada

// --- Konfigurasi Multer ---
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


// =================================================================
// --- RUTE DASBOR & DATA KHUSUS ---
// =================================================================
router.get('/dashboard/siswa', protect, authorize('siswa'), async (req, res) => {
    try {
        const siswaId = req.user._id;
        const semuaNilai = await TugasNilai.find({ siswa: siswaId }).populate('mataPelajaran', 'namaMapel');
        const ringkasan = { tugasBelumSelesai: 1, ujianMendatang: 3, persentaseKehadiran: 95 };
        const nilaiPerMapel = {};
        semuaNilai.forEach(item => {
            if (item.mataPelajaran) {
                const namaMapel = item.mataPelajaran.namaMapel;
                if (!nilaiPerMapel[namaMapel]) { nilaiPerMapel[namaMapel] = { total: 0, count: 0 }; }
                nilaiPerMapel[namaMapel].total += item.nilai;
                nilaiPerMapel[namaMapel].count += 1;
            }
        });
        const performaNilai = { labels: Object.keys(nilaiPerMapel), data: Object.values(nilaiPerMapel).map(mapel => mapel.total / mapel.count) };
        res.json({ ringkasan, performaNilai });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/dashboard/guru', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const guruId = req.user._id;
        const jadwalGuru = await Jadwal.find({ guru: guruId }).populate('kelas');
        const kelasIds = new Set();
        const siswaDihitung = new Set();
        jadwalGuru.forEach(j => {
            if(j.kelas) {
                kelasIds.add(j.kelas._id.toString());
                j.kelas.siswa.forEach(siswaId => {
                    siswaDihitung.add(siswaId.toString());
                });
            }
        });
        const totalSiswa = siswaDihitung.size;
        const namaHariIni = new Date().toLocaleDateString('id-ID', { weekday: 'long' });
        const jadwalHariIniCount = jadwalGuru.filter(j => j.hari === namaHariIni && j.kelas).length;
        const ringkasan = { 
            jumlahKelas: kelasIds.size, 
            totalSiswa: totalSiswa, 
            jadwalHariIni: jadwalHariIniCount 
        };
        res.json({ ringkasan });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/dashboard/pimpinan', protect, authorize('pimpinan', 'permission'), async (req, res) => {
    try {
        const totalGuru = await User.countDocuments({ role: 'guru' });
        const totalSiswa = await User.countDocuments({ role: 'siswa' });
        const avgNilaiResult = await TugasNilai.aggregate([ { $group: { _id: null, avgValue: { $avg: "$nilai" } } } ]);
        const rataRataNilai = avgNilaiResult.length > 0 ? avgNilaiResult[0].avgValue.toFixed(2) : 0;
        const ringkasan = { jumlahGuru: totalGuru, jumlahSiswa: totalSiswa, rataRataNilaiSekolah: rataRataNilai };
        res.json({ ringkasan });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// =================================================================
// --- RUTE PROFIL PENGGUNA ---
// =================================================================
router.get('/profil/saya', protect, async (req, res) => {
    try {
        let profile = await Profile.findOne({ user: req.user._id });
        if (!profile) { profile = await Profile.create({ user: req.user._id }); }
        const user = await User.findById(req.user._id).select('name email');
        const userProfile = { ...profile.toObject(), name: user.name, email: user.email };
        res.json({ data: userProfile });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.put('/profil/saya', protect, async (req, res) => {
    try {
        const { name, nisn, alamat, noTelepon, namaOrangTua } = req.body;
        const user = await User.findById(req.user._id);
        user.name = name;
        await user.save();
        const profile = await Profile.findOneAndUpdate({ user: req.user._id }, { nisn, alamat, noTelepon, namaOrangTua }, { new: true, upsert: true });
        res.json({ message: 'Profil berhasil diperbarui', data: profile });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.put('/users/ubah-password', protect, async (req, res) => {
    try {
        const { passwordLama, passwordBaru } = req.body;
        const user = await User.findById(req.user._id);
        const isMatch = await user.matchPassword(passwordLama);
        if (!isMatch) return res.status(400).json({ message: 'Password lama salah.' });
        user.password = passwordBaru;
        await user.save();
        res.json({ message: 'Password berhasil diubah.' });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.put('/profil/foto', protect, uploadFotoProfil.single('fotoProfil'), async (req, res) => {
    try {
        if (!req.file) { return res.status(400).json({ message: 'Tidak ada file yang diunggah.' }); }
        const filePath = `/uploads/profil/${req.file.filename}`;
        const profile = await Profile.findOneAndUpdate({ user: req.user._id }, { fotoProfil: filePath }, { new: true, upsert: true });
        res.json({ message: 'Foto profil berhasil diperbarui.', data: profile });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// =================================================================
// --- RUTE MANAJEMEN (ADMIN) ---
// =================================================================
router.post('/users/create', protect, authorize('permission'), async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        if (!email || !password || !name || !role) return res.status(400).json({ message: 'Semua field wajib diisi' });
        if (await User.findOne({ email })) return res.status(400).json({ message: 'Email sudah digunakan' });
        const user = await User.create({ email, password, name, role, status: 'approved' });
        await Profile.create({ user: user._id });
        const userResult = { _id: user._id, id: user._id, email: user.email, name: user.name, role: user.role, status: user.status };
        res.status(201).json({ message: `User ${role} berhasil dibuat`, data: userResult });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/users', protect, authorize('akademik', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json({ count: users.length, data: users });
    } catch (error) { res.status(500).json({ message: "Server Error" }); }
});
router.get('/users/pending', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const users = await User.find({ status: 'pending' }).select('-password');
        res.json({ data: users });
    } catch(error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/users/by-role/:role', protect, authorize('akademik', 'tata_usaha', 'permission'), async (req, res) => {
    try {
        const validRoles = ['guru', 'siswa'];
        if (!validRoles.includes(req.params.role)) return res.status(400).json({ message: 'Peran tidak valid.' });
        const users = await User.find({ role: req.params.role }).select('name');
        res.json({ data: users });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.put('/users/:id', protect, authorize('permission'), async (req, res) => {
    try {
        const { name, role, status } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });
        user.name = name || user.name;
        user.role = role || user.role;
        user.status = status || user.status;
        await user.save();
        const updatedUser = user.toObject();
        delete updatedUser.password;
        res.json({ message: 'User berhasil diperbarui', data: updatedUser });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.put('/users/approve/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
        if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });
        res.json({ message: `User ${user.name} telah disetujui.` });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});
router.delete('/users/:id', protect, authorize('permission'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });
        if (user._id.toString() === req.user._id.toString()) return res.status(400).json({ message: 'Anda tidak dapat menghapus akun Anda sendiri.' });
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User berhasil dihapus' });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// =================================================================
// --- RUTE MANAJEMEN MATA PELAJARAN ---
// =================================================================
router.post('/matapelajaran', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const { kodeMapel, namaMapel } = req.body;
        if (await MataPelajaran.findOne({ kodeMapel })) return res.status(400).json({ message: 'Kode Mata Pelajaran sudah ada' });
        const mataPelajaran = await MataPelajaran.create({ kodeMapel, namaMapel });
        res.status(201).json({ message: 'Mata Pelajaran berhasil dibuat', data: mataPelajaran });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/matapelajaran', protect, authorize('akademik', 'pimpinan', 'permission', 'guru', 'tata_usaha'), async (req, res) => {
    try {
        const daftarMapel = await MataPelajaran.find().populate('pengajar', 'name');
        res.json({ data: daftarMapel });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.put('/matapelajaran/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const { kodeMapel, namaMapel } = req.body;
        const mataPelajaran = await MataPelajaran.findByIdAndUpdate(req.params.id, { kodeMapel, namaMapel }, { new: true, runValidators: true });
        if (!mataPelajaran) return res.status(404).json({ message: 'Mata pelajaran tidak ditemukan' });
        res.json({ message: 'Mata pelajaran berhasil diperbarui', data: mataPelajaran });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.delete('/matapelajaran/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const mataPelajaran = await MataPelajaran.findByIdAndDelete(req.params.id);
        if (!mataPelajaran) return res.status(404).json({ message: 'Mata pelajaran tidak ditemukan' });
        res.json({ message: 'Mata pelajaran berhasil dihapus' });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// =================================================================
// --- RUTE MANAJEMEN KELAS ---
// =================================================================
router.post('/kelas', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const { namaKelas, waliKelas } = req.body;
        if (!namaKelas || !waliKelas) return res.status(400).json({ message: 'Nama kelas dan wali kelas wajib diisi.' });
        const newClass = await Kelas.create({ namaKelas, waliKelas, siswa: [] });
        res.status(201).json({ message: 'Kelas berhasil dibuat', data: newClass });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/kelas', protect, authorize('akademik', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const classes = await Kelas.find({}).populate('waliKelas', 'name').populate('siswa', 'name');
        res.json({ data: classes });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/kelas/guru/saya', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const kelasIds = await Jadwal.find({ guru: req.user._id }).distinct('kelas');
        const kelasGuru = await Kelas.find({ '_id': { $in: kelasIds } }).select('namaKelas siswa').populate('siswa', 'name');
        res.json({ data: kelasGuru });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/kelas/siswa/saya', protect, authorize('siswa'), async (req, res) => {
    try {
        const kelasSiswa = await Kelas.findOne({ siswa: req.user._id }).select('_id namaKelas');
        if (!kelasSiswa) return res.status(404).json({ message: 'Anda tidak terdaftar di kelas manapun.' });
        res.json({ data: kelasSiswa });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.put('/kelas/:id/tambah-siswa', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const { siswaId } = req.body;
        const updatedClass = await Kelas.findByIdAndUpdate(req.params.id, { $addToSet: { siswa: siswaId } }, { new: true }).populate('waliKelas', 'name').populate('siswa', 'name');
        if (!updatedClass) return res.status(404).json({ message: 'Kelas tidak ditemukan' });
        res.json({ message: 'Siswa berhasil ditambahkan', data: updatedClass });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.delete('/kelas/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const deletedClass = await Kelas.findByIdAndDelete(req.params.id);
        if (!deletedClass) return res.status(404).json({ message: 'Kelas tidak ditemukan' });
        res.json({ message: 'Kelas berhasil dihapus' });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// =================================================================
// --- RUTE MANAJEMEN JADWAL ---
// =================================================================
router.post('/jadwal', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const { kelas, hari, jamMulai, jamSelesai, mataPelajaran, guru } = req.body;
        if (!kelas || !hari || !jamMulai || !jamSelesai || !mataPelajaran || !guru) return res.status(400).json({ message: 'Semua field jadwal wajib diisi.' });
        const newJadwal = await Jadwal.create({ kelas, hari, jamMulai, jamSelesai, mataPelajaran, guru });
        res.status(201).json({ message: 'Jadwal berhasil dibuat', data: newJadwal });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/jadwal/by-kelas/:kelasId', protect, async (req, res) => {
    try {
        const jadwalKelas = await Jadwal.find({ kelas: req.params.kelasId })
            .populate('mataPelajaran', '_id namaMapel')
            .populate('guru', '_id name');
        res.json({ data: jadwalKelas });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/jadwal/saya', protect, authorize('siswa'), async (req, res) => {
    try {
        const kelasSiswa = await Kelas.findOne({ siswa: req.user._id });
        if (!kelasSiswa) return res.json({ data: [] });
        const jadwalKelas = await Jadwal.find({ kelas: kelasSiswa._id }).sort({ jamMulai: 'asc' }).populate('mataPelajaran', 'namaMapel').populate('guru', 'name');
        res.json({ data: jadwalKelas });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/jadwal/guru/saya', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        let jadwalGuru = await Jadwal.find({ guru: req.user._id }).sort({ jamMulai: 'asc' }).populate('mataPelajaran', 'namaMapel').populate('kelas', 'namaKelas');
        jadwalGuru = jadwalGuru.filter(j => j.mataPelajaran && j.kelas);
        res.json({ data: jadwalGuru });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.delete('/jadwal/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const deletedJadwal = await Jadwal.findByIdAndDelete(req.params.id);
        if (!deletedJadwal) return res.status(404).json({ message: 'Entri jadwal tidak ditemukan' });
        res.json({ message: 'Jadwal berhasil dihapus' });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// =================================================================
// --- RUTE TUGAS, MATERI, NILAI, ABSENSI ---
// =================================================================
router.post('/materi/upload', protect, authorize('guru', 'permission'), uploadMateri.single('fileMateri'), async (req, res) => {
    try {
        const { judul, deskripsi, kelas, mataPelajaran } = req.body;
        if (!req.file) return res.status(400).json({ message: 'File materi wajib diunggah.' });
        const newMateri = await Materi.create({ judul, deskripsi, kelas, mataPelajaran, namaFile: req.file.originalname, pathFile: `/uploads/${req.file.filename}`, diunggahOleh: req.user._id });
        res.status(201).json({ message: 'Materi berhasil diunggah', data: newMateri });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/materi/by-kelas/:kelasId', protect, authorize('siswa', 'guru', 'permission'), async (req, res) => {
    try {
        const daftarMateri = await Materi.find({ kelas: req.params.kelasId }).populate('mataPelajaran', 'namaMapel').populate('diunggahOleh', 'name').sort({ createdAt: -1 });
        res.json({ data: daftarMateri });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.post('/tugas', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const { judul, deskripsi, kelas, mataPelajaran, deadline } = req.body;
        const tugasBaru = await Tugas.create({ judul, deskripsi, kelas, mataPelajaran, deadline, diberikanOleh: req.user._id });
        res.status(201).json({ message: 'Tugas berhasil dibuat', data: tugasBaru });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/tugas/by-kelas/:kelasId', protect, authorize('siswa', 'guru', 'permission'), async (req, res) => {
    try {
        const daftarTugas = await Tugas.find({ kelas: req.params.kelasId }).populate('mataPelajaran', 'namaMapel').populate('diberikanOleh', 'name').sort({ createdAt: -1 }).lean();
        const pengumpulanSiswa = await PengumpulanTugas.find({ siswa: req.user._id }).select('tugas');
        const idTugasTerkumpul = new Set(pengumpulanSiswa.map(p => p.tugas.toString()));
        const tugasDenganStatus = daftarTugas.map(tugas => ({ ...tugas, sudahTerkumpul: idTugasTerkumpul.has(tugas._id.toString()) }));
        res.json({ data: tugasDenganStatus });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/tugas/guru/saya', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        let daftarTugas = await Tugas.find({ diberikanOleh: req.user._id })
            .populate('kelas', '_id namaKelas')
            .populate('mataPelajaran', '_id namaMapel')
            .sort({ createdAt: -1 });
        daftarTugas = daftarTugas.filter(t => t.kelas && t.mataPelajaran);
        res.json({ data: daftarTugas });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.post('/tugas/:tugasId/submit', protect, authorize('siswa'), uploadTugas.single('fileTugas'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'File tugas wajib diunggah.' });
        const pengumpulan = await PengumpulanTugas.create({ tugas: req.params.tugasId, siswa: req.user._id, namaFile: req.file.originalname, pathFile: `/uploads/tugas/${req.file.filename}` });
        res.status(201).json({ message: 'Tugas berhasil dikumpulkan!', data: pengumpulan });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'Anda sudah pernah mengumpulkan tugas ini.' });
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});
router.get('/pengumpulan/by-tugas/:tugasId', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const daftarPengumpulan = await PengumpulanTugas.find({ tugas: req.params.tugasId }).populate('siswa', 'name');
        res.json({ data: daftarPengumpulan });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.put('/pengumpulan/:pengumpulanId/nilai', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const { nilai, siswaId, mataPelajaranId } = req.body;
        const pengumpulan = await PengumpulanTugas.findByIdAndUpdate(req.params.pengumpulanId, { nilai }, { new: true });
        if (!pengumpulan) return res.status(404).json({ message: 'Data pengumpulan tidak ditemukan' });
        await TugasNilai.findOneAndUpdate({ tugas: pengumpulan.tugas, siswa: siswaId }, { siswa: siswaId, mataPelajaran: mataPelajaranId, tugas: pengumpulan.tugas, jenis: 'TUGAS', nilai: nilai, diberikanOleh: req.user._id }, { upsert: true, new: true });
        res.json({ message: 'Nilai berhasil disimpan', data: pengumpulan });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.post('/penilaian', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const { siswa, mataPelajaran, jenis, nilai } = req.body;
        const penilaianBaru = await TugasNilai.create({ siswa, mataPelajaran, jenis, nilai, diberikanOleh: req.user._id });
        res.status(201).json({ message: 'Nilai berhasil dimasukkan', data: penilaianBaru });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/penilaian/saya', protect, authorize('siswa'), async (req, res) => {
    try {
        const nilaiSaya = await TugasNilai.find({ siswa: req.user._id }).populate('mataPelajaran', 'namaMapel').populate('diberikanOleh', 'name');
        res.json({ data: nilaiSaya });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.post('/absensi', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const { kelas, mataPelajaran, tanggal, absensi } = req.body;
        const bulkOps = absensi.map(item => ({ updateOne: { filter: { siswa: item.siswa, tanggal: new Date(tanggal), mataPelajaran }, update: { $set: { status: item.status, kelas: kelas, dicatatOleh: req.user._id } }, upsert: true } }));
        await Absensi.bulkWrite(bulkOps);
        res.status(200).json({ message: 'Absensi berhasil disimpan.' });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/absensi/saya', protect, authorize('siswa'), async (req, res) => {
    try {
        const daftarAbsensi = await Absensi.find({ siswa: req.user._id }).populate('mataPelajaran', 'namaMapel').sort({ tanggal: -1 });
        res.json({ data: daftarAbsensi });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// =================================================================
// --- RUTE TATA USAHA ---
// =================================================================
router.post('/jenis-pembayaran', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const { nama, deskripsi, jumlah } = req.body;
        const jenisPembayaran = await JenisPembayaran.create({ nama, deskripsi, jumlah });
        res.status(201).json({ message: 'Jenis Pembayaran berhasil dibuat', data: jenisPembayaran });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/jenis-pembayaran', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const daftarJenis = await JenisPembayaran.find().sort({ createdAt: -1 });
        res.json({ data: daftarJenis });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.delete('/jenis-pembayaran/:id', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const jenis = await JenisPembayaran.findByIdAndDelete(req.params.id);
        if (!jenis) return res.status(404).json({ message: 'Jenis pembayaran tidak ditemukan' });
        res.json({ message: 'Jenis pembayaran berhasil dihapus' });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.post('/pembayaran', protect, authorize('tata_usaha', 'permission'), async (req, res) => {
    try {
        const { siswa, jenisPembayaran, jumlahBayar, status, keterangan } = req.body;
        const pembayaran = await Pembayaran.create({ siswa, jenisPembayaran, jumlahBayar, status, keterangan, dicatatOleh: req.user._id });
        res.status(201).json({ message: 'Pembayaran berhasil dicatat', data: pembayaran });
    } catch (error) {
        if (error.code === 11000) { return res.status(400).json({ message: 'Siswa ini sudah lunas untuk jenis pembayaran ini.' }); }
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});
router.get('/pembayaran', protect, authorize('tata_usaha', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const riwayat = await Pembayaran.find({})
            .populate('siswa', 'name')
            .populate('jenisPembayaran', 'nama jumlah')
            .populate('dicatatOleh', 'name')
            .sort({ tanggalBayar: -1 });
        res.json({ data: riwayat });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// =================================================================
// --- RUTE PENGUMUMAN ---
// =================================================================
router.post('/pengumuman', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const { judul, isi, ditujukanUntuk } = req.body;
        const pengumuman = await Pengumuman.create({ judul, isi, ditujukanUntuk, dibuatOleh: req.user._id });
        res.status(201).json({ message: 'Pengumuman berhasil dibuat', data: pengumuman });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/pengumuman', protect, async (req, res) => {
    try {
        const pengumuman = await Pengumuman.find({ $or: [ { ditujukanUntuk: 'semua' }, { ditujukanUntuk: req.user.role } ] }).populate('dibuatOleh', 'name').sort({ createdAt: -1 });
        res.json({ data: pengumuman });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.delete('/pengumuman/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const pengumuman = await Pengumuman.findByIdAndDelete(req.params.id);
        if (!pengumuman) return res.status(404).json({ message: 'Pengumuman tidak ditemukan' });
        res.json({ message: 'Pengumuman berhasil dihapus.' });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});


// --- Ekspor Router (WAJIB PALING BAWAH) ---
module.exports = router;
