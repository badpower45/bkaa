import express from 'express';
import { query } from '../database.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Customer cancels their order
 * Only allowed before "preparing" stage
 */
router.post('/cancel/:orderId', verifyToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.user.id;
        const { cancellation_reason } = req.body;

        await query('BEGIN');

        // Get order details
        const { rows: orders } = await query(
            `SELECT o.*, u.name, u.email, u.phone 
             FROM orders o 
             JOIN users u ON o.user_id = u.id
             WHERE o.id = $1 AND o.user_id = $2`,
            [orderId, userId]
        );

        if (orders.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'الطلب غير موجود' });
        }

        const order = orders[0];

        // Check cancellation eligibility
        const canCancel = checkCancellationEligibility(order.status);
        
        if (!canCancel.allowed) {
            await query('ROLLBACK');
            return res.status(400).json({ 
                error: canCancel.reason,
                current_status: order.status
            });
        }

        // Check for suspicious cancellation pattern
        const { rows: cancelHistory } = await query(`
            SELECT COUNT(*) as cancel_count
            FROM orders
            WHERE user_id = $1 
              AND status = 'cancelled'
              AND date > NOW() - INTERVAL '30 days'
        `, [userId]);

        const cancelCount = parseInt(cancelHistory[0].cancel_count);
        
        // Warning threshold: 3 cancellations in 30 days
        if (cancelCount >= 3) {
            // Flag user for review
            await query(`
                UPDATE users 
                SET suspicious_activity = true,
                    suspension_warning_count = COALESCE(suspension_warning_count, 0) + 1,
                    last_warning_date = NOW()
                WHERE id = $1
            `, [userId]);

            // Check if should be banned (5+ warnings)
            const { rows: userCheck } = await query(
                'SELECT suspension_warning_count FROM users WHERE id = $1',
                [userId]
            );
            
            if (userCheck[0].suspension_warning_count >= 5) {
                await query(`
                    UPDATE users 
                    SET is_blocked = true,
                        block_reason = 'إلغاء طلبات متكرر - سلوك مشبوه',
                        blocked_at = NOW()
                    WHERE id = $1
                `, [userId]);

                await query('COMMIT');
                
                return res.status(403).json({
                    error: '⛔ تم حظر حسابك بسبب كثرة إلغاء الطلبات',
                    message: 'يرجى التواصل مع خدمة العملاء'
                });
            }
        }

        // Restore inventory
        const orderItems = typeof order.items === 'string' 
            ? JSON.parse(order.items) 
            : order.items;

        for (const item of orderItems) {
            await query(`
                UPDATE branch_products 
                SET stock_quantity = stock_quantity + $1,
                    reserved_quantity = GREATEST(0, reserved_quantity - $1)
                WHERE product_id = $2 AND branch_id = $3
            `, [item.quantity, item.id, order.branch_id]);
        }

        // Refund loyalty points if used
        if (order.loyalty_points_used > 0) {
            await query(
                'UPDATE users SET loyalty_points = loyalty_points + $1 WHERE id = $2',
                [order.loyalty_points_used, userId]
            );

            // Log refund
            await query(`
                INSERT INTO loyalty_transactions (
                    user_id, points, transaction_type, description, order_id
                ) VALUES ($1, $2, 'refund', $3, $4)
            `, [
                userId,
                order.loyalty_points_used,
                `استرجاع نقاط من طلب ملغى #${orderId}`,
                orderId
            ]);
        }

        // Deduct points earned from this order
        if (order.loyalty_points_earned > 0) {
            await query(
                'UPDATE users SET loyalty_points = GREATEST(0, loyalty_points - $1) WHERE id = $2',
                [order.loyalty_points_earned, userId]
            );

            await query(`
                INSERT INTO loyalty_transactions (
                    user_id, points, transaction_type, description, order_id
                ) VALUES ($1, $2, 'deduct', $3, $4)
            `, [
                userId,
                -order.loyalty_points_earned,
                `خصم نقاط من طلب ملغى #${orderId}`,
                orderId
            ]);
        }

        // Update order status
        await query(`
            UPDATE orders 
            SET status = 'cancelled',
                cancellation_reason = $1,
                cancelled_at = NOW(),
                updated_at = NOW()
            WHERE id = $2
        `, [cancellation_reason || 'بناءً على طلب العميل', orderId]);

        // Notify distribution page (via notification system)
        await query(`
            INSERT INTO notifications (
                user_id, type, title, data
            ) VALUES ($1, $2, $3, $4)
        `, [
            null, // Admin notification
            'order_cancelled',
            'تم إلغاء طلب',
            JSON.stringify({ 
                order_id: orderId, 
                user_id: userId,
                message: `الطلب #${orderId} تم إلغاؤه من قبل العميل: ${order.name}`
            })
        ]).catch(err => console.log('Notification insert skipped:', err.message));

        await query('COMMIT');

        // Prepare response
        const warningMessage = cancelCount >= 3 
            ? `⚠️ تحذير: لديك ${cancelCount + 1} عمليات إلغاء في آخر 30 يوم. الإلغاء المتكرر قد يؤدي لحظر الحساب.`
            : null;

        res.json({
            success: true,
            message: 'تم إلغاء الطلب بنجاح',
            warning: warningMessage,
            order_id: orderId,
            refunded_points: order.loyalty_points_used || 0
        });

    } catch (error) {
        await query('ROLLBACK');
        console.error('Error cancelling order:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Helper: Check if order can be cancelled
 */
function checkCancellationEligibility(orderStatus) {
    // Allowed statuses for cancellation
    const allowedStatuses = ['pending', 'confirmed', 'payment_pending'];
    
    // Blocked statuses (order is being prepared or later)
    const blockedStatuses = ['preparing', 'ready', 'out_for_delivery', 'delivered'];

    if (allowedStatuses.includes(orderStatus)) {
        return { allowed: true };
    }

    if (blockedStatuses.includes(orderStatus)) {
        const messages = {
            'preparing': 'عذراً، الطلب قيد التجهيز حالياً ولا يمكن إلغاؤه',
            'ready': 'عذراً، الطلب جاهز للتوصيل ولا يمكن إلغاؤه',
            'out_for_delivery': 'عذراً، الطلب في طريقه إليك ولا يمكن إلغاؤه',
            'delivered': 'الطلب تم توصيله بالفعل. يمكنك طلب إرجاع بدلاً من ذلك'
        };

        return { 
            allowed: false, 
            reason: messages[orderStatus] || 'لا يمكن إلغاء هذا الطلب'
        };
    }

    // Already cancelled or returned
    if (orderStatus === 'cancelled') {
        return { allowed: false, reason: 'الطلب ملغى بالفعل' };
    }

    if (orderStatus === 'returned') {
        return { allowed: false, reason: 'الطلب تم إرجاعه بالفعل' };
    }

    return { allowed: false, reason: 'حالة الطلب غير معروفة' };
}

/**
 * Admin: Get cancelled orders
 */
router.get('/admin/cancelled-orders', verifyToken, async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT 
                o.*,
                u.name as customer_name,
                u.email as customer_email,
                u.phone as customer_phone,
                u.suspension_warning_count,
                (SELECT COUNT(*) FROM orders WHERE user_id = o.user_id AND status = 'cancelled') as user_cancel_count
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.status = 'cancelled'
            ORDER BY o.cancelled_at DESC
            LIMIT 100
        `);

        res.json({ data: rows });
    } catch (error) {
        console.error('Error fetching cancelled orders:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Admin: Get suspicious users (multiple cancellations)
 */
router.get('/admin/suspicious-cancellations', verifyToken, async (req, res) => {
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
                COUNT(CASE WHEN o.status = 'cancelled' AND o.cancelled_at > NOW() - INTERVAL '30 days' THEN 1 END) as recent_cancellations
            FROM users u
            LEFT JOIN orders o ON u.id = o.user_id
            WHERE u.role = 'customer'
            GROUP BY u.id
            HAVING COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) >= 3
            ORDER BY recent_cancellations DESC, cancelled_orders DESC
        `);

        res.json({ data: rows });
    } catch (error) {
        console.error('Error fetching suspicious users:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
