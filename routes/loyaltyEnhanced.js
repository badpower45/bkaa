/**
 * Enhanced Loyalty System with Conversion & Border Fees
 * المتطلبات:
 * 1. نقطة تحكم 35 جنيه = 1 نقطة
 * 2. رسوم الحدية 7 جنيه (Border Fee)
 * 3. الشحن المجاني على 600 جنيه ✓ (موجود)
 * 4. الحد الأدنى 200 جنيه ✓ (موجود)
 */

import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Constants
const POINTS_CONVERSION_RATE = 35; // 35 EGP = 1 Point
const BORDER_FEE = 7; // 7 EGP Border Fee
const FREE_SHIPPING_THRESHOLD = 600; // Free shipping above 600 EGP
const MINIMUM_ORDER = 200; // Minimum order 200 EGP

// ============ User Loyalty Points ============

/**
 * GET /api/loyalty/balance
 * Get user's current loyalty points balance
 */
router.get('/balance', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const { rows } = await query(
            'SELECT loyalty_points, email, name FROM users WHERE id = $1',
            [userId]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const loyaltyPoints = rows[0].loyalty_points || 0;
        const pointsValue = loyaltyPoints * POINTS_CONVERSION_RATE;
        
        res.json({ 
            success: true,
            data: {
                points: loyaltyPoints,
                value: pointsValue, // قيمة النقاط بالجنيه
                conversionRate: POINTS_CONVERSION_RATE,
                user: {
                    name: rows[0].name,
                    email: rows[0].email
                }
            }
        });
    } catch (error) {
        console.error('Error fetching loyalty balance:', error);
        res.status(500).json({ error: 'Failed to fetch loyalty balance' });
    }
});

/**
 * GET /api/loyalty/transactions
 * Get loyalty points transaction history
 */
router.get('/transactions', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 50, offset = 0 } = req.query;
        
        const { rows } = await query(
            `SELECT * FROM loyalty_points_history 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3`,
            [userId, parseInt(limit), parseInt(offset)]
        );
        
        res.json({ 
            success: true,
            data: rows 
        });
    } catch (error) {
        console.error('Error fetching loyalty transactions:', error);
        res.status(500).json({ error: 'Failed to fetch loyalty transactions' });
    }
});

/**
 * POST /api/loyalty/convert
 * Convert loyalty points to wallet balance
 */
router.post('/convert', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { points } = req.body;
        
        if (!points || points <= 0) {
            return res.status(400).json({ error: 'Invalid points amount' });
        }
        
        await query('BEGIN');
        
        // Get current points
        const { rows: userRows } = await query(
            'SELECT loyalty_points, wallet_balance FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );
        
        if (userRows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }
        
        const currentPoints = userRows[0].loyalty_points || 0;
        const currentWallet = parseFloat(userRows[0].wallet_balance) || 0;
        
        if (currentPoints < points) {
            await query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Insufficient loyalty points',
                current: currentPoints,
                requested: points
            });
        }
        
        // Calculate conversion
        const amountToAdd = points * POINTS_CONVERSION_RATE;
        
        // Update user points and wallet
        await query(
            `UPDATE users 
            SET loyalty_points = loyalty_points - $1,
                wallet_balance = wallet_balance + $2
            WHERE id = $3`,
            [points, amountToAdd, userId]
        );
        
        // Record transaction
        await query(
            `INSERT INTO loyalty_points_history 
            (user_id, points, type, description, order_id)
            VALUES ($1, $2, $3, $4, NULL)`,
            [
                userId, 
                -points, 
                'converted', 
                `تحويل ${points} نقطة إلى ${amountToAdd} جنيه في المحفظة`
            ]
        );
        
        await query('COMMIT');
        
        res.json({
            success: true,
            message: 'Points converted successfully',
            data: {
                pointsConverted: points,
                amountAdded: amountToAdd,
                newBalance: currentWallet + amountToAdd,
                remainingPoints: currentPoints - points
            }
        });
    } catch (error) {
        await query('ROLLBACK');
        console.error('Error converting points:', error);
        res.status(500).json({ error: 'Failed to convert points' });
    }
});

/**
 * POST /api/loyalty/calculate-order
 * Calculate order totals with fees and points
 */
router.post('/calculate-order', async (req, res) => {
    try {
        const { subtotal, usePoints = 0, address } = req.body;
        
        if (!subtotal || subtotal <= 0) {
            return res.status(400).json({ error: 'Invalid subtotal' });
        }
        
        let total = parseFloat(subtotal);
        const breakdown = {
            subtotal: total,
            borderFee: 0,
            shippingFee: 0,
            pointsDiscount: 0,
            pointsUsed: 0,
            total: 0,
            pointsEarned: 0
        };
        
        // Check minimum order
        if (total < MINIMUM_ORDER) {
            return res.status(400).json({
                error: `Minimum order amount is ${MINIMUM_ORDER} EGP`,
                current: total,
                minimum: MINIMUM_ORDER,
                remaining: MINIMUM_ORDER - total
            });
        }
        
        // Add border fee (7 EGP)
        breakdown.borderFee = BORDER_FEE;
        total += BORDER_FEE;
        
        // Calculate shipping fee
        if (total < FREE_SHIPPING_THRESHOLD) {
            // Get shipping fee from address or default
            const shippingFee = address?.shipping_fee || 30; // Default 30 EGP
            breakdown.shippingFee = shippingFee;
            total += shippingFee;
        } else {
            breakdown.shippingFee = 0; // Free shipping
        }
        
        // Apply points discount
        if (usePoints && usePoints > 0) {
            const pointsValue = usePoints * POINTS_CONVERSION_RATE;
            breakdown.pointsUsed = usePoints;
            breakdown.pointsDiscount = Math.min(pointsValue, total);
            total -= breakdown.pointsDiscount;
        }
        
        // Calculate points to earn (1 point per 35 EGP spent)
        breakdown.pointsEarned = Math.floor(total / POINTS_CONVERSION_RATE);
        
        breakdown.total = Math.max(0, total);
        
        res.json({
            success: true,
            data: breakdown
        });
    } catch (error) {
        console.error('Error calculating order:', error);
        res.status(500).json({ error: 'Failed to calculate order' });
    }
});

/**
 * POST /api/loyalty/earn
 * Award loyalty points for an order (Admin/System use)
 */
router.post('/earn', verifyToken, async (req, res) => {
    try {
        const { userId, orderId, amount } = req.body;
        
        if (!userId || !orderId || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const pointsToEarn = Math.floor(amount / POINTS_CONVERSION_RATE);
        
        if (pointsToEarn <= 0) {
            return res.json({
                success: true,
                message: 'No points earned (amount too low)',
                pointsEarned: 0
            });
        }
        
        await query('BEGIN');
        
        // Add points to user
        await query(
            'UPDATE users SET loyalty_points = loyalty_points + $1 WHERE id = $2',
            [pointsToEarn, userId]
        );
        
        // Record transaction
        await query(
            `INSERT INTO loyalty_points_history 
            (user_id, points, type, description, order_id)
            VALUES ($1, $2, $3, $4, $5)`,
            [
                userId, 
                pointsToEarn, 
                'earned', 
                `ربح ${pointsToEarn} نقطة من طلب بقيمة ${amount} جنيه`,
                orderId
            ]
        );
        
        // Update order with earned points
        await query(
            'UPDATE orders SET loyalty_points_earned = $1 WHERE id = $2',
            [pointsToEarn, orderId]
        );
        
        await query('COMMIT');
        
        res.json({
            success: true,
            message: 'Points awarded successfully',
            data: {
                pointsEarned: pointsToEarn,
                orderAmount: amount,
                orderId
            }
        });
    } catch (error) {
        await query('ROLLBACK');
        console.error('Error earning points:', error);
        res.status(500).json({ error: 'Failed to earn points' });
    }
});

/**
 * GET /api/loyalty/config
 * Get loyalty system configuration
 */
router.get('/config', async (req, res) => {
    res.json({
        success: true,
        data: {
            conversionRate: POINTS_CONVERSION_RATE,
            borderFee: BORDER_FEE,
            freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
            minimumOrder: MINIMUM_ORDER,
            description: {
                ar: {
                    conversion: `كل ${POINTS_CONVERSION_RATE} جنيه = نقطة واحدة`,
                    borderFee: `رسوم حدية ${BORDER_FEE} جنيه على كل طلب`,
                    freeShipping: `شحن مجاني للطلبات فوق ${FREE_SHIPPING_THRESHOLD} جنيه`,
                    minimumOrder: `الحد الأدنى للطلب ${MINIMUM_ORDER} جنيه`
                },
                en: {
                    conversion: `Every ${POINTS_CONVERSION_RATE} EGP = 1 Point`,
                    borderFee: `Border fee of ${BORDER_FEE} EGP on every order`,
                    freeShipping: `Free shipping on orders above ${FREE_SHIPPING_THRESHOLD} EGP`,
                    minimumOrder: `Minimum order ${MINIMUM_ORDER} EGP`
                }
            }
        }
    });
});

// ============ Admin Routes ============

/**
 * POST /api/loyalty/admin/adjust
 * Manually adjust user's loyalty points (Admin only)
 */
router.post('/admin/adjust', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { userId, points, reason } = req.body;
        
        if (!userId || !points || !reason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        await query('BEGIN');
        
        await query(
            'UPDATE users SET loyalty_points = loyalty_points + $1 WHERE id = $2',
            [points, userId]
        );
        
        await query(
            `INSERT INTO loyalty_points_history 
            (user_id, points, type, description)
            VALUES ($1, $2, $3, $4)`,
            [userId, points, 'manual_adjustment', reason]
        );
        
        await query('COMMIT');
        
        res.json({
            success: true,
            message: 'Points adjusted successfully'
        });
    } catch (error) {
        await query('ROLLBACK');
        console.error('Error adjusting points:', error);
        res.status(500).json({ error: 'Failed to adjust points' });
    }
});

/**
 * GET /api/loyalty/admin/stats
 * Get overall loyalty program statistics (Admin only)
 */
router.get('/admin/stats', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { rows: stats } = await query(`
            SELECT 
                COUNT(DISTINCT user_id) as total_users_with_points,
                SUM(loyalty_points) as total_points_in_circulation,
                SUM(loyalty_points * ${POINTS_CONVERSION_RATE}) as total_value
            FROM users
            WHERE loyalty_points > 0
        `);
        
        const { rows: transactions } = await query(`
            SELECT 
                type,
                COUNT(*) as count,
                SUM(points) as total_points
            FROM loyalty_points_history
            GROUP BY type
        `);
        
        res.json({
            success: true,
            data: {
                overview: stats[0],
                transactions: transactions,
                config: {
                    conversionRate: POINTS_CONVERSION_RATE,
                    borderFee: BORDER_FEE,
                    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
                    minimumOrder: MINIMUM_ORDER
                }
            }
        });
    } catch (error) {
        console.error('Error fetching loyalty stats:', error);
        res.status(500).json({ error: 'Failed to fetch loyalty stats' });
    }
});

export default router;
