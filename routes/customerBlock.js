import express from 'express';
import { query } from '../database.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Block/Unblock Customer
 */
router.post('/toggle/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const { block_reason, admin_notes } = req.body;

        // Get current status
        const { rows: users } = await query(
            'SELECT id, name, email, is_blocked FROM users WHERE id = $1',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        const user = users[0];
        const newBlockStatus = !user.is_blocked;

        // Update block status
        await query(`
            UPDATE users 
            SET is_blocked = $1,
                block_reason = $2,
                blocked_at = $3,
                blocked_by = $4,
                updated_at = NOW()
            WHERE id = $5
        `, [
            newBlockStatus,
            newBlockStatus ? block_reason : null,
            newBlockStatus ? new Date() : null,
            newBlockStatus ? req.user.id : null,
            userId
        ]);

        // Log action
        await query(`
            INSERT INTO admin_actions (
                admin_id, action_type, target_type, target_id, 
                description, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            req.user.id,
            newBlockStatus ? 'block_user' : 'unblock_user',
            'user',
            userId,
            newBlockStatus 
                ? `حظر المستخدم: ${user.name} - السبب: ${block_reason}`
                : `رفع الحظر عن المستخدم: ${user.name}`,
            JSON.stringify({ 
                user_email: user.email,
                block_reason,
                admin_notes 
            })
        ]).catch(() => {}); // Ignore if table doesn't exist

        res.json({
            success: true,
            message: newBlockStatus ? 'تم حظر المستخدم بنجاح' : 'تم رفع الحظر بنجاح',
            is_blocked: newBlockStatus,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                is_blocked: newBlockStatus
            }
        });

    } catch (error) {
        console.error('Error toggling block status:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get blocked customers
 */
router.get('/blocked-customers', verifyToken, async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.block_reason,
                u.blocked_at,
                u.suspension_warning_count,
                COUNT(DISTINCT o.id) as total_orders,
                COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END) as cancelled_orders,
                COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total ELSE 0 END), 0) as total_spent
            FROM users u
            LEFT JOIN orders o ON u.id = o.user_id
            WHERE u.is_blocked = true
            GROUP BY u.id
            ORDER BY u.blocked_at DESC
        `);

        res.json({ data: rows });
    } catch (error) {
        console.error('Error fetching blocked customers:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get customers at risk (high cancellation rate)
 */
router.get('/at-risk-customers', verifyToken, async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.suspension_warning_count,
                u.is_blocked,
                COUNT(o.id) as total_orders,
                COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) as cancelled_orders,
                COUNT(CASE WHEN o.status = 'cancelled' AND o.cancelled_at > NOW() - INTERVAL '30 days' THEN 1 END) as recent_cancellations,
                ROUND(
                    CASE 
                        WHEN COUNT(o.id) > 0 
                        THEN (COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END)::numeric / COUNT(o.id)::numeric) * 100 
                        ELSE 0 
                    END, 
                    2
                ) as cancellation_rate
            FROM users u
            LEFT JOIN orders o ON u.id = o.user_id
            WHERE u.role = 'customer'
            GROUP BY u.id
            HAVING COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) >= 2
            ORDER BY cancellation_rate DESC, recent_cancellations DESC
            LIMIT 50
        `);

        res.json({ data: rows });
    } catch (error) {
        console.error('Error fetching at-risk customers:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get customer block history
 */
router.get('/history/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;

        const { rows } = await query(`
            SELECT 
                aa.*,
                u.name as admin_name
            FROM admin_actions aa
            LEFT JOIN users u ON aa.admin_id = u.id
            WHERE aa.target_type = 'user' 
              AND aa.target_id = $1
              AND aa.action_type IN ('block_user', 'unblock_user')
            ORDER BY aa.created_at DESC
        `, [userId]);

        res.json({ data: rows });
    } catch (error) {
        console.error('Error fetching block history:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Bulk block customers
 */
router.post('/bulk-block', verifyToken, async (req, res) => {
    try {
        const { user_ids, block_reason } = req.body;

        if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
            return res.status(400).json({ error: 'يجب تحديد مستخدمين للحظر' });
        }

        await query('BEGIN');

        // Block users
        await query(`
            UPDATE users 
            SET is_blocked = true,
                block_reason = $1,
                blocked_at = NOW(),
                blocked_by = $2
            WHERE id = ANY($3)
        `, [block_reason, req.user.id, user_ids]);

        await query('COMMIT');

        res.json({
            success: true,
            message: `تم حظر ${user_ids.length} مستخدم بنجاح`,
            blocked_count: user_ids.length
        });

    } catch (error) {
        await query('ROLLBACK');
        console.error('Error bulk blocking:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
