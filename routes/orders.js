import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin, optionalAuth } from '../middleware/auth.js';
import { validate, orderSchema } from '../middleware/validation.js';

const router = express.Router();

// Helper function to generate order code
function generateOrderCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'ORD-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Create Order - with validation
router.post('/', validate(orderSchema), async (req, res) => {
    console.log('📦 Creating new order...');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    const {
        userId, total, items, branchId, deliverySlotId, paymentMethod,
        shippingDetails, deliveryAddress, couponId, couponCode, couponDiscount
    } = req.body;
    const status = 'pending';

    // Validation
    if (!userId) {
        console.log('❌ Order creation failed: No userId');
        return res.status(400).json({ error: 'User ID is required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
        console.log('❌ Order creation failed: No items');
        return res.status(400).json({ error: 'Order items are required' });
    }
    if (!total || total <= 0) {
        console.log('❌ Order creation failed: Invalid total:', total);
        return res.status(400).json({ error: 'Valid total amount is required' });
    }

    // Handle guest users - user_id can be null for guests
    // Check if userId is a valid integer or a guest string
    const isGuest = String(userId).startsWith('guest-');
    const actualUserId = isGuest ? null : (parseInt(userId) || null);
    
    console.log('👤 User type:', isGuest ? 'Guest' : 'Registered', '| userId:', actualUserId);

    // Build shipping_info from shippingDetails or deliveryAddress for backward compatibility
    const shippingInfo = shippingDetails || (deliveryAddress ? { address: deliveryAddress } : null);

    try {
        await query('BEGIN');

        // Reserve inventory for each item (only if branchId is provided)
        if (branchId) {
            for (const item of items) {
                const productId = item.id || item.productId;
                
                const { rows: stockRows } = await query(
                    "SELECT stock_quantity, reserved_quantity FROM branch_products WHERE branch_id = $1 AND product_id = $2 FOR UPDATE",
                    [branchId, productId]
                );

                // Skip inventory check if product not in branch_products (allow order anyway)
                if (stockRows.length > 0) {
                    const stock = stockRows[0];
                    const availableStock = (stock.stock_quantity || 0) - (stock.reserved_quantity || 0);

                    if (availableStock < item.quantity) {
                        await query('ROLLBACK');
                        return res.status(400).json({ 
                            error: `Insufficient stock for ${item.name || 'product'}. Available: ${availableStock}` 
                        });
                    }

                    // Reserve the quantity
                    await query(
                        "UPDATE branch_products SET reserved_quantity = COALESCE(reserved_quantity, 0) + $1 WHERE branch_id = $2 AND product_id = $3",
                        [item.quantity, branchId, productId]
                    );
                }
            }
        }

        // Reserve delivery slot if provided
        if (deliverySlotId) {
            const { rows: slotRows } = await query(
                "SELECT * FROM delivery_slots WHERE id = $1 FOR UPDATE",
                [deliverySlotId]
            );

            if (slotRows.length > 0) {
                const slot = slotRows[0];
                if (slot.current_orders >= slot.max_orders) {
                    await query('ROLLBACK');
                    return res.status(400).json({ error: 'Delivery slot is full' });
                }

                await query(
                    "UPDATE delivery_slots SET current_orders = current_orders + 1 WHERE id = $1",
                    [deliverySlotId]
                );
            }
        }

        // Insert Order - using only basic columns that exist
        const orderCode = generateOrderCode();
        const insertSql = `
            INSERT INTO orders (
                user_id, branch_id, total, items, status, payment_method, shipping_info, order_code
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, order_code
        `;
        const { rows } = await query(insertSql, [
            actualUserId,
            branchId || null,
            total,
            JSON.stringify(items),
            status,
            paymentMethod || 'cod',
            shippingInfo ? JSON.stringify(shippingInfo) : null,
            orderCode
        ]);
        const orderId = rows[0].id;
        const returnedOrderCode = rows[0].order_code;

        // إذا تم استخدام كوبون، نحاول تسجيل الاستخدام (optional - may fail if tables don't exist)
        if (couponId && couponDiscount > 0 && actualUserId) {
            try {
                await query(
                    `INSERT INTO coupon_usage (coupon_id, user_id, order_id, discount_amount)
                     VALUES ($1, $2, $3, $4)`,
                    [couponId, actualUserId, orderId, couponDiscount]
                );
                await query(
                    `UPDATE coupons SET used_count = used_count + 1 WHERE id = $1`,
                    [couponId]
                );
            } catch (couponErr) {
                console.log('⚠️ Could not record coupon usage (table may not exist):', couponErr.message);
            }
        }

        // Clear cart (only for registered users)
        if (actualUserId) {
            try {
                await query("DELETE FROM cart WHERE user_id = $1", [actualUserId]);
            } catch (cartErr) {
                console.log('⚠️ Could not clear cart:', cartErr.message);
            }
        }

        await query('COMMIT');
        
        console.log('✅ Order created successfully! ID:', orderId, 'Code:', returnedOrderCode);

        res.status(200).send({ 
            message: "Order created", 
            orderId: orderId,
            id: orderId,
            orderCode: returnedOrderCode
        });
    } catch (err) {
        await query('ROLLBACK');
        console.error("❌ Order creation error:", err);
        res.status(500).send({ error: "Problem creating order.", details: err.message });
    }
});

// Track Order by Code (Public - no auth required)
router.get('/track/:orderCode', async (req, res) => {
    const { orderCode } = req.params;
    
    console.log('🔍 Tracking order with code:', orderCode);

    try {
        const { rows } = await query(
            "SELECT * FROM orders WHERE order_code = $1 OR UPPER(order_code) = $1",
            [orderCode.toUpperCase()]
        );

        if (rows.length === 0) {
            return res.status(404).json({ 
                message: 'لم يتم العثور على طلب بهذا الكود',
                error: 'Order not found' 
            });
        }

        const order = rows[0];
        
        res.json({
            message: 'success',
            data: {
                id: order.id,
                order_code: order.order_code,
                status: order.status,
                total: order.total,
                date: order.date,
                payment_method: order.payment_method,
                payment_status: order.payment_status,
                shipping_info: typeof order.shipping_info === 'string' ? JSON.parse(order.shipping_info) : order.shipping_info,
                items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items
            }
        });
    } catch (err) {
        console.error('Error tracking order:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get My Orders (shortcut for authenticated user)
router.get('/my', [verifyToken], async (req, res) => {
    const requesterId = req.userId;

    if (!requesterId) {
        return res.status(400).json({ error: 'User ID not found in token' });
    }

    try {
        const { rows } = await query(
            "SELECT * FROM orders WHERE user_id = $1 ORDER BY date DESC",
            [requesterId]
        );

        const orders = rows.map(o => ({
            ...o,
            items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
            userId: o.user_id,
            branchId: o.branch_id
        }));

        res.json({
            message: "success",
            data: orders
        });
    } catch (err) {
        console.error('Error fetching my orders:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get ALL Orders (Admin - no auth for development, should be protected in production)
router.get('/admin/all', async (req, res) => {
    const { status, branchId } = req.query;
    
    try {
        let sql = "SELECT * FROM orders WHERE 1=1";
        const params = [];
        let paramIndex = 1;
        
        if (status) {
            sql += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        if (branchId) {
            sql += ` AND branch_id = $${paramIndex}`;
            params.push(branchId);
            paramIndex++;
        }
        
        sql += " ORDER BY date DESC";
        
        const { rows } = await query(sql, params);
        const orders = rows.map(o => ({
            ...o,
            items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
            shipping_info: typeof o.shipping_info === 'string' ? JSON.parse(o.shipping_info) : o.shipping_info
        }));
        
        console.log(`📦 Admin fetched ${orders.length} orders (status: ${status || 'all'})`);
        res.json({ message: 'success', data: orders });
    } catch (err) {
        console.error('Error fetching all orders:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Orders (User or Admin)
router.get('/', [verifyToken], async (req, res) => {
    const userId = req.query.userId;
    const userRole = req.userRole;
    const requesterId = req.userId;

    console.log('GET /orders - userRole:', userRole, 'requesterId:', requesterId, 'queryUserId:', userId);
    console.log('GET /orders - Authorization header:', req.headers['authorization'] ? 'Present' : 'Missing');

    let sql = "SELECT * FROM orders";
    let params = [];

    // If admin/manager/distributor, can see all orders or filter by userId
    if (['admin', 'owner', 'manager', 'employee', 'distributor'].includes(userRole)) {
        if (userId) {
            sql += " WHERE user_id = $1";
            params.push(userId);
        }
    } else {
        // Regular user can only see their own orders
        if (!requesterId) {
            return res.status(400).json({ error: 'User ID not found in token' });
        }
        sql += " WHERE user_id = $1";
        params.push(requesterId);
    }

    sql += " ORDER BY date DESC";

    try {
        const { rows } = await query(sql, params);
        const orders = rows.map(o => ({
            ...o,
            // pg returns JSONB as object automatically, no need to parse if it's correct type.
            // But if it returns string (e.g. text column), we parse. Schema says JSONB.
            // pg driver parses JSONB automatically.
            items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
            userId: o.user_id, // Map back for frontend compatibility if needed
            branchId: o.branch_id
        }));

        res.json({
            "message": "success",
            "data": orders
        });
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(400).json({ "error": err.message });
    }
});

// Get single order - allows guests to view their orders
router.get('/:orderId', [optionalAuth], async (req, res) => {
    const { orderId } = req.params;
    const userRole = req.userRole;
    const requesterId = req.userId;
    const isGuestRequest = req.isGuest;

    try {
        const { rows } = await query("SELECT * FROM orders WHERE id = $1", [orderId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = rows[0];

        // Check authorization - guests can view guest orders (user_id is null)
        // Logged in users can only view their own orders
        // Admins can view all
        const isAdmin = ['owner', 'manager', 'employee', 'admin'].includes(userRole);
        const isOwnOrder = order.user_id === requesterId;
        const isGuestOrder = order.user_id === null;
        
        if (!isAdmin && !isOwnOrder && !(isGuestRequest && isGuestOrder)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        res.json({
            message: 'success',
            data: {
                ...order,
                items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items,
                userId: order.user_id,
                branchId: order.branch_id,
                deliverySlotId: order.delivery_slot_id,
                paymentMethod: order.payment_method,
                paymentStatus: order.payment_status
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Order Status
router.put('/:id/status', [verifyToken, isAdmin], async (req, res) => {
    const { status } = req.body;
    const orderId = req.params.id;

    try {
        await query('BEGIN');

        // Get order details
        const { rows: orderRows } = await query("SELECT * FROM orders WHERE id = $1", [orderId]);
        
        if (orderRows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderRows[0];
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

        // If confirming order: deduct from stock and reserved
        if (status === 'confirmed' && order.status === 'pending') {
            for (const item of items) {
                await query(
                    `UPDATE branch_products 
                     SET stock_quantity = stock_quantity - $1,
                         reserved_quantity = reserved_quantity - $1
                     WHERE branch_id = $2 AND product_id = $3`,
                    [item.quantity, order.branch_id, item.id || item.productId]
                );
            }
        }

        // If cancelling order: release reserved inventory and slot
        if (status === 'cancelled') {
            for (const item of items) {
                await query(
                    "UPDATE branch_products SET reserved_quantity = GREATEST(reserved_quantity - $1, 0) WHERE branch_id = $2 AND product_id = $3",
                    [item.quantity, order.branch_id, item.id || item.productId]
                );
            }

            // Release delivery slot
            if (order.delivery_slot_id) {
                await query(
                    "UPDATE delivery_slots SET current_orders = GREATEST(current_orders - 1, 0) WHERE id = $1",
                    [order.delivery_slot_id]
                );
            }
        }

        // Award Loyalty Points ONLY when order is delivered
        if (status === 'delivered' && order.status !== 'delivered') {
            const points = Math.floor(Number(order.total) || 0);
            if (points > 0 && order.user_id) {
                await query(
                    "UPDATE users SET loyalty_points = COALESCE(loyalty_points, 0) + $1 WHERE id = $2",
                    [points, order.user_id]
                );
                console.log(`Awarded ${points} loyalty points to user ${order.user_id} for order ${orderId}`);
            }
        }

        // Update order status
        const result = await query("UPDATE orders SET status = $1 WHERE id = $2 RETURNING *", [status, orderId]);

        await query('COMMIT');

        res.json({ message: "success", data: result.rows[0] });
    } catch (err) {
        await query('ROLLBACK');
        console.error("Error updating order status:", err);
        res.status(400).json({ error: err.message });
    }
});

export default router;
