// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    // PERUBAHAN DI SINI: dari 'username' menjadi 'email'
    email: {
        type: String,
        required: [true, 'Email wajiab diisi'],
        unique: true,
        trim: true,
        lowercase: true, // Selalu simpan email dalam huruf kecil
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Mohon masukkan alamat email yang valid'
        ]
    },
    password: {
        type: String,
        required: [true, 'Password wajib diisi'],
        minlength: 6
    },
    name: {
        type: String,
        required: [true, 'Nama wajib diisi'],
        trim: true
    },
    role: {
        type: String,
        enum: ['permission', 'pimpinan', 'akademik', 'guru', 'siswa', 'tata_usaha'],
        default: 'siswa'
    },
    status: {
        type: String,
        enum: ['pending', 'approved'],
        default: 'pending'
    }
}, { timestamps: true });

// Enkripsi password sebelum disimpan (tidak ada perubahan)
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Method untuk membandingkan password saat login (tidak ada perubahan)
UserSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
