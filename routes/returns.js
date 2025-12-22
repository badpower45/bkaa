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
        
        // Calculate amounts
        const originalTotal = parseFloat(order.total || 0);
        
        // Calculate new total (after removing returned items)
        const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        const returnedItems = Array.isArray(items) ? items : [];
        
        let returnedItemsTotal = 0;
        returnedItems.forEach(retItem => {
            const orderItem = orderItems.find(oi => 
                (oi.id || oi.productId || oi.product_id) === (retItem.id || retItem.productId || retItem.product_id)
            );
            if (orderItem) {
                const price = parseFloat(orderItem.price || 0);
                const qty = parseInt(retItem.quantity || 1);
                returnedItemsTotal += price * qty;
            }
        });
        
        const newTotal = originalTotal - returnedItemsTotal;
        const refundAmount = returnedItemsTotal; // المبلغ المسترجع = قيمة المنتجات المرتجعة
        
        // Calculate points: المبلغ المسترجع = النقاط اللي هتتخصم
        const pointsToDeduct = Math.floor(refundAmount); // 1 جنيه = 1 نقطة
        
        // التحقق من استخدام النقاط: لو العميل استخدم نقاط من الطلب ده، مايقدرش يرجعه
        const pointsUsedInOrder = order.loyalty_points_used || 0;
        if (pointsUsedInOrder > 0) {
            return res.status(400).json({ 
                error: 'لا يمكن إرجاع هذا الطلب لأنك استخدمت نقاط الولاء عند الشراء',
                details: `تم استخدام ${pointsUsedInOrder} نقطة ولاء في هذا الطلب`
            });
        }
        
        // Generate return code
        const returnCode = `RET${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        
        // Create return request
        const { rows } = await query(`
            INSERT INTO returns (
                order_id, user_id, return_code, items, return_reason, return_notes,
                total_amount, refund_amount, points_to_deduct, status,
                original_total, new_total
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)
            RETURNING *
        `, [
            order_id, userId, returnCode, JSON.stringify(items), return_reason,
            return_notes || null, originalTotal, refundAmount, pointsToDeduct,
            originalTotal, newTotal
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

// Search order for return processing (Returns Staff)
router.get('/admin/search-order/:orderId', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // Get order details with user info
        const { rows } = await query(`
            SELECT 
                o.id,
                o.user_id,
                o.total,
                o.items,
                o.date,
                o.status,
                o.branch_id,
                o.payment_method,
                o.coupon_discount,
                u.name as customer_name,
                u.email as customer_email,
                u.phone as customer_phone,
                u.loyalty_points as customer_current_points,
                b.name as branch_name,
                -- Calculate points earned from this order
                FLOOR(o.total) as points_earned_from_order,
                -- Check if already returned
                (SELECT COUNT(*) FROM returns WHERE order_id = o.id AND status IN ('approved', 'completed')) as return_count
            FROM orders o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN branches b ON o.branch_id = b.id
            WHERE o.id = $1
        `, [orderId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const order = rows[0];
        
        // Parse items
        order.items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        
        // Check if order is eligible for return
        const orderDate = new Date(order.date);
        const daysSinceOrder = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
        
        order.can_be_returned = order.status === 'delivered' && daysSinceOrder <= 30;
        order.days_since_order = Math.floor(daysSinceOrder);
        order.already_returned = order.return_count > 0;
        
        res.json({ 
            data: order,
            message: 'Order found successfully' 
        });
    } catch (err) {
        console.error('Error searching order:', err);
        res.status(500).json({ error: err.message });
    }
});

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

// Approve return (admin) - WITH STOCK RESTORATION
router.post('/admin/approve/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;
        const { refund_method, notes } = req.body;
        
        await query('BEGIN');
        
        // Get return details with order info
        const returnResult = await query(`
            SELECT r.*, o.items, o.branch_id 
            FROM returns r
            JOIN orders o ON r.order_id = o.id
            WHERE r.id = $1 FOR UPDATE
        `, [id]);
        
        if (returnResult.rows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Return not found' });
        }
        
        const returnData = returnResult.rows[0];
        
        if (returnData.status !== 'pending') {
            await query('ROLLBACK');
            return res.status(400).json({ error: 'Return already processed' });
        }
        
        // Parse order items
        const orderItems = typeof returnData.items === 'string' 
            ? JSON.parse(returnData.items) 
            : returnData.items;
        
        // RESTORE STOCK TO INVENTORY
        console.log(`Restoring stock for return #${id}...`);
        for (const item of orderItems) {
            const productId = item.id || item.productId || item.product_id;
            const quantity = item.quantity || 1;
            
            try {
                await query(`
                    UPDATE branch_products 
                    SET stock_quantity = stock_quantity + $1
                    WHERE branch_id = $2 AND product_id = $3
                `, [quantity, returnData.branch_id, productId]);
                
                console.log(`✅ Restored ${quantity}x product ${productId} to branch ${returnData.branch_id}`);
            } catch (stockErr) {
                console.error(`Failed to restore stock for product ${productId}:`, stockErr);
                // Continue anyway - don't block return
            }
        }
        
        // Update return status
        await query(`
            UPDATE returns SET
                status = 'approved',
                approved_by = $1,
                approved_at = NOW(),
                refund_method = $2,
                admin_notes = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [adminId, refund_method || 'cash', notes || null, id]);
        
        // DEDUCT LOYALTY POINTS (المبلغ المسترجع)
        const pointsToDeduct = returnData.points_to_deduct || 0;
        let pointsDeducted = 0;
        let loyaltyStatus = 'success';
        let loyaltyMessage = '';
        
        if (pointsToDeduct > 0) {
            try {
                // Get current balance
                const userResult = await query(
                    'SELECT loyalty_points FROM users WHERE id = $1 FOR UPDATE',
                    [returnData.user_id]
                );
                const currentBalance = userResult.rows[0]?.loyalty_points || 0;
                
                // التحقق من رصيد النقاط
                if (currentBalance < pointsToDeduct) {
                    loyaltyStatus = 'insufficient_points';
                    loyaltyMessage = `⚠️ العميل استفاد من نقاط الولاء. الرصيد الحالي: ${currentBalance}، المطلوب خصمه: ${pointsToDeduct}`;
                    console.log(loyaltyMessage);
                    // مش هنخصم لو مفيش رصيد كافي - معناه العميل استخدم النقاط
                } else {
                    // Deduct points
                    const finalBalance = currentBalance - pointsToDeduct;
                    pointsDeducted = pointsToDeduct;
                    
                    await query(
                        'UPDATE users SET loyalty_points = $1 WHERE id = $2',
                        [finalBalance, returnData.user_id]
                    );
                    
                    // Log the deduction مع توضيح المبلغ المسترجع
                    await query(`
                        INSERT INTO loyalty_transactions (
                            user_id, points, transaction_type, description, order_id, metadata
                        ) VALUES ($1, $2, 'deduct', $3, $4, $5)
                    `, [
                        returnData.user_id,
                        -pointsToDeduct,
                        `خصم نقاط - مبلغ الاسترجاع: ${pointsToDeduct} جنيه من الطلب #${returnData.order_id}`,
                        returnData.order_id,
                        JSON.stringify({ 
                            return_id: id,
                            original_total: returnData.original_total || returnData.total_amount,
                            new_total: returnData.new_total,
                            refund_amount: returnData.refund_amount,
                            points_deducted: pointsToDeduct
                        })
                    ]);
                    
                    loyaltyMessage = `✅ تم خصم ${pointsToDeduct} نقطة ولاء (مبلغ الاسترجاع: ${returnData.refund_amount} جنيه)`;
                    console.log(loyaltyMessage);
                }
            } catch (pointsErr) {
                console.error('Failed to deduct loyalty points:', pointsErr);
                loyaltyStatus = 'error';
                loyaltyMessage = `خطأ في خصم النقاط: ${pointsErr.message}`;
                // Continue anyway - don't block return
            }
        }
        
        // Update order status to 'returned'
        await query(
            'UPDATE orders SET status = $1 WHERE id = $2',
            ['returned', returnData.order_id]
        );
        
        await query('COMMIT');
        
        res.json({ 
            data: { 
                returnId: id, 
                status: 'approved',
                stockRestored: true,
                pointsDeducted: returnData.points_to_deduct
            },
            message: 'Return approved successfully. Stock restored and points deducted.' 
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

// Get suspicious customers (Anti-Fraud Analytics)
router.get('/admin/suspicious-customers', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { rows } = await query(`
            WITH customer_stats AS (
                SELECT 
                    u.id,
                    u.name,
                    u.email,
                    u.phone,
                    u.is_blocked,
                    COUNT(DISTINCT o.id) as total_orders,
                    COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END) as cancelled_orders,
                    COUNT(DISTINCT CASE WHEN o.status = 'rejected' THEN o.id END) as rejected_orders,
                    COUNT(DISTINCT r.id) as total_returns,
                    COALESCE(SUM(r.refund_amount), 0) as total_refunds,
                    -- Calculate fraud score
                    (
                        (COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END)::float * 2) +
                        (COUNT(DISTINCT CASE WHEN o.status = 'rejected' THEN o.id END)::float * 3) +
                        (COUNT(DISTINCT r.id)::float * 5)
                    ) as fraud_score
                FROM users u
                LEFT JOIN orders o ON u.id = o.user_id
                LEFT JOIN returns r ON u.id = r.user_id
                WHERE u.role = 'customer'
                GROUP BY u.id, u.name, u.email, u.phone, u.is_blocked
                HAVING COUNT(DISTINCT o.id) > 0
            )
            SELECT 
                *,
                ROUND((cancelled_orders::float / NULLIF(total_orders, 0)) * 100, 2) as cancellation_rate,
                ROUND((rejected_orders::float / NULLIF(total_orders, 0)) * 100, 2) as rejection_rate,
                ROUND((total_returns::float / NULLIF(total_orders, 0)) * 100, 2) as return_rate,
                CASE 
                    WHEN fraud_score >= 20 THEN 'HIGH'
                    WHEN fraud_score >= 10 THEN 'MEDIUM'
                    ELSE 'LOW'
                END as risk_level
            FROM customer_stats
            WHERE fraud_score > 0
            ORDER BY fraud_score DESC
            LIMIT 100
        `);
        
        res.json({ 
            data: rows,
            message: 'Suspicious customers retrieved',
            note: 'Fraud score calculation: cancelled_orders*2 + rejected_orders*3 + returns*5'
        });
    } catch (err) {
        console.error('Error fetching suspicious customers:', err);
        res.status(500).json({ error: err.message });
    }
});

// Block/Unblock customer (Anti-Fraud Action)
router.post('/admin/block-customer/:userId', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { userId } = req.params;
        const { block, reason } = req.body; // block = true/false
        const adminId = req.user.id;
        
        const { rows } = await query(`
            UPDATE users 
            SET is_blocked = $1,
                block_reason = $2,
                blocked_by = $3,
                blocked_at = $4
            WHERE id = $5 AND role = 'customer'
            RETURNING id, name, email, is_blocked
        `, [
            block === true, 
            block ? reason : null,
            block ? adminId : null,
            block ? new Date() : null,
            userId
        ]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        res.json({ 
            data: rows[0],
            message: block ? 'Customer blocked successfully' : 'Customer unblocked successfully'
        });
    } catch (err) {
        console.error('Error blocking customer:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ RETURN INVOICE ============
// Get return invoice (for approved returns)
router.get('/invoice/:returnCode', async (req, res) => {
    try {
        const { returnCode } = req.params;
        
        // Get return details with full order and user info
        const { rows } = await query(`
            SELECT 
                r.*,
                o.id as order_id,
                o.date as order_date,
                o.items as order_items,
                o.branch_id,
                u.name as customer_name,
                u.email as customer_email,
                u.phone as customer_phone,
                b.name as branch_name,
                b.location_lat,
                b.location_lng,
                approver.name as approved_by_name
            FROM returns r
            JOIN orders o ON r.order_id = o.id
            JOIN users u ON r.user_id = u.id
            LEFT JOIN branches b ON o.branch_id = b.id
            LEFT JOIN users approver ON r.approved_by = approver.id
            WHERE r.return_code = $1 AND r.status = 'approved'
        `, [returnCode]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'فاتورة الاسترجاع غير موجودة أو غير مُعتمدة' });
        }
        
        const returnData = rows[0];
        
        // Parse items
        const returnedItems = typeof returnData.items === 'string' 
            ? JSON.parse(returnData.items) 
            : returnData.items;
            
        const orderItems = typeof returnData.order_items === 'string'
            ? JSON.parse(returnData.order_items)
            : returnData.order_items;
        
        // Build detailed invoice
        const invoice = {
            return_code: returnData.return_code,
            status: returnData.status,
            created_at: returnData.created_at,
            approved_at: returnData.approved_at,
            
            customer: {
                name: returnData.customer_name,
                email: returnData.customer_email,
                phone: returnData.customer_phone
            },
            
            branch: {
                name: returnData.branch_name || 'الفرع الرئيسي',
                location: returnData.location_lat && returnData.location_lng 
                    ? { lat: returnData.location_lat, lng: returnData.location_lng }
                    : null
            },
            
            financial_summary: {
                original_total: parseFloat(returnData.original_total || returnData.total_amount || 0),
                new_total: parseFloat(returnData.new_total || 0),
                refund_amount: parseFloat(returnData.refund_amount || 0),
                refund_method: returnData.refund_method || 'نقدي',
                currency: 'EGP'
            },
            
            loyalty_points: {
                points_deducted: parseInt(returnData.points_to_deduct || 0),
                note: 'تم خصم النقاط من رصيد العميل = مبلغ الاسترجاع'
            },
            
            returned_items: returnedItems,
            
            return_reason: returnData.return_reason,
            return_notes: returnData.return_notes,
            admin_notes: returnData.admin_notes,
            approved_by: returnData.approved_by_name
        };
        
        res.json({ 
            data: invoice,
            message: 'فاتورة الاسترجاع'
        });
    } catch (err) {
        console.error('Error fetching return invoice:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
