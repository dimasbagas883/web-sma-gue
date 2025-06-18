    // models/Otp.js
    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');

    const OtpSchema = new mongoose.Schema({
        email: {
            type: String,
            required: true
        },
        otp: {
            type: String,
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 300 // OTP akan otomatis terhapus dari DB setelah 5 menit (300 detik)
        }
    });

    // Hash OTP sebelum disimpan
    OtpSchema.pre('save', async function (next) {
        if (!this.isModified('otp')) {
            next();
        }
        const salt = await bcrypt.genSalt(10);
        this.otp = await bcrypt.hash(this.otp, salt);
        next();
    });

    module.exports = mongoose.model('Otp', OtpSchema);
    