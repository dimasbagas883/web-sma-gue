const mongoose = require('mongoose');

const PengumpulanTugasSchema = new mongoose.Schema({
    tugas: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tugas',
        required: true
    },
    siswa: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    namaFile: {
        type: String,
        required: true
    },
    pathFile: {
        type: String,
        required: true
    },
    waktuPengumpulan: {
        type: Date,
        default: Date.now
    },
    nilai: {
        type: Number,
        min: 0,
        max: 100
    }
}, { timestamps: true });

// Mencegah siswa mengumpulkan tugas yang sama lebih dari sekali
PengumpulanTugasSchema.index({ tugas: 1, siswa: 1 }, { unique: true });

module.exports = mongoose.model('PengumpulanTugas', PengumpulanTugasSchema);