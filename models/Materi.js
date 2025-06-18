const mongoose = require('mongoose');

const MateriSchema = new mongoose.Schema({
    judul: {
        type: String,
        required: true,
        trim: true
    },
    deskripsi: {
        type: String,
        trim: true
    },
    namaFile: {
        type: String,
        required: true
    },
    pathFile: {
        type: String,
        required: true
    },
    kelas: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Kelas',
        required: true
    },
    mataPelajaran: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MataPelajaran',
        required: true
    },
    diunggahOleh: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Materi', MateriSchema);