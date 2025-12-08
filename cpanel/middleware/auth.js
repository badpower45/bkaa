const jwt = require('jsonwebtoken');
const db = require('../database');

// Security: Ensure JWT_SECRET is set
if (!process.env.JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables!');
}
const SECRET_KEY = process.env.JWT_SECRET;

const verifyToken = (req, res, next) => {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) return res.status(403).send({ auth: false, message: 'No token provided.' });

    const token = tokenHeader.split(' ')[1]; // Bearer <token>

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(500).send({ auth: false, message: 'Failed to authenticate token.' });
        req.userId = decoded.id;
        req.userRole = decoded.role;
        next();
    });
};

const optionalAuth = (req, res, next) => {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) {
        req.userId = null;
        req.userRole = null;
        req.isGuest = true;
        return next();
    }

    const token = tokenHeader.split(' ')[1];

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            req.userId = null;
            req.userRole = null;
            req.isGuest = true;
            return next();
        }
        req.userId = decoded.id;
        req.userRole = decoded.role;
        req.isGuest = false;
        next();
    });
};

const isAdmin = (req, res, next) => {
    const adminRoles = ['admin', 'owner', 'manager'];
    if (!adminRoles.includes(req.userRole)) {
        return res.status(403).send({ message: 'Admin access required' });
    }
    next();
};

const isDistributor = (req, res, next) => {
    const allowedRoles = ['admin', 'owner', 'manager', 'distributor'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).send({ message: 'Distributor access required' });
    }
    next();
};

const isDelivery = (req, res, next) => {
    const allowedRoles = ['admin', 'owner', 'delivery'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).send({ message: 'Delivery access required' });
    }
    next();
};

module.exports = {
    verifyToken,
    optionalAuth,
    isAdmin,
    isDistributor,
    isDelivery
};
