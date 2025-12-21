/**
 * Enhanced Returns System Backend Routes
 * نظام مرتجعات محسّن مع منطق عكسي للمخزون والنقاط
 */

import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/returns-enhanced/create
 * Create a new return request with reverse inventory logic
 */
router.post('/create', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { 
            order_id, 
            items, 
            return_reason, 
            return_notes,
            pickup_address,
            preferred_date 
        } = req.body;
        
        if (!order_id || !items || !return_reason) {
            return res.status(400).json({ 
                error: 'Order ID, items, and reason are required' 
            });
        }
        
        await query('BEGIN');
        
        // Verify order belongs to user
        const { rows: orderRows } = await query(
            'SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [order_id, userId]
        );
        
        if (orderRows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const order = orderRows[0];
        
        // Check if order can be returned (within 7 days, delivered status)
        const orderDate = new Date(order.date || order.created_at);
        const daysSinceOrder = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceOrder > 7) {
            await query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Returns are only accepted within 7 days of delivery',
                days: Math.floor(daysSinceOrder)
            });
        }
        
        if (order.status !== 'delivered') {
            await query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Only delivered orders can be returned',
                currentStatus: order.status
            });
        }
        
        // Calculate return amount
        const totalAmount = parseFloat(order.total || 0);
        let refundAmount = totalAmount;
        
        // Deduct border fee and shipping from refund
        const borderFee = parseFloat(order.border_fee || 7);
        const shippingFee = parseFloat(order.shipping_fee || 0);
        refundAmount -= (borderFee + shippingFee);
        
        // Calculate points to deduct
        const pointsEarned = order.loyalty_points_earned || 0;
        
        // Generate return code
        const returnCode = `RET${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        
        // Create return request
        const { rows: returnRows } = await query(`
            INSERT INTO returns (
                order_id, user_id, return_code, items, return_reason, return_notes,
                total_amount, refund_amount, points_to_deduct, status,
                pickup_address, preferred_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)
            RETURNING *
        `, [
            order_id, userId, returnCode, JSON.stringify(items), return_reason,
            return_notes || null, totalAmount, refundAmount, pointsEarned,
            pickup_address || null, preferred_date || null
        ]);
        
        const returnId = returnRows[0].id;
        
        // Reverse inventory (add back to stock)
        if (order.branch_id) {
            for (const item of items) {
                const productId = item.product_id || item.productId || item.id;
                const quantity = item.quantity;
                
                // Add back to stock and reduce reserved
                await query(
                    `UPDATE branch_products 
                    SET stock_quantity = stock_quantity + $1,
                        reserved_quantity = GREATEST(0, reserved_quantity - $1)
                    WHERE branch_id = $2 AND product_id = $3`,
                    [quantity, order.branch_id, productId]
                );
            }
        }
        
        // Update order status
        await query(
            'UPDATE orders SET status = $1, return_id = $2 WHERE id = $3',
            ['return_requested', returnId, order_id]
        );
        
        await query('COMMIT');
        
        res.status(201).json({ 
            success: true,
            message: 'Return request created successfully',
            data: {
                ...returnRows[0],
                refundBreakdown: {
                    orderTotal: totalAmount,
                    borderFee: borderFee,
                    shippingFee: shippingFee,
                    refundAmount: refundAmount
                }
            }
        });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error creating return:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/returns-enhanced/my-returns
 * Get user's return requests
 */
router.get('/my-returns', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, limit = 20, offset = 0 } = req.query;
        
        let sql = `
            SELECT r.*, 
                   o.order_code,
                   o.total as order_total,
                   o.branch_id,
                   b.name_ar as branch_name
            FROM returns r
            JOIN orders o ON r.order_id = o.id
            LEFT JOIN branches b ON o.branch_id = b.id
            WHERE r.user_id = $1
        `;
        
        const params = [userId];
        let paramIndex = 2;
        
        if (status) {
            sql += ` AND r.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        sql += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const { rows } = await query(sql, params);
        
        // Get total count
        const { rows: countRows } = await query(
            `SELECT COUNT(*) as total FROM returns WHERE user_id = $1${status ? ' AND status = $2' : ''}`,
            status ? [userId, status] : [userId]
        );
        
        res.json({ 
            success: true,
            data: rows,
            total: parseInt(countRows[0].total)
        });
    } catch (err) {
        console.error('Error fetching returns:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/returns-enhanced/:returnCode
 * Track return by code
 */
router.get('/:returnCode', async (req, res) => {
    try {
        const { returnCode } = req.params;
        
        const { rows } = await query(`
            SELECT r.*, 
                   o.order_code,
                   o.total as order_total,
                   u.name as user_name,
                   u.email as user_email,
                   u.phone as user_phone
            FROM returns r
            JOIN orders o ON r.order_id = o.id
            JOIN users u ON r.user_id = u.id
            WHERE r.return_code = $1
        `, [returnCode.toUpperCase()]);
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                error: 'Return request not found' 
            });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (err) {
        console.error('Error tracking return:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /api/returns-enhanced/:id/status
 * Update return status (Admin)
 */
router.patch('/:id/status', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_notes } = req.body;
        
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }
        
        await query('BEGIN');
        
        // Get return details
        const { rows: returnRows } = await query(
            'SELECT * FROM returns WHERE id = $1 FOR UPDATE',
            [id]
        );
        
        if (returnRows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Return not found' });
        }
        
        const returnData = returnRows[0];
        
        // Update return status
        await query(
            `UPDATE returns 
            SET status = $1, admin_notes = $2, updated_at = NOW() 
            WHERE id = $3`,
            [status, admin_notes || null, id]
        );
        
        // If approved, process refund and deduct points
        if (status === 'approved') {
            const userId = returnData.user_id;
            const refundAmount = parseFloat(returnData.refund_amount);
            const pointsToDeduct = returnData.points_to_deduct || 0;
            
            // Add refund to wallet
            await query(
                'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                [refundAmount, userId]
            );
            
            // Deduct loyalty points
            if (pointsToDeduct > 0) {
                await query(
                    'UPDATE users SET loyalty_points = GREATEST(0, loyalty_points - $1) WHERE id = $2',
                    [pointsToDeduct, userId]
                );
                
                // Record transaction
                await query(
                    `INSERT INTO loyalty_points_history 
                    (user_id, points, type, description, order_id)
                    VALUES ($1, $2, $3, $4, $5)`,
                    [
                        userId, 
                        -pointsToDeduct, 
                        'deducted', 
                        `خصم ${pointsToDeduct} نقطة بسبب المرتجع ${returnData.return_code}`,
                        returnData.order_id
                    ]
                );
            }
            
            // Update order status
            await query(
                'UPDATE orders SET status = $1 WHERE id = $2',
                ['returned', returnData.order_id]
            );
        }
        
        // If rejected, restore inventory
        if (status === 'rejected') {
            const { rows: orderRows } = await query(
                'SELECT * FROM orders WHERE id = $1',
                [returnData.order_id]
            );
            
            if (orderRows.length > 0 && orderRows[0].branch_id) {
                const order = orderRows[0];
                const items = typeof returnData.items === 'string' 
                    ? JSON.parse(returnData.items) 
                    : returnData.items;
                
                // Restore inventory (subtract back)
                for (const item of items) {
                    const productId = item.product_id || item.productId || item.id;
                    const quantity = item.quantity;
                    
                    await query(
                        `UPDATE branch_products 
                        SET stock_quantity = GREATEST(0, stock_quantity - $1)
                        WHERE branch_id = $2 AND product_id = $3`,
                        [quantity, order.branch_id, productId]
                    );
                }
            }
            
            // Update order status back to delivered
            await query(
                'UPDATE orders SET status = $1 WHERE id = $2',
                ['delivered', returnData.order_id]
            );
        }
        
        await query('COMMIT');
        
        res.json({
            success: true,
            message: `Return ${status} successfully`
        });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error updating return status:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/returns-enhanced/admin/all
 * Get all returns (Admin)
 */
router.get('/admin/all', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { status, branchId, limit = 50, offset = 0 } = req.query;
        
        let sql = `
            SELECT r.*, 
                   o.order_code,
                   o.branch_id,
                   u.name as user_name,
                   u.email as user_email,
                   u.phone as user_phone,
                   b.name_ar as branch_name
            FROM returns r
            JOIN orders o ON r.order_id = o.id
            JOIN users u ON r.user_id = u.id
            LEFT JOIN branches b ON o.branch_id = b.id
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;
        
        if (status) {
            sql += ` AND r.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        if (branchId) {
            sql += ` AND o.branch_id = $${paramIndex}`;
            params.push(branchId);
            paramIndex++;
        }
        
        sql += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const { rows } = await query(sql, params);
        
        res.json({
            success: true,
            data: rows
        });
    } catch (err) {
        console.error('Error fetching all returns:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/returns-enhanced/stats
 * Get returns statistics
 */
router.get('/stats/overview', verifyToken, async (req, res) => {
    try {
        const isUserAdmin = req.user.role === 'admin';
        const userId = isUserAdmin ? null : req.user.id;
        
        let userCondition = '';
        const params = [];
        
        if (userId) {
            userCondition = 'WHERE user_id = $1';
            params.push(userId);
        }
        
        const { rows } = await query(`
            SELECT 
                COUNT(*) as total_returns,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
                SUM(CASE WHEN status = 'approved' THEN refund_amount ELSE 0 END) as total_refunded
            FROM returns
            ${userCondition}
        `, params);
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
