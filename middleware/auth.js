import jwt from 'jsonwebtoken';
import db from '../database.js';

// ✅ Security: Ensure JWT_SECRET is set, never use fallback
if (!process.env.JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables!');
}
const SECRET_KEY = process.env.JWT_SECRET;

export const verifyToken = (req, res, next) => {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) return res.status(403).send({ auth: false, message: 'No token provided.' });

    const token = tokenHeader.split(' ')[1]; // Bearer <token>

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(500).send({ auth: false, message: 'Failed to authenticate token.' });

        // Save to request for use in other routes
        req.userId = decoded.id;
        req.userRole = decoded.role;
        req.user = { id: decoded.id, userId: decoded.id, role: decoded.role };
        next();
    });
};

// Alias for verifyToken - used by newer routes
export const authenticateToken = verifyToken;

// Optional authentication - doesn't reject if no token, just doesn't set userId
export const optionalAuth = (req, res, next) => {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) {
        // No token - continue as guest
        req.userId = null;
        req.userRole = null;
        req.isGuest = true;
        return next();
    }

    const token = tokenHeader.split(' ')[1]; // Bearer <token>

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            // Invalid token - continue as guest
            req.userId = null;
            req.userRole = null;
            req.isGuest = true;
            return next();
        }

        // Valid token - set user info
        req.userId = decoded.id;
        req.userRole = decoded.role;
        req.isGuest = false;
        next();
    });
};

export const isAdmin = (req, res, next) => {
    console.log('🔐 isAdmin check - userRole:', req.userRole);
    const adminRoles = ['admin', 'owner', 'manager'];
    if (!adminRoles.includes(req.userRole)) {
        console.log('❌ Role not in adminRoles:', adminRoles);
        return res.status(403).send({ message: "Require Admin Role!" });
    }
    console.log('✅ Admin access granted');
    next();
};

export const isEmployee = (req, res, next) => {
    const employeeRoles = ['admin', 'owner', 'manager', 'employee', 'distributor'];
    if (!employeeRoles.includes(req.userRole)) {
        return res.status(403).send({ message: "Require Employee Role!" });
    }
    next();
};
