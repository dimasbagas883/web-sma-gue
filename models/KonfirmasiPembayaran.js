// models/KonfirmasiPembayaran.js
const mongoose = require('mongoose');

const KonfirmasiPembayaranSchema = new mongoose.Schema({
    siswa: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jenisPembayaran: { type: mongoose.Schema.Types.ObjectId, ref: 'JenisPembayaran', required: true },
    jumlah: { type: Number, required: true },
    buktiPembayaran: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    tanggalKonfirmasi: { type: Date, default: Date.now },
    diperiksaOleh: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

module.exports = mongoose.model('KonfirmasiPembayaran', KonfirmasiPembayaranSchema);