// routes/api.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

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

// --- Konfigurasi Multer untuk File Upload (diletakkan di atas sebelum dipakai) ---
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


// =================================================================
// --- RUTE DASBOR & DATA KHUSUS ---
// =================================================================

// @desc    Siswa mendapatkan data lengkap untuk dasbornya
router.get('/dashboard/siswa', protect, authorize('siswa'), async (req, res) => {
    try {
        const siswaId = req.user._id;
        const semuaNilai = await TugasNilai.find({ siswa: siswaId }).populate('mataPelajaran', 'namaMapel');
        const ringkasan = { tugasBelumSelesai: 1, ujianMendatang: 3, persentaseKehadiran: 95 }; // Data dummy
        const nilaiPerMapel = {};
        semuaNilai.forEach(item => {
            if (item.mataPelajaran) {
                const namaMapel = item.mataPelajaran.namaMapel;
                if (!nilaiPerMapel[namaMapel]) {
                    nilaiPerMapel[namaMapel] = { total: 0, count: 0 };
                }
                nilaiPerMapel[namaMapel].total += item.nilai;
                nilaiPerMapel[namaMapel].count += 1;
            }
        });
        const performaNilai = {
            labels: Object.keys(nilaiPerMapel),
            data: Object.values(nilaiPerMapel).map(mapel => mapel.total / mapel.count)
        };
        res.json({ ringkasan, performaNilai });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// @desc    Guru mendapatkan data ringkasan untuk dasbornya
router.get('/dashboard/guru', protect, authorize('guru', 'permission'), async (req, res) => {
    try {
        const guruId = req.user._id;
        const kelasIds = await Jadwal.find({ guru: guruId }).distinct('kelas');
        const kelasData = await Kelas.find({ '_id': { $in: kelasIds } });
        const totalSiswa = kelasData.reduce((sum, kelas) => sum + kelas.siswa.length, 0);
        const ringkasan = { jumlahKelas: kelasIds.length, totalSiswa: totalSiswa, jadwalHariIni: 5 }; // Data dummy
        res.json({ ringkasan });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// @desc    Pimpinan mendapatkan data ringkasan untuk dasbornya
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
// --- RUTE MANAJEMEN PENGGUNA ---
// =================================================================

// @desc    Admin membuat user baru (pimpinan, akademik)
router.post('/users/create', protect, authorize('permission'), async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        if (!email || !password || !name || !role) return res.status(400).json({ message: 'Semua field wajib diisi' });
        if (await User.findOne({ email })) return res.status(400).json({ message: 'Email sudah digunakan' });
        const user = await User.create({ email, password, name, role, status: 'approved' });
        const userResult = { _id: user._id, id: user._id, email: user.email, name: user.name, role: user.role, status: user.status };
        res.status(201).json({ message: `User ${role} berhasil dibuat`, data: userResult });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// @desc    Admin/Pimpinan melihat daftar semua user
router.get('/users', protect, authorize('akademik', 'pimpinan', 'permission'), async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json({ count: users.length, data: users });
    } catch (error) { res.status(500).json({ message: "Server Error" }); }
});

// @desc    Admin melihat daftar user yang statusnya 'pending'
router.get('/users/pending', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const users = await User.find({ status: 'pending' }).select('-password');
        res.json({ data: users });
    } catch(error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// @desc    Admin mendapatkan semua user dengan peran tertentu (guru/siswa)
router.get('/users/by-role/:role', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const validRoles = ['guru', 'siswa'];
        if (!validRoles.includes(req.params.role)) return res.status(400).json({ message: 'Peran tidak valid.' });
        const users = await User.find({ role: req.params.role }).select('name');
        res.json({ data: users });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});

// @desc    Admin mengupdate data seorang pengguna
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

// @desc    Admin menyetujui user yang mendaftar
router.put('/users/approve/:id', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
        if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });
        res.json({ message: `User ${user.name} telah disetujui.` });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

// @desc    Admin menghapus seorang pengguna
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
// ----------------- RUTE MANAJEMEN MATA PELAJARAN -----------------
// =================================================================
router.post('/matapelajaran', protect, authorize('akademik', 'permission'), async (req, res) => {
    try {
        const { kodeMapel, namaMapel } = req.body;
        if (await MataPelajaran.findOne({ kodeMapel })) return res.status(400).json({ message: 'Kode Mata Pelajaran sudah ada' });
        const mataPelajaran = await MataPelajaran.create({ kodeMapel, namaMapel });
        res.status(201).json({ message: 'Mata Pelajaran berhasil dibuat', data: mataPelajaran });
    } catch (error) { res.status(500).json({ message: 'Server Error', error: error.message }); }
});
router.get('/matapelajaran', protect, authorize('akademik', 'pimpinan', 'permission'), async (req, res) => {
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
// --------------------- RUTE MANAJEMEN KELAS ----------------------
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
// ------------------- RUTE MANAJEMEN JADWAL ---------------------
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
            .populate('mataPelajaran', '_id namaMapel') // PERBAIKAN KRITIS
            .populate('guru', '_id name'); // PERBAIKAN KRITIS
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
        const jadwalGuru = await Jadwal.find({ guru: req.user._id }).sort({ jamMulai: 'asc' }).populate('mataPelajaran', 'namaMapel').populate('kelas', 'namaKelas');
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
// ----------------- RUTE TUGAS, MATERI, NILAI, ABSENSI -------------------
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
        const daftarTugas = await Tugas.find({ diberikanOleh: req.user._id })
            .populate('kelas', '_id namaKelas')
            .populate('mataPelajaran', '_id namaMapel')
            .sort({ createdAt: -1 });
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

// --- Ekspor Router (WAJIB PALING BAWAH) ---
module.exports = router;
