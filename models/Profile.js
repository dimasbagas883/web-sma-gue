// File baru: models/Profile.js
const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema({
    // Membuat hubungan satu-ke-satu dengan model User
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // Setiap user hanya punya satu profil
    },
    nisn: {
        type: String,
        trim: true,
        default: ''
    },
    alamat: {
        type: String,
        trim: true,
        default: ''
    },
    noTelepon: {
        type: String,
        trim: true,
        default: ''
    },
    namaOrangTua: {
        type: String,
        trim: true,
        default: ''
    },
    fotoProfil: {
        type: String,
        default: '' // Akan menyimpan path ke file gambar, e.g., /uploads/profil/12345.jpg
    }
}, { timestamps: true });

module.exports = mongoose.model('Profile', ProfileSchema);
