import express from 'express';
import { query } from '../database.js';
import { verifyToken } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * Generate unique barcode
 */
function generateBarcode() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `LP${timestamp}${random}`.toUpperCase();
}

/**
 * Create loyalty points redemption barcode
 * Customer converts points to barcode that can be used once
 */
router.post('/create-redemption', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { points_to_redeem } = req.body;

        // Validation: minimum 1000 points
        if (!points_to_redeem || points_to_redeem < 1000) {
            return res.status(400).json({ 
                error: 'الحد الأدنى للاستبدال 1000 نقطة' 
            });
        }

        // Validation: must be multiple of 1000
        if (points_to_redeem % 1000 !== 0) {
            return res.status(400).json({ 
                error: 'يجب أن يكون عدد النقاط من مضاعفات 1000 (مثال: 1000، 2000، 3000)' 
            });
        }

        await query('BEGIN');

        // Get user's current points
        const { rows: users } = await query(
            'SELECT loyalty_points FROM users WHERE id = $1',
            [userId]
        );

        if (users.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        const currentPoints = users[0].loyalty_points || 0;

        if (currentPoints < points_to_redeem) {
            await query('ROLLBACK');
            return res.status(400).json({ 
                error: `رصيدك الحالي ${currentPoints} نقطة، لا يمكنك استبدال ${points_to_redeem} نقطة` 
            });
        }

        // Generate unique barcode
        let barcode = generateBarcode();
        
        // Make sure it's unique
        let { rows: existing } = await query(
            'SELECT id FROM loyalty_barcodes WHERE barcode = $1',
            [barcode]
        );
        
        while (existing.length > 0) {
            barcode = generateBarcode();
            const check = await query(
                'SELECT id FROM loyalty_barcodes WHERE barcode = $1',
                [barcode]
            );
            existing = check.rows;
        }

        // Calculate monetary value (1000 points = 35 EGP)
        const couponsCount = points_to_redeem / 1000;
        const monetaryValue = couponsCount * 35;

        // Deduct points from user
        await query(
            'UPDATE users SET loyalty_points = loyalty_points - $1 WHERE id = $2',
            [points_to_redeem, userId]
        );

        // Create barcode record
        const { rows: barcodes } = await query(`
            INSERT INTO loyalty_barcodes (
                user_id, barcode, points_value, monetary_value, 
                status, expires_at
            ) VALUES ($1, $2, $3, $4, 'active', NOW() + INTERVAL '30 days')
            RETURNING *
        `, [userId, barcode, points_to_redeem, monetaryValue]);

        // Log transaction
        await query(`
            INSERT INTO loyalty_transactions (
                user_id, points, transaction_type, description, barcode_id
            ) VALUES ($1, $2, 'redemption', $3, $4)
        `, [
            userId,
            -points_to_redeem,
            `استبدال ${points_to_redeem} نقطة بباركود`,
            barcodes[0].id
        ]);

        await query('COMMIT');

        res.json({
            success: true,
            message: 'تم إنشاء الباركود بنجاح',
            barcode: barcodes[0],
            remaining_points: currentPoints - points_to_redeem
        });

    } catch (error) {
        await query('ROLLBACK');
        console.error('Error creating redemption barcode:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Use barcode (by any user at checkout or cashier)
 */
router.post('/use-barcode/:barcode', verifyToken, async (req, res) => {
    try {
        const { barcode } = req.params;
        const { order_id } = req.body;
        const usedByUserId = req.user.id;

        await query('BEGIN');

        // Get barcode details
        const { rows: barcodes } = await query(`
            SELECT 
                lb.*,
                u.name as owner_name,
                u.email as owner_email
            FROM loyalty_barcodes lb
            JOIN users u ON lb.user_id = u.id
            WHERE lb.barcode = $1
        `, [barcode]);

        if (barcodes.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'الباركود غير موجود' });
        }

        const barcodeData = barcodes[0];

        // Check if already used
        if (barcodeData.status === 'used') {
            await query('ROLLBACK');
            return res.status(400).json({ 
                error: 'هذا الباركود تم استخدامه من قبل',
                used_at: barcodeData.used_at,
                used_by: barcodeData.used_by_user_id
            });
        }

        // Check if expired
        if (new Date(barcodeData.expires_at) < new Date()) {
            await query('ROLLBACK');
            return res.status(400).json({ 
                error: 'هذا الباركود منتهي الصلاحية',
                expired_at: barcodeData.expires_at
            });
        }

        // Check if cancelled
        if (barcodeData.status === 'cancelled') {
            await query('ROLLBACK');
            return res.status(400).json({ error: 'هذا الباركود ملغي' });
        }

        // Mark as used
        await query(`
            UPDATE loyalty_barcodes 
            SET status = 'used',
                used_at = NOW(),
                used_by_user_id = $1,
                order_id = $2
            WHERE id = $3
        `, [usedByUserId, order_id, barcodeData.id]);

        // Log usage
        await query(`
            INSERT INTO loyalty_transactions (
                user_id, points, transaction_type, description, barcode_id
            ) VALUES ($1, $2, 'barcode_used', $3, $4)
        `, [
            usedByUserId,
            0, // No points change for user who uses it
            `استخدام باركود بقيمة ${barcodeData.monetary_value} جنيه`,
            barcodeData.id
        ]);

        await query('COMMIT');

        res.json({
            success: true,
            message: 'تم استخدام الباركود بنجاح',
            discount_amount: barcodeData.monetary_value,
            barcode: {
                code: barcodeData.barcode,
                value: barcodeData.monetary_value,
                owner: barcodeData.owner_name
            }
        });

    } catch (error) {
        await query('ROLLBACK');
        console.error('Error using barcode:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Validate barcode before use (check if valid)
 */
router.get('/validate/:barcode', async (req, res) => {
    try {
        const { barcode } = req.params;

        const { rows } = await query(`
            SELECT 
                lb.*,
                u.name as owner_name
            FROM loyalty_barcodes lb
            JOIN users u ON lb.user_id = u.id
            WHERE lb.barcode = $1
        `, [barcode]);

        if (rows.length === 0) {
            return res.status(404).json({ 
                valid: false,
                error: 'الباركود غير موجود' 
            });
        }

        const barcodeData = rows[0];

        if (barcodeData.status === 'used') {
            return res.json({
                valid: false,
                error: 'تم استخدام هذا الباركود من قبل',
                used_at: barcodeData.used_at
            });
        }

        if (new Date(barcodeData.expires_at) < new Date()) {
            return res.json({
                valid: false,
                error: 'الباركود منتهي الصلاحية',
                expired_at: barcodeData.expires_at
            });
        }

        if (barcodeData.status === 'cancelled') {
            return res.json({
                valid: false,
                error: 'الباركود ملغي'
            });
        }

        res.json({
            valid: true,
            barcode: {
                id: barcodeData.id,
                code: barcodeData.barcode,
                barcode: barcodeData.barcode, // for consistency
                monetary_value: barcodeData.monetary_value,
                value: barcodeData.monetary_value, // backward compatibility
                points_value: barcodeData.points_value,
                points: barcodeData.points_value, // backward compatibility
                owner: barcodeData.owner_name,
                expires_at: barcodeData.expires_at
            }
        });

    } catch (error) {
        console.error('Error validating barcode:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get user's active barcodes
 */
router.get('/my-barcodes', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const { rows } = await query(`
            SELECT * FROM loyalty_barcodes
            WHERE user_id = $1
            ORDER BY created_at DESC
        `, [userId]);

        res.json({ data: rows });

    } catch (error) {
        console.error('Error fetching barcodes:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Cancel barcode (before use) - refund points
 */
router.post('/cancel/:barcodeId', verifyToken, async (req, res) => {
    try {
        const { barcodeId } = req.params;
        const userId = req.user.id;

        await query('BEGIN');

        // Get barcode
        const { rows: barcodes } = await query(
            'SELECT * FROM loyalty_barcodes WHERE id = $1 AND user_id = $2',
            [barcodeId, userId]
        );

        if (barcodes.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'الباركود غير موجود' });
        }

        const barcode = barcodes[0];

        if (barcode.status === 'used') {
            await query('ROLLBACK');
            return res.status(400).json({ error: 'لا يمكن إلغاء باركود مستخدم' });
        }

        if (barcode.status === 'cancelled') {
            await query('ROLLBACK');
            return res.status(400).json({ error: 'الباركود ملغي بالفعل' });
        }

        // Mark as cancelled
        await query(
            'UPDATE loyalty_barcodes SET status = $1 WHERE id = $2',
            ['cancelled', barcodeId]
        );

        // Refund points
        await query(
            'UPDATE users SET loyalty_points = loyalty_points + $1 WHERE id = $2',
            [barcode.points_value, userId]
        );

        // Log refund
        await query(`
            INSERT INTO loyalty_transactions (
                user_id, points, transaction_type, description, barcode_id
            ) VALUES ($1, $2, 'refund', $3, $4)
        `, [
            userId,
            barcode.points_value,
            `إلغاء باركود واسترجاع ${barcode.points_value} نقطة`,
            barcodeId
        ]);

        await query('COMMIT');

        res.json({
            success: true,
            message: 'تم إلغاء الباركود واسترجاع النقاط',
            refunded_points: barcode.points_value
        });

    } catch (error) {
        await query('ROLLBACK');
        console.error('Error cancelling barcode:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Admin: Get all barcodes
 */
router.get('/admin/all-barcodes', verifyToken, async (req, res) => {
    try {
        const { status } = req.query;

        let sql = `
            SELECT 
                lb.*,
                u.name as owner_name,
                u.email as owner_email,
                used_user.name as used_by_name
            FROM loyalty_barcodes lb
            JOIN users u ON lb.user_id = u.id
            LEFT JOIN users used_user ON lb.used_by_user_id = used_user.id
        `;

        if (status) {
            sql += ` WHERE lb.status = $1`;
            const { rows } = await query(sql + ' ORDER BY lb.created_at DESC', [status]);
            return res.json({ data: rows });
        }

        const { rows } = await query(sql + ' ORDER BY lb.created_at DESC');
        res.json({ data: rows });

    } catch (error) {
        console.error('Error fetching all barcodes:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
