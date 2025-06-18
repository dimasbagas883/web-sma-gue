// models/Kelas.js
const mongoose = require('mongoose');

const KelasSchema = new mongoose.Schema({
    namaKelas: {
        type: String, // Contoh: "10-A", "12-IPS-1"
        required: true,
        unique: true,
        trim: true
    },
    waliKelas: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Referensi ke user dengan role 'guru'
        required: true
    },
    siswa: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Array referensi ke user dengan role 'siswa'
    }]
}, { timestamps: true });

module.exports = mongoose.model('Kelas', KelasSchema);
