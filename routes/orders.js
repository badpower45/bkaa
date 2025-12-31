import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin, optionalAuth } from '../middleware/auth.js';
import { validate, orderSchema } from '../middleware/validation.js';

const router = express.Router();

// Helper function to generate order code
// Format: ORD-YYMMDD-XXXXX (avoid confusing chars like O/0, I/1)
function generateOrderCode() {
    // Date part (YYMMDD)
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const datePart = `${year}${month}${day}`;
    
    // Random part (5 characters, excluding confusing chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1
    let randomPart = '';
    for (let i = 0; i < 5; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return `ORD-${datePart}-${randomPart}`;
}

// Create Order - with validation
router.post('/', validate(orderSchema), async (req, res) => {
    console.log('📦 Creating new order...');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    const {
        userId, total, items, branchId, deliverySlotId, paymentMethod,
        shippingDetails, deliveryAddress, couponId, couponCode, couponDiscount,
        barcodeCode, barcodeId, barcodeDiscount,
        googleMapsLink, deliveryLatitude, deliveryLongitude
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
                user_id, branch_id, total, items, status, payment_method, shipping_info, order_code,
                google_maps_link, delivery_latitude, delivery_longitude
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
            orderCode,
            googleMapsLink || null,
            deliveryLatitude || null,
            deliveryLongitude || null
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

        // إذا تم استخدام باركود نقاط الولاء
        if (barcodeCode && barcodeDiscount > 0 && actualUserId) {
            try {
                // التحقق من صلاحية الباركود واستخدامه
                const { rows: barcodeRows } = await query(
                    `SELECT * FROM loyalty_barcodes 
                     WHERE barcode = $1 AND status = 'active' 
                     AND expires_at > NOW()
                     FOR UPDATE`,
                    [barcodeCode]
                );

                if (barcodeRows.length === 0) {
                    console.log('⚠️ Barcode not found or invalid:', barcodeCode);
                } else {
                    const barcode = barcodeRows[0];
                    
                    // تحديث حالة الباركود إلى "مستخدم"
                    await query(
                        `UPDATE loyalty_barcodes 
                         SET status = 'used', 
                             used_at = NOW(), 
                             used_by_user_id = $1,
                             order_id = $2,
                             updated_at = NOW()
                         WHERE id = $3`,
                        [actualUserId, orderId, barcode.id]
                    );

                    // تسجيل معاملة سحب النقاط في loyalty_transactions
                    await query(
                        `INSERT INTO loyalty_transactions 
                         (user_id, points, type, description, order_id, barcode_id)
                         VALUES ($1, $2, 'debit', $3, $4, $5)`,
                        [
                            barcode.user_id, // صاحب الباركود الأصلي
                            -barcode.points_value,
                            `استخدام باركود ${barcodeCode} في طلب #${orderId}`,
                            orderId,
                            barcode.id
                        ]
                    );

                    console.log('✅ Barcode used successfully:', barcodeCode, 'Value:', barcode.monetary_value);
                }
            } catch (barcodeErr) {
                console.log('⚠️ Could not process barcode (table may not exist):', barcodeErr.message);
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

        res.status(200).json({ 
            message: "Order created", 
            data: {
                id: orderId,
                orderId: orderId,
                orderCode: returnedOrderCode
            }
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

// Get Single Order by ID (for invoice viewing)
router.get('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    console.log('🔍 Fetching order with ID:', id, 'for user:', userId, 'role:', userRole);

    try {
        // Admin and distributors can see all orders
        // Regular users can only see their own orders
        let sql, params;
        
        if (userRole === 'admin' || userRole === 'distributor') {
            sql = "SELECT * FROM orders WHERE id = $1";
            params = [id];
        } else {
            sql = "SELECT * FROM orders WHERE id = $1 AND user_id = $2";
            params = [id, userId];
        }
        
        const { rows } = await query(sql, params);

        if (rows.length === 0) {
            return res.status(404).json({ 
                message: 'لم يتم العثور على الطلب أو ليس لديك صلاحية لعرضه',
                error: 'Order not found or access denied' 
            });
        }

        const order = rows[0];
        
        res.json({
            message: 'success',
            data: {
                ...order,
                items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items,
                shipping_info: typeof order.shipping_info === 'string' ? JSON.parse(order.shipping_info) : order.shipping_info,
                userId: order.user_id,
                branchId: order.branch_id
            }
        });
    } catch (err) {
        console.error('Error fetching order:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get ALL Orders (Admin - no auth for development, should be protected in production)
router.get('/admin/all', async (req, res) => {
    const { status, branchId } = req.query;
    
    try {
        let sql = `
            SELECT 
                o.*,
                oa.status AS assignment_status,
                oa.rejection_reason
            FROM orders o
            LEFT JOIN LATERAL (
                SELECT status, rejection_reason
                FROM order_assignments 
                WHERE order_id = o.id
                ORDER BY id DESC
                LIMIT 1
            ) oa ON TRUE
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;
        
        if (status) {
            sql += ` AND o.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        if (branchId) {
            sql += ` AND o.branch_id = $${paramIndex}`;
            params.push(branchId);
            paramIndex++;
        }
        
        sql += " ORDER BY o.date DESC";
        
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

        // If moving from pending to confirmed/preparing: deduct from stock but keep reserved
        // (Stock was already reserved when order was created)
        const activeStatuses = ['confirmed', 'preparing'];
        if (activeStatuses.includes(status) && order.status === 'pending') {
            for (const item of items) {
                // Deduct from stock_quantity, release from reserved
                await query(
                    `UPDATE branch_products 
                     SET stock_quantity = stock_quantity - $1,
                         reserved_quantity = GREATEST(reserved_quantity - $1, 0)
                     WHERE branch_id = $2 AND product_id = $3`,
                    [item.quantity, order.branch_id, item.id || item.productId]
                );
            }
        }

        // If cancelling order from pending: release reserved inventory only
        if (status === 'cancelled' && order.status === 'pending') {
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

        // If cancelling order from confirmed/delivered: return stock
        if (status === 'cancelled' && (order.status === 'confirmed' || order.status === 'delivered')) {
            for (const item of items) {
                await query(
                    "UPDATE branch_products SET stock_quantity = stock_quantity + $1 WHERE branch_id = $2 AND product_id = $3",
                    [item.quantity, order.branch_id, item.id || item.productId]
                );
            }
        }

        // If returning order: return stock to warehouse
        if (status === 'returned' && order.status === 'delivered') {
            for (const item of items) {
                await query(
                    `UPDATE branch_products 
                     SET stock_quantity = stock_quantity + $1
                     WHERE branch_id = $2 AND product_id = $3`,
                    [item.quantity, order.branch_id, item.id || item.productId]
                );
            }
            console.log(`📦 Returned ${items.length} items to stock for order ${orderId}`);
        }

        // Award Loyalty Points ONLY when order is delivered
        if (status === 'delivered' && order.status !== 'delivered') {
            const points = Math.floor(Number(order.total) || 0);
            if (points > 0 && order.user_id) {
                // Update user's loyalty points
                await query(
                    "UPDATE users SET loyalty_points = COALESCE(loyalty_points, 0) + $1 WHERE id = $2",
                    [points, order.user_id]
                );
                
                // Create loyalty points history record
                await query(
                    `INSERT INTO loyalty_points_history (user_id, order_id, points, type, description)
                    VALUES ($1, $2, $3, 'earned', $4)`,
                    [order.user_id, orderId, points, `نقاط من طلب رقم ${orderId}`]
                );
                
                console.log(`✅ Awarded ${points} loyalty points to user ${order.user_id} for order ${orderId}`);
            }
        }

        // Deduct Loyalty Points when order is returned or cancelled (if was delivered before)
        console.log(`🔍 Checking loyalty deduction: newStatus=${status}, oldStatus=${order.status}, total=${order.total}, userId=${order.user_id}`);
        
        if ((status === 'returned' || status === 'cancelled') && order.status === 'delivered') {
            const points = Math.floor(Number(order.total) || 0);
            console.log(`🔍 Deduction condition MET! Points to deduct: ${points}`);
            
            if (points > 0 && order.user_id) {
                try {
                    // Get current points before deduction
                    const { rows: userRows } = await query("SELECT loyalty_points FROM users WHERE id = $1", [order.user_id]);
                    const currentPoints = userRows[0]?.loyalty_points || 0;
                    console.log(`🔍 User ${order.user_id} current points: ${currentPoints}`);
                    
                    // Deduct points from user
                    const updateResult = await query(
                        "UPDATE users SET loyalty_points = GREATEST(COALESCE(loyalty_points, 0) - $1, 0) WHERE id = $2 RETURNING loyalty_points",
                        [points, order.user_id]
                    );
                    
                    const newPoints = updateResult.rows[0]?.loyalty_points;
                    console.log(`✅ Points updated from ${currentPoints} to ${newPoints}`);
                    
                    // Create loyalty points history record
                    await query(
                        `INSERT INTO loyalty_points_history (user_id, order_id, points, type, description)
                        VALUES ($1, $2, $3, 'deducted', $4)`,
                        [order.user_id, orderId, -points, `خصم نقاط من طلب مرتجع/ملغي رقم ${orderId}`]
                    );
                    
                    console.log(`⚠️ Deducted ${points} loyalty points from user ${order.user_id} for returned/cancelled order ${orderId}`);
                } catch (deductionError) {
                    console.error(`❌ ERROR deducting points:`, deductionError);
                    // Don't throw - let the order status update continue
                }
            } else {
                console.log(`⚠️ Skipping deduction: points=${points}, userId=${order.user_id}`);
            }
        } else {
            console.log(`⚠️ Deduction condition NOT met`);
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
