// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Fungsi untuk melindungi rute (memastikan user sudah login)
exports.protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
            next();
        } catch (error) {
            return res.status(401).json({ message: 'Akses ditolak, token tidak valid' });
        }
    }
    if (!token) {
        return res.status(401).json({ message: 'Akses ditolak, tidak ada token' });
    }
};

// Fungsi untuk otorisasi berdasarkan peran (siapa yang boleh akses)
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: `Peran '${req.user.role}' tidak diizinkan` });
        }
        next();
    };
};