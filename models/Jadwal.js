const mongoose = require('mongoose');

const JadwalSchema = new mongoose.Schema({
    kelas: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Kelas',
        required: true
    },
    hari: {
        type: String,
        enum: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
        required: true
    },
    jamMulai: {
        type: String, // Contoh: "07:30"
        required: true
    },
    jamSelesai: {
        type: String, // Contoh: "09:00"
        required: true
    },
    mataPelajaran: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MataPelajaran',
        required: true
    },
    guru: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Jadwal', JadwalSchema);