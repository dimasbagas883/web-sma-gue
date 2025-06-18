// File: models/Absensi.js
// (Pastikan tidak ada komentar lain di atas baris ini)
const mongoose = require('mongoose');

const AbsensiSchema = new mongoose.Schema({
    siswa: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kelas: { type: mongoose.Schema.Types.ObjectId, ref: 'Kelas', required: true },
    mataPelajaran: { type: mongoose.Schema.Types.ObjectId, ref: 'MataPelajaran', required: true },
    tanggal: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['Hadir', 'Izin', 'Sakit', 'Alpa'],
        required: true
    },
    dicatatOleh: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

AbsensiSchema.index({ siswa: 1, tanggal: 1, mataPelajaran: 1 }, { unique: true });

module.exports = mongoose.model('Absensi', AbsensiSchema);