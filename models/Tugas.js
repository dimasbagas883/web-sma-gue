const mongoose = require('mongoose');

const TugasSchema = new mongoose.Schema({
    judul: {
        type: String,
        required: true,
        trim: true
    },
    deskripsi: {
        type: String,
        trim: true
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
    diberikanOleh: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    deadline: {
        type: Date
    }
}, { timestamps: true });

module.exports = mongoose.model('Tugas', TugasSchema);