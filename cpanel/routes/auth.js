const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../database');

const router = express.Router();

// Security: Ensure JWT_SECRET is set
if (!process.env.JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables!');
}
const SECRET_KEY = process.env.JWT_SECRET;

// Register
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 8);

    try {
        const sql = `
            INSERT INTO users (name, email, password, role) 
            VALUES ($1, $2, $3, 'customer') 
            RETURNING id
        `;
        const { rows } = await query(sql, [name, email, hashedPassword]);
        const userId = rows[0].id;

        const token = jwt.sign({ id: userId, role: 'customer' }, SECRET_KEY, { expiresIn: 86400 });

        res.status(200).send({
            auth: true,
            token: token,
            user: { id: userId, name, email, role: 'customer' }
        });
    } catch (err) {
        console.error("Register error:", err);
        if (err.code === '23505') {
            return res.status(500).send({ error: 'Email already exists.' });
        }
        return res.status(500).send({ error: 'Server error during registration.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
        const user = rows[0];

        if (!user) return res.status(404).send('No user found.');

        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(401).send({ auth: false, token: null });

        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: 86400 });

        res.status(200).send({
            auth: true,
            token: token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                loyaltyPoints: user.loyalty_points || 0,
            }
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).send('Error on the server.');
    }
});

// Get Current User (Me)
router.get('/me', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) return res.status(401).send({ error: 'No token provided.' });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const { rows } = await query(
            "SELECT id, name, email, role, loyalty_points, default_branch_id FROM users WHERE id = $1",
            [decoded.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).send({ error: 'User not found.' });
        }

        const user = rows[0];
        res.status(200).send({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                loyaltyPoints: user.loyalty_points || 0,
                defaultBranchId: user.default_branch_id
            }
        });
    } catch (err) {
        console.error("Get user error:", err);
        return res.status(500).send({ error: 'Failed to authenticate token.' });
    }
});

// Refresh Token
router.post('/refresh-token', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) return res.status(401).send({ error: 'No token provided.' });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const newToken = jwt.sign({ id: decoded.id, role: decoded.role }, SECRET_KEY, { expiresIn: 86400 });
        
        res.status(200).send({
            auth: true,
            token: newToken
        });
    } catch (err) {
        return res.status(401).send({ error: 'Token expired or invalid.' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.status(200).send({ auth: false, token: null, message: 'Logged out successfully.' });
});

// Request Password Reset
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const { rows } = await query("SELECT id, name FROM users WHERE email = $1", [email]);
        
        if (rows.length === 0) {
            return res.status(200).json({ 
                message: 'If this email exists, a reset link will be sent.' 
            });
        }

        const user = rows[0];
        
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const resetExpiry = new Date(Date.now() + 3600000);

        await query(`
            UPDATE users 
            SET reset_token = $1, reset_token_expiry = $2 
            WHERE id = $3
        `, [resetTokenHash, resetExpiry, user.id]);

        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
        
        console.log(`📧 Password reset requested for ${email}`);
        console.log(`🔗 Reset URL: ${resetUrl}`);

        res.status(200).json({ 
            message: 'If this email exists, a reset link will be sent.',
            resetUrl: process.env.NODE_ENV !== 'production' ? resetUrl : undefined
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reset Password with Token
router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        const { rows } = await query(`
            SELECT id, email FROM users 
            WHERE reset_token = $1 AND reset_token_expiry > NOW()
        `, [tokenHash]);

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const user = rows[0];
        const hashedPassword = bcrypt.hashSync(newPassword, 8);
        
        await query(`
            UPDATE users 
            SET password = $1, reset_token = NULL, reset_token_expiry = NULL 
            WHERE id = $2
        `, [hashedPassword, user.id]);

        console.log(`✅ Password reset successful for ${user.email}`);
        res.status(200).json({ message: 'Password has been reset successfully' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Google OAuth Login/Register
router.post('/google', async (req, res) => {
    const { googleId, email, name, picture } = req.body;
    
    if (!googleId || !email) {
        return res.status(400).json({ error: 'Google ID and email are required' });
    }

    try {
        let { rows } = await query(
            "SELECT * FROM users WHERE google_id = $1 OR email = $2",
            [googleId, email]
        );

        let user;

        if (rows.length === 0) {
            const { rows: newUserRows } = await query(`
                INSERT INTO users (name, email, google_id, avatar, role, password)
                VALUES ($1, $2, $3, $4, 'customer', '')
                RETURNING id, name, email, role
            `, [name, email, googleId, picture]);
            user = newUserRows[0];
        } else {
            user = rows[0];
            if (!user.google_id || !user.avatar) {
                await query(`
                    UPDATE users SET google_id = $1, avatar = COALESCE(avatar, $2) WHERE id = $3
                `, [googleId, picture, user.id]);
            }
        }

        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: 86400 });

        res.status(200).json({
            auth: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: picture || user.avatar
            }
        });
    } catch (err) {
        console.error('Google auth error:', err);
        res.status(500).json({ error: 'Server error during Google authentication' });
    }
});

// Facebook OAuth Login/Register
router.post('/facebook', async (req, res) => {
    const { facebookId, email, name, picture } = req.body;
    
    if (!facebookId) {
        return res.status(400).json({ error: 'Facebook ID is required' });
    }

    try {
        let { rows } = await query(
            "SELECT * FROM users WHERE facebook_id = $1 OR (email = $2 AND email IS NOT NULL)",
            [facebookId, email]
        );

        let user;

        if (rows.length === 0) {
            const { rows: newUserRows } = await query(`
                INSERT INTO users (name, email, facebook_id, avatar, role, password)
                VALUES ($1, $2, $3, $4, 'customer', '')
                RETURNING id, name, email, role
            `, [name, email || null, facebookId, picture]);
            user = newUserRows[0];
        } else {
            user = rows[0];
            if (!user.facebook_id || !user.avatar) {
                await query(`
                    UPDATE users SET facebook_id = $1, avatar = COALESCE(avatar, $2) WHERE id = $3
                `, [facebookId, picture, user.id]);
            }
        }

        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: 86400 });

        res.status(200).json({
            auth: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: picture || user.avatar
            }
        });
    } catch (err) {
        console.error('Facebook auth error:', err);
        res.status(500).json({ error: 'Server error during Facebook authentication' });
    }
});

module.exports = router;
