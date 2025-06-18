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
        type: String, // Contoh: "Tugas Harian", "Ujian Tengah Semester", "Ujian Akhir"
        enum: ['TUGAS', 'UTS', 'UAS'],
        required: true
    },
    deskripsi: {
        type: String,
        trim: true
    },
    nilai: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    // Diserahkan oleh guru yang mana
    diberikanOleh: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('TugasNilai', TugasNilaiSchema);