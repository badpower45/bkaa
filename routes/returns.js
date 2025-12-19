import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ============ USER ROUTES ============

// Create return request
router.post('/create', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { order_id, items, return_reason, return_notes } = req.body;
        
        if (!order_id || !items || !return_reason) {
            return res.status(400).json({ error: 'Order ID, items, and reason are required' });
        }
        
        // Verify order belongs to user
        const orderResult = await query(
            'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
            [order_id, userId]
        );
        
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const order = orderResult.rows[0];
        
        // Check if order can be returned (within 7 days, delivered status)
        const orderDate = new Date(order.date);
        const daysSinceOrder = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceOrder > 7) {
            return res.status(400).json({ error: 'Returns are only accepted within 7 days of delivery' });
        }
        
        if (order.status !== 'delivered') {
            return res.status(400).json({ error: 'Only delivered orders can be returned' });
        }
        
        // Calculate return amount
        const totalAmount = parseFloat(order.total || 0);
        const refundAmount = totalAmount; // Full refund for now
        
        // Calculate points to deduct
        const pointsEarned = order.loyalty_points_earned || 0;
        
        // Generate return code
        const returnCode = `RET${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        
        // Create return request
        const { rows } = await query(`
            INSERT INTO returns (
                order_id, user_id, return_code, items, return_reason, return_notes,
                total_amount, refund_amount, points_to_deduct, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
            RETURNING *
        `, [
            order_id, userId, returnCode, JSON.stringify(items), return_reason,
            return_notes || null, totalAmount, refundAmount, pointsEarned
        ]);
        
        res.status(201).json({ 
            data: rows[0],
            message: 'Return request created successfully' 
        });
    } catch (err) {
        console.error('Error creating return:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get user's returns
router.get('/my-returns', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const { rows } = await query(`
            SELECT r.*, o.id as order_code, o.total as order_total
            FROM returns r
            JOIN orders o ON r.order_id = o.id
            WHERE r.user_id = $1
            ORDER BY r.created_at DESC
        `, [userId]);
        
        res.json({ data: rows, message: 'success' });
    } catch (err) {
        console.error('Error fetching returns:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get return by code (public - for checking status)
router.get('/check/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        const { rows } = await query(`
            SELECT r.*, 
                   o.id as order_code,
                   o.total as order_total,
                   o.date as order_date,
                   u.name as customer_name,
                   u.phone as customer_phone
            FROM returns r
            JOIN orders o ON r.order_id = o.id
            JOIN users u ON r.user_id = u.id
            WHERE r.return_code = $1
        `, [code]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Return not found' });
        }
        
        res.json({ data: rows[0], message: 'success' });
    } catch (err) {
        console.error('Error checking return:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ ADMIN ROUTES ============

// Get all returns (admin)
router.get('/admin/all', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { status, limit = 100, offset = 0 } = req.query;
        
        let queryStr = `
            SELECT r.*, 
                   o.id as order_code,
                   u.name as customer_name,
                   u.email as customer_email,
                   u.phone as customer_phone,
                   approver.name as approved_by_name
            FROM returns r
            JOIN orders o ON r.order_id = o.id
            JOIN users u ON r.user_id = u.id
            LEFT JOIN users approver ON r.approved_by = approver.id
            WHERE 1=1
        `;
        const params = [];
        
        if (status) {
            params.push(status);
            queryStr += ` AND r.status = $${params.length}`;
        }
        
        params.push(limit, offset);
        queryStr += ` ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
        
        const { rows } = await query(queryStr, params);
        res.json({ data: rows, message: 'success' });
    } catch (err) {
        console.error('Error fetching returns:', err);
        res.status(500).json({ error: err.message });
    }
});

// Approve return (admin)
router.post('/admin/approve/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;
        const { refund_method, notes } = req.body;
        
        await query('BEGIN');
        
        // Get return details
        const returnResult = await query(
            'SELECT * FROM returns WHERE id = $1 FOR UPDATE',
            [id]
        );
        
        if (returnResult.rows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Return not found' });
        }
        
        const returnData = returnResult.rows[0];
        
        if (returnData.status !== 'pending') {
            await query('ROLLBACK');
            return res.status(400).json({ error: 'Return already processed' });
        }
        
        // Update return status
        await query(`
            UPDATE returns SET
                status = 'approved',
                approved_by = $1,
                approved_at = NOW(),
                refund_method = $2,
                updated_at = NOW()
            WHERE id = $3
        `, [adminId, refund_method || 'cash', id]);
        
        // Deduct loyalty points
        if (returnData.points_to_deduct > 0) {
            try {
                // Get current balance
                const userResult = await query(
                    'SELECT loyalty_points FROM users WHERE id = $1',
                    [returnData.user_id]
                );
                const currentBalance = userResult.rows[0]?.loyalty_points || 0;
                
                // Deduct points (but not below 0)
                const deduction = Math.min(returnData.points_to_deduct, currentBalance);
                
                await query(
                    'UPDATE users SET loyalty_points = loyalty_points - $1 WHERE id = $2',
                    [deduction, returnData.user_id]
                );
                
                // Create transaction record if loyalty_transactions table exists
                try {
                    await query(`
                        INSERT INTO loyalty_transactions (
                            user_id, order_id, points, transaction_type, description,
                            balance_before, balance_after
                        ) VALUES ($1, $2, $3, 'refund', $4, $5, $6)
                    `, [
                        returnData.user_id, returnData.order_id, -deduction,
                        `خصم ${deduction} نقطة بسبب إرجاع الطلب #${returnData.order_id}`,
                        currentBalance, currentBalance - deduction
                    ]);
                } catch (err) {
                    // Table might not exist, continue anyway
                    console.log('Loyalty transactions table not available:', err.message);
                }
            } catch (err) {
                console.error('Failed to deduct points:', err);
            }
        }
        
        // Update order status
        await query(
            'UPDATE orders SET status = \'returned\' WHERE id = $1',
            [returnData.order_id]
        );
        
        await query('COMMIT');
        
        res.json({ 
            data: { returnId: id, status: 'approved' },
            message: 'Return approved successfully' 
        });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error approving return:', err);
        res.status(500).json({ error: err.message });
    }
});

// Reject return (admin)
router.post('/admin/reject/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;
        const { rejection_reason } = req.body;
        
        if (!rejection_reason) {
            return res.status(400).json({ error: 'Rejection reason is required' });
        }
        
        const { rows } = await query(`
            UPDATE returns SET
                status = 'rejected',
                approved_by = $1,
                approved_at = NOW(),
                rejection_reason = $2,
                updated_at = NOW()
            WHERE id = $3 AND status = 'pending'
            RETURNING *
        `, [adminId, rejection_reason, id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Return not found or already processed' });
        }
        
        res.json({ 
            data: rows[0],
            message: 'Return rejected successfully' 
        });
    } catch (err) {
        console.error('Error rejecting return:', err);
        res.status(500).json({ error: err.message });
    }
});

// Complete return (mark as refunded) (admin)
router.post('/admin/complete/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const { refund_transaction_id } = req.body;
        
        const { rows } = await query(`
            UPDATE returns SET
                status = 'completed',
                refund_transaction_id = $1,
                refunded_at = NOW(),
                updated_at = NOW()
            WHERE id = $2 AND status = 'approved'
            RETURNING *
        `, [refund_transaction_id || null, id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Return not found or not approved' });
        }
        
        res.json({ 
            data: rows[0],
            message: 'Return marked as completed' 
        });
    } catch (err) {
        console.error('Error completing return:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get return statistics (admin)
router.get('/admin/stats', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT 
                COUNT(*) as total_returns,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_returns,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_returns,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_returns,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_returns,
                COALESCE(SUM(refund_amount), 0) as total_refund_amount,
                COALESCE(SUM(points_to_deduct), 0) as total_points_deducted
            FROM returns
        `);
        
        res.json({ data: rows[0], message: 'success' });
    } catch (err) {
        console.error('Error fetching return stats:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
