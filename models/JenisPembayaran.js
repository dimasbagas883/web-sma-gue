// File baru: models/JenisPembayaran.js
const mongoose = require('mongoose');

const JenisPembayaranSchema = new mongoose.Schema({
    nama: {
        type: String, // Contoh: "SPP Bulan Juli 2025", "Uang Gedung 2025"
        required: true,
        trim: true,
        unique: true
    },
    deskripsi: {
        type: String,
        trim: true
    },
    jumlah: {
        type: Number,
        required: true
    },
    // Menentukan apakah ini tagihan untuk semua siswa atau per kelas
    berlakuUntuk: {
        type: String,
        enum: ['SEMUA_SISWA', 'PER_KELAS', 'PER_SISWA'],
        default: 'SEMUA_SISWA'
    }
}, { timestamps: true });

module.exports = mongoose.model('JenisPembayaran', JenisPembayaranSchema);