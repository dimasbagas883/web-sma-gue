// models/MataPelajaran.js
const mongoose = require('mongoose');

const MataPelajaranSchema = new mongoose.Schema({
    kodeMapel: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    namaMapel: {
        type: String,
        required: true,
        trim: true
    },
    // Menambahkan referensi ke guru yang mengajar mapel ini
    // Bisa jadi satu mapel diajar banyak guru (Array of User IDs)
    pengajar: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, { timestamps: true });

module.exports = mongoose.model('MataPelajaran', MataPelajaranSchema);