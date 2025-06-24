// models/TugasNilai.js
const mongoose = require('mongoose');

const TugasNilaiSchema = new mongoose.Schema({
    siswa: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    mataPelajaran: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MataPelajaran',
        required: true
    },
    jenis: {
        type: String,
        enum: ['TUGAS', 'UTS', 'UAS'],
        required: true
    },
    // Menghubungkan nilai ini ke tugas spesifik (jika jenisnya TUGAS)
    tugas: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tugas'
    },
    nilai: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    diberikanOleh: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // --- TAMBAHAN KRUSIAL ---
    tahunAjaran: {
        type: String, // Contoh: "2024/2025"
        required: true
    },
    semester: {
        type: String,
        enum: ['Ganjil', 'Genap'],
        required: true
    }
}, { timestamps: true });

// Mencegah duplikasi nilai tugas untuk siswa yang sama
TugasNilaiSchema.index({ siswa: 1, tugas: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('TugasNilai', TugasNilaiSchema);
