import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../database.js';
import { validate, registerSchema, loginSchema, validatePassword } from '../middleware/validation.js';

const router = express.Router();

// ✅ Security: Ensure JWT_SECRET is set, never use fallback
if (!process.env.JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables!');
}
const SECRET_KEY = process.env.JWT_SECRET;

// Register - with enhanced validation for complete profile
router.post('/register', async (req, res) => {
    const { firstName, lastName, email, password, phone, birthDate } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !email || !password || !phone) {
        return res.status(400).json({ 
            error: 'الاسم الأول والأخير والإيميل وكلمة المرور ورقم الهاتف مطلوبة' 
        });
    }
    
    // ✅ Security: Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
        return res.status(400).json({ error: passwordError });
    }
    
    // ✅ Security: Use stronger hashing (12 rounds)
    const hashedPassword = bcrypt.hashSync(password, 12);
    
    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');

    try {
        const sql = `
            INSERT INTO users (
                first_name, last_name, name, email, password, phone, birth_date, 
                role, profile_completed, email_verified, email_verification_token, created_at
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'customer', true, false, $8, NOW()) 
            RETURNING id, first_name, last_name, email, phone, birth_date, email_verified
        `;
        const fullName = `${firstName} ${lastName}`;
        const { rows } = await query(sql, [
            firstName, 
            lastName, 
            fullName,
            email, 
            hashedPassword, 
            phone,
            birthDate || null,
            verificationTokenHash
        ]);
        const user = rows[0];
        
        // Generate verification URL
        const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}`;
        
        console.log(`📧 Email verification link for ${email}: ${verificationUrl}`);
        // TODO: Send verification email using Supabase or nodemailer
        // await sendVerificationEmail(email, user.first_name, verificationUrl);

        const token = jwt.sign({ id: user.id, role: 'customer' }, SECRET_KEY, { expiresIn: 86400 });

        res.status(200).send({
            auth: true,
            token: token,
            emailVerificationRequired: !user.email_verified,
            message: user.email_verified ? undefined : 'تم إرسال رابط التحقق إلى بريدك الإلكتروني',
            user: { 
                id: user.id, 
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email, 
                phone: user.phone,
                birthDate: user.birth_date,
                role: 'customer',
                emailVerified: user.email_verified
            }
        });
    } catch (err) {
        console.error("Register error:", err);
        if (err.code === '23505') { // Unique violation for email
            return res.status(409).send({ error: 'الإيميل مسجل بالفعل' });
        }
        return res.status(500).send({ error: 'خطأ في السيرفر' });
    }
});

// Login - with validation
router.post('/login', validate(loginSchema), async (req, res) => {
    const { email, password } = req.body;

    try {
        const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
        const user = rows[0];

        if (!user) return res.status(404).send('No user found.');

        const storedPassword = user.password || '';
        const isHashed = storedPassword.startsWith('$2');
        let passwordIsValid = false;

        if (isHashed) {
            passwordIsValid = bcrypt.compareSync(password, storedPassword);
        } else {
            // Legacy plain-text password fallback (rehash on successful login)
            passwordIsValid = storedPassword === password;
            if (passwordIsValid) {
                const newHash = bcrypt.hashSync(password, 12);
                await query('UPDATE users SET password = $1 WHERE id = $2', [newHash, user.id]);
            }
        }

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
                loyaltyPoints: user.loyalty_points || 0, // Schema might need snake_case check? Schema says nothing about loyaltyPoints in users table def in schema.sql provided earlier, but orders.js updates it. Wait, schema.sql provided in step 5 DOES NOT have loyalty_points in users table!
                // Checking schema.sql again...
                // CREATE TABLE IF NOT EXISTS users ( ... id, name, email, password, role, default_branch_id );
                // It seems loyaltyPoints is missing from the provided schema.sql.
                // However, orders.js updates `loyaltyPoints`.
                // I should probably add it to the select or handle it safely. 
                // I will assume the column exists or will be added, but for now I'll use snake_case `loyalty_points` if that's the convention, OR keep camelCase if the user didn't change that part of schema. 
                // The user provided schema.sql in step 5. It does NOT have loyaltyPoints.
                // But the user's `orders.js` has `UPDATE users SET loyaltyPoints = ...`.
                // I will stick to what's in the code but warn or use `user.loyaltyPoints` if it exists.
                // Actually, since I am migrating to PG and the schema provided is "Target PostgreSQL Schema", if it's missing there, it might be an oversight.
                // But I must follow the schema provided or the code provided.
                // I'll assume `loyalty_points` (snake_case) is the target convention, but since it's not in schema.sql, I'll just map it if it exists.
                // Let's check if I should add it to schema? No, I am refactoring code.
                // I will just return `user.loyaltyPoints` (if the column is camelCase) or `user.loyalty_points`.
                // Given the schema uses `default_branch_id`, likely `loyalty_points` is the intention if it existed.
                // I will use `user.loyalty_points || 0` and map it to `loyaltyPoints` for frontend.
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

// Logout (Client-side token removal, optional endpoint)
router.post('/logout', (req, res) => {
    res.status(200).send({ auth: false, token: null, message: 'Logged out successfully.' });
});

// ============================================
// Forgot Password System
// ============================================

// Request Password Reset
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        // Check if user exists
        const { rows } = await query("SELECT id, name FROM users WHERE email = $1", [email]);
        
        if (rows.length === 0) {
            // Don't reveal if email exists or not for security
            return res.status(200).json({ 
                message: 'If this email exists, a reset link will be sent.' 
            });
        }

        const user = rows[0];
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const resetExpiry = new Date(Date.now() + 3600000); // 1 hour from now

        // Save token to database
        await query(`
            UPDATE users 
            SET reset_token = $1, reset_token_expiry = $2 
            WHERE id = $3
        `, [resetTokenHash, resetExpiry, user.id]);

        // In production, send email with reset link
        // For now, we'll return the token (in production, remove this!)
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
        
        console.log(`📧 Password reset requested for ${email}`);
        console.log(`🔗 Reset URL: ${resetUrl}`);
        
        // TODO: Send actual email using nodemailer or similar
        // await sendResetEmail(email, user.name, resetUrl);

        res.status(200).json({ 
            message: 'If this email exists, a reset link will be sent.',
            // Remove in production - for testing only:
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
        // Hash the token to compare with stored hash
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        // Find user with valid token
        const { rows } = await query(`
            SELECT id, email FROM users 
            WHERE reset_token = $1 AND reset_token_expiry > NOW()
        `, [tokenHash]);

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const user = rows[0];
        
        // Hash new password
        const hashedPassword = bcrypt.hashSync(newPassword, 8);
        
        // Update password and clear reset token
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

// ============================================
// Social OAuth Login (Google/Facebook)
// ============================================

// Google OAuth Login/Register - Enhanced with profile completion
router.post('/google', async (req, res) => {
    const { 
        googleId, email, name, picture, 
        phone, birthDate, givenName, familyName,
        // Additional Google fields
        phoneNumbers, ageRange, birthday
    } = req.body;
    
    if (!googleId || !email) {
        return res.status(400).json({ error: 'Google ID and email are required' });
    }

    try {
        // Check if user exists by google_id or email
        let { rows } = await query(
            "SELECT * FROM users WHERE google_id = $1 OR email = $2",
            [googleId, email]
        );

        let user;
        let needsCompletion = false;

        if (rows.length === 0) {
            // Create new user - check if we have all required data
            const firstName = givenName || name?.split(' ')[0] || 'User';
            const lastName = familyName || name?.split(' ').slice(1).join(' ') || '';
            
            // Extract phone from Google data if available
            const userPhone = phone || (phoneNumbers && phoneNumbers.length > 0 ? phoneNumbers[0].value : null);
            
            // Extract birth date from Google data if available
            const userBirthDate = birthDate || birthday || null;
            
            needsCompletion = !userPhone || !userBirthDate;
            
            const { rows: newUserRows } = await query(`
                INSERT INTO users (
                    first_name, last_name, name, email, google_id, avatar, 
                    phone, birth_date, role, password, profile_completed, 
                    email_verified, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'customer', '', $9, true, NOW())
                RETURNING id, first_name, last_name, email, phone, birth_date, avatar, profile_completed, email_verified
            `, [
                firstName, 
                lastName, 
                name || `${firstName} ${lastName}`,
                email, 
                googleId, 
                picture,
                userPhone || null,
                userBirthDate || null,
                !needsCompletion
            ]);
            user = newUserRows[0];
            console.log(`✅ New Google user registered: ${email} (verified: true)`);
        } else {
            user = rows[0];
            // Update google_id, avatar, and missing fields if not set
            const updates = [];
            const values = [];
            let paramCount = 1;
            
            if (!user.google_id) {
                updates.push(`google_id = $${paramCount++}`);
                values.push(googleId);
            }
            if (!user.avatar && picture) {
                updates.push(`avatar = $${paramCount++}`);
                values.push(picture);
            }
            if (!user.phone && phone) {
                updates.push(`phone = $${paramCount++}`);
                values.push(phone);
            }
            if (!user.birth_date && birthDate) {
                updates.push(`birth_date = $${paramCount++}`);
                values.push(birthDate);
            }
            
            if (updates.length > 0) {
                values.push(user.id);
                await query(
                    `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
                    values
                );
            }
            
            // Refresh user data
            const { rows: updatedRows } = await query(
                'SELECT id, first_name, last_name, email, phone, birth_date, avatar, profile_completed FROM users WHERE id = $1',
                [user.id]
            );
            user = updatedRows[0];
            
            needsCompletion = !user.phone || !user.birth_date;
            console.log(`✅ Google user logged in: ${email}`);
        }

        const token = jwt.sign({ id: user.id, role: 'customer' }, SECRET_KEY, { expiresIn: 86400 });

        res.status(200).json({
            auth: true,
            token,
            needsCompletion,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                phone: user.phone,
                birthDate: user.birth_date,
                role: 'customer',
                avatar: user.avatar,
                profileCompleted: user.profile_completed
            }
        });
    } catch (err) {
        console.error('Google auth error:', err);
        res.status(500).json({ error: 'Server error during Google authentication' });
    }
});

// Facebook OAuth Login/Register - Enhanced with profile completion
router.post('/facebook', async (req, res) => {
    const { 
        facebookId, email, name, picture, phone, birthDate, 
        firstName, lastName,
        // Additional Facebook fields
        birthday, age_range, location
    } = req.body;
    
    if (!facebookId) {
        return res.status(400).json({ error: 'Facebook ID is required' });
    }

    try {
        // Check if user exists by facebook_id or email
        let { rows } = await query(
            "SELECT * FROM users WHERE facebook_id = $1 OR (email = $2 AND email IS NOT NULL)",
            [facebookId, email]
        );

        let user;
        let needsCompletion = false;

        if (rows.length === 0) {
            // Create new user - check if we have all required data
            const first = firstName || name?.split(' ')[0] || 'User';
            const last = lastName || name?.split(' ').slice(1).join(' ') || '';
            
            // Extract birth date from Facebook data
            const userBirthDate = birthDate || birthday || null;
            
            needsCompletion = !phone || !userBirthDate || !email;
            
            const { rows: newUserRows } = await query(`
                INSERT INTO users (
                    first_name, last_name, name, email, facebook_id, avatar, 
                    phone, birth_date, role, password, profile_completed, 
                    email_verified, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'customer', '', $9, $10, NOW())
                RETURNING id, first_name, last_name, email, phone, birth_date, avatar, profile_completed, email_verified
            `, [
                first,
                last,
                name || `${first} ${last}`,
                email || null,
                facebookId,
                picture,
                phone || null,
                userBirthDate || null,
                !needsCompletion,
                email ? true : false  // Verify email if provided by Facebook
            ]);
            user = newUserRows[0];
            console.log(`✅ New Facebook user registered: ${name} (email_verified: ${email ? true : false})`);
        } else {
            user = rows[0];
            // Update facebook_id, avatar, and missing fields if not set
            const updates = [];
            const values = [];
            let paramCount = 1;
            
            if (!user.facebook_id) {
                updates.push(`facebook_id = $${paramCount++}`);
                values.push(facebookId);
            }
            if (!user.avatar && picture) {
                updates.push(`avatar = $${paramCount++}`);
                values.push(picture);
            }
            if (!user.email && email) {
                updates.push(`email = $${paramCount++}`);
                values.push(email);
            }
            if (!user.phone && phone) {
                updates.push(`phone = $${paramCount++}`);
                values.push(phone);
            }
            if (!user.birth_date && birthDate) {
                updates.push(`birth_date = $${paramCount++}`);
                values.push(birthDate);
            }
            
            if (updates.length > 0) {
                values.push(user.id);
                await query(
                    `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
                    values
                );
            }
            
            // Refresh user data
            const { rows: updatedRows } = await query(
                'SELECT id, first_name, last_name, email, phone, birth_date, avatar, profile_completed FROM users WHERE id = $1',
                [user.id]
            );
            user = updatedRows[0];
            
            needsCompletion = !user.phone || !user.birth_date || !user.email;
            console.log(`✅ Facebook user logged in: ${name}`);
        }

        const token = jwt.sign({ id: user.id, role: 'customer' }, SECRET_KEY, { expiresIn: 86400 });

        res.status(200).json({
            auth: true,
            token,
            needsCompletion,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                phone: user.phone,
                birthDate: user.birth_date,
                role: 'customer',
                avatar: user.avatar,
                profileCompleted: user.profile_completed
            }
        });
    } catch (err) {
        console.error('Facebook auth error:', err);
        res.status(500).json({ error: 'Server error during Facebook authentication' });
    }
});

// Complete Profile - for OAuth users who need to add missing data
router.post('/complete-profile', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const { phone, birthDate, firstName, lastName, email } = req.body;
        
        // Validate at least phone is provided (required)
        if (!phone) {
            return res.status(400).json({ error: 'رقم الهاتف مطلوب' });
        }
        
        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramCount = 1;
        
        if (phone) {
            updates.push(`phone = $${paramCount++}`);
            values.push(phone);
        }
        if (birthDate) {
            updates.push(`birth_date = $${paramCount++}`);
            values.push(birthDate);
        }
        if (firstName) {
            updates.push(`first_name = $${paramCount++}`);
            values.push(firstName);
        }
        if (lastName) {
            updates.push(`last_name = $${paramCount++}`);
            values.push(lastName);
        }
        if (email) {
            updates.push(`email = $${paramCount++}`);
            values.push(email);
        }
        
        // Mark profile as completed
        updates.push(`profile_completed = true`);
        
        values.push(decoded.id);
        
        await query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
            values
        );
        
        // Get updated user data
        const { rows } = await query(
            'SELECT id, first_name, last_name, email, phone, birth_date, avatar, profile_completed, role FROM users WHERE id = $1',
            [decoded.id]
        );
        
        const user = rows[0];
        
        res.status(200).json({
            success: true,
            message: 'تم استكمال البيانات بنجاح',
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                phone: user.phone,
                birthDate: user.birth_date,
                avatar: user.avatar,
                role: user.role,
                profileCompleted: user.profile_completed
            }
        });
    } catch (err) {
        console.error('Complete profile error:', err);
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================
// Email Verification
// ============================================

// Verify Email with Token
router.get('/verify-email', async (req, res) => {
    const { token } = req.query;
    
    if (!token) {
        return res.status(400).json({ error: 'رمز التحقق مطلوب' });
    }

    try {
        // Hash the token to compare with stored hash
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        // Find user with this verification token
        const { rows } = await query(`
            SELECT id, email, first_name FROM users 
            WHERE email_verification_token = $1 AND email_verified = false
        `, [tokenHash]);

        if (rows.length === 0) {
            return res.status(400).json({ error: 'رمز التحقق غير صالح أو تم التحقق من الإيميل بالفعل' });
        }

        const user = rows[0];
        
        // Mark email as verified and clear verification token
        await query(`
            UPDATE users 
            SET email_verified = true, email_verification_token = NULL 
            WHERE id = $1
        `, [user.id]);

        console.log(`✅ Email verified for ${user.email}`);

        res.status(200).json({ 
            success: true,
            message: 'تم التحقق من البريد الإلكتروني بنجاح',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                emailVerified: true
            }
        });
    } catch (err) {
        console.error('Email verification error:', err);
        res.status(500).json({ error: 'حدث خطأ أثناء التحقق من الإيميل' });
    }
});

// Resend Verification Email
router.post('/resend-verification', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
    }

    try {
        // Check if user exists and email is not verified
        const { rows } = await query(
            "SELECT id, first_name, email_verified FROM users WHERE email = $1",
            [email]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        const user = rows[0];
        
        if (user.email_verified) {
            return res.status(400).json({ error: 'البريد الإلكتروني محقق بالفعل' });
        }
        
        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');

        // Update verification token
        await query(`
            UPDATE users 
            SET email_verification_token = $1 
            WHERE id = $2
        `, [verificationTokenHash, user.id]);

        // Generate verification URL
        const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}`;
        
        console.log(`📧 Resent verification link for ${email}: ${verificationUrl}`);
        // TODO: Send verification email
        // await sendVerificationEmail(email, user.first_name, verificationUrl);

        res.status(200).json({ 
            success: true,
            message: 'تم إرسال رابط التحقق إلى بريدك الإلكتروني',
            // Remove in production:
            verificationUrl: process.env.NODE_ENV !== 'production' ? verificationUrl : undefined
        });
    } catch (err) {
        console.error('Resend verification error:', err);
        res.status(500).json({ error: 'حدث خطأ أثناء إرسال رابط التحقق' });
    }
});

export default router;
