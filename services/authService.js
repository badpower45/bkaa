/**
 * Auth Service
 * Handles all authentication-related business logic
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../database.js';

// ✅ Security: Ensure JWT_SECRET is set
if (!process.env.JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables!');
}
const SECRET_KEY = process.env.JWT_SECRET;

// Token expiration times
const TOKEN_EXPIRY = {
    access: '24h',
    refresh: '7d',
    passwordReset: '1h'
};

// Bcrypt configuration
const BCRYPT_ROUNDS = 12;

/**
 * Hash a password
 */
export const hashPassword = (password) => {
    return bcrypt.hashSync(password, BCRYPT_ROUNDS);
};

/**
 * Compare password with hash
 */
export const comparePassword = (password, hash) => {
    return bcrypt.compareSync(password, hash);
};

/**
 * Generate access token
 */
export const generateAccessToken = (user) => {
    return jwt.sign(
        { id: user.id, role: user.role },
        SECRET_KEY,
        { expiresIn: TOKEN_EXPIRY.access }
    );
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (user) => {
    return jwt.sign(
        { id: user.id, type: 'refresh' },
        SECRET_KEY,
        { expiresIn: TOKEN_EXPIRY.refresh }
    );
};

/**
 * Verify token
 */
export const verifyToken = (token) => {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (err) {
        return null;
    }
};

/**
 * Generate password reset token
 */
export const generatePasswordResetToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Register a new user
 */
export const registerUser = async (userData) => {
    const { name, email, password, phone } = userData;
    
    // Check if email already exists
    const { rows: existing } = await query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
    );
    
    if (existing.length > 0) {
        throw new Error('EMAIL_EXISTS');
    }
    
    const hashedPassword = hashPassword(password);
    
    const { rows } = await query(
        `INSERT INTO users (name, email, password, role, phone) 
         VALUES ($1, $2, $3, 'customer', $4) 
         RETURNING id, name, email, role`,
        [name, email.toLowerCase(), hashedPassword, phone || null]
    );
    
    const user = rows[0];
    const token = generateAccessToken(user);
    
    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        },
        token
    };
};

/**
 * Login user
 */
export const loginUser = async (email, password) => {
    const { rows } = await query(
        'SELECT * FROM users WHERE email = $1',
        [email.toLowerCase()]
    );
    
    if (rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
    }
    
    const user = rows[0];
    
    if (!comparePassword(password, user.password)) {
        throw new Error('INVALID_PASSWORD');
    }
    
    const token = generateAccessToken(user);
    
    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            loyaltyPoints: user.loyalty_points || 0
        },
        token
    };
};

/**
 * Get user by ID
 */
export const getUserById = async (userId) => {
    const { rows } = await query(
        'SELECT id, name, email, role, phone, loyalty_points, default_branch_id FROM users WHERE id = $1',
        [userId]
    );
    
    return rows[0] || null;
};

/**
 * Get user by email
 */
export const getUserByEmail = async (email) => {
    const { rows } = await query(
        'SELECT id, name, email, role FROM users WHERE email = $1',
        [email.toLowerCase()]
    );
    
    return rows[0] || null;
};

/**
 * Update user profile
 */
export const updateUserProfile = async (userId, updates) => {
    const allowedFields = ['name', 'phone', 'default_branch_id'];
    const setClauses = [];
    const values = [userId];
    let paramIndex = 2;
    
    for (const [key, value] of Object.entries(updates)) {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        
        if (allowedFields.includes(snakeKey) && value !== undefined) {
            setClauses.push(`${snakeKey} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }
    }
    
    if (setClauses.length === 0) {
        throw new Error('No valid fields to update');
    }
    
    const { rows } = await query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1 RETURNING id, name, email, role, phone, default_branch_id`,
        values
    );
    
    return rows[0];
};

/**
 * Change user password
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
    const { rows } = await query('SELECT password FROM users WHERE id = $1', [userId]);
    
    if (rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
    }
    
    if (!comparePassword(currentPassword, rows[0].password)) {
        throw new Error('INVALID_PASSWORD');
    }
    
    const hashedPassword = hashPassword(newPassword);
    
    await query(
        'UPDATE users SET password = $1 WHERE id = $2',
        [hashedPassword, userId]
    );
    
    return true;
};

/**
 * Request password reset
 */
export const requestPasswordReset = async (email) => {
    const user = await getUserByEmail(email);
    
    if (!user) {
        // Don't reveal if email exists
        return { sent: true };
    }
    
    const resetToken = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour
    
    await query(
        `UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3`,
        [resetToken, expiresAt, user.id]
    );
    
    // In production, send email here
    // For now, return the token (remove in production!)
    return { sent: true, token: resetToken }; // Remove token in production
};

/**
 * Reset password with token
 */
export const resetPassword = async (resetToken, newPassword) => {
    const { rows } = await query(
        `SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()`,
        [resetToken]
    );
    
    if (rows.length === 0) {
        throw new Error('INVALID_OR_EXPIRED_TOKEN');
    }
    
    const hashedPassword = hashPassword(newPassword);
    
    await query(
        `UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2`,
        [hashedPassword, rows[0].id]
    );
    
    return true;
};

/**
 * Update loyalty points
 */
export const updateLoyaltyPoints = async (userId, points, operation = 'add') => {
    let sql;
    
    if (operation === 'add') {
        sql = 'UPDATE users SET loyalty_points = COALESCE(loyalty_points, 0) + $1 WHERE id = $2 RETURNING loyalty_points';
    } else if (operation === 'subtract') {
        sql = 'UPDATE users SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - $1) WHERE id = $2 RETURNING loyalty_points';
    } else if (operation === 'set') {
        sql = 'UPDATE users SET loyalty_points = $1 WHERE id = $2 RETURNING loyalty_points';
    } else {
        throw new Error('Invalid operation');
    }
    
    const { rows } = await query(sql, [points, userId]);
    return rows[0]?.loyalty_points || 0;
};

export default {
    hashPassword,
    comparePassword,
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    registerUser,
    loginUser,
    getUserById,
    getUserByEmail,
    updateUserProfile,
    changePassword,
    requestPasswordReset,
    resetPassword,
    updateLoyaltyPoints
};
