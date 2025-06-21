// models/Pengumuman.js
const mongoose = require('mongoose');

const PengumumanSchema = new mongoose.Schema({
    judul: {
        type: String,
        required: [true, 'Judul wajib diisi'],
        trim: true
    },
    isi: {
        type: String,
        required: [true, 'Isi pengumuman wajib diisi']
    },
    // Menentukan kepada siapa pengumuman ini ditujukan
    ditujukanUntuk: [{
        type: String,
        enum: ['semua', 'siswa', 'guru', 'pimpinan', 'tata_usaha', 'akademik'],
        required: true
    }],
    dibuatOleh: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Pengumuman', PengumumanSchema);
