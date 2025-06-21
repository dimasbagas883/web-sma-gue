const mongoose = require('mongoose');

const PembayaranSchema = new mongoose.Schema({
    // Siswa yang melakukan pembayaran
    siswa: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    // Jenis tagihan yang dibayar
    jenisPembayaran: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'JenisPembayaran', 
        required: true 
    },
    jumlahBayar: {
        type: Number,
        required: true
    },
    tanggalBayar: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['LUNAS', 'BELUM_LUNAS', 'CICILAN'],
        required: true
    },
    // Dicatat oleh siapa
    dicatatOleh: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    keterangan: {
        type: String,
        trim: true
    }
}, { timestamps: true });

// Mencegah satu siswa membayar jenis tagihan yang sama lebih dari sekali (jika sudah lunas)
// Logika ini bisa disempurnakan lebih lanjut
PembayaranSchema.index({ siswa: 1, jenisPembayaran: 1 }, { unique: true });