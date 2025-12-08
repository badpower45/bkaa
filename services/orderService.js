/**
 * Order Service
 * Handles all order-related business logic
 */
import { query } from '../database.js';

// Helper function to generate order code
function generateOrderCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'ORD-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Calculate order totals with taxes and discounts
 */
export const calculateOrderTotal = (items, couponDiscount = 0, deliveryFee = 0) => {
    const subtotal = items.reduce((sum, item) => {
        const price = item.discountPrice || item.price;
        return sum + (price * item.quantity);
    }, 0);
    
    const discount = Math.min(couponDiscount, subtotal); // Discount can't exceed subtotal
    const total = subtotal - discount + deliveryFee;
    
    return {
        subtotal: Math.round(subtotal * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        deliveryFee: Math.round(deliveryFee * 100) / 100,
        total: Math.round(total * 100) / 100
    };
};

/**
 * Validate order items against inventory
 */
export const validateInventory = async (items, branchId) => {
    const errors = [];
    
    for (const item of items) {
        const productId = item.id || item.productId;
        
        const { rows } = await query(
            `SELECT stock_quantity, reserved_quantity, price, discount_price 
             FROM branch_products 
             WHERE branch_id = $1 AND product_id = $2`,
            [branchId, productId]
        );
        
        if (rows.length === 0) {
            // Product not found in branch - could allow or reject
            continue;
        }
        
        const stock = rows[0];
        const available = (stock.stock_quantity || 0) - (stock.reserved_quantity || 0);
        
        if (available < item.quantity) {
            errors.push({
                productId,
                name: item.name,
                requested: item.quantity,
                available,
                message: `Insufficient stock for ${item.name}. Available: ${available}`
            });
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Reserve inventory for order
 */
export const reserveInventory = async (items, branchId) => {
    for (const item of items) {
        const productId = item.id || item.productId;
        
        await query(
            `UPDATE branch_products 
             SET reserved_quantity = COALESCE(reserved_quantity, 0) + $1 
             WHERE branch_id = $2 AND product_id = $3`,
            [item.quantity, branchId, productId]
        );
    }
};

/**
 * Release reserved inventory (on order cancel/fail)
 */
export const releaseInventory = async (items, branchId) => {
    for (const item of items) {
        const productId = item.id || item.productId;
        
        await query(
            `UPDATE branch_products 
             SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - $1) 
             WHERE branch_id = $2 AND product_id = $3`,
            [item.quantity, branchId, productId]
        );
    }
};

/**
 * Deduct inventory after order completion
 */
export const deductInventory = async (items, branchId) => {
    for (const item of items) {
        const productId = item.id || item.productId;
        
        await query(
            `UPDATE branch_products 
             SET stock_quantity = GREATEST(0, stock_quantity - $1),
                 reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - $1)
             WHERE branch_id = $2 AND product_id = $3`,
            [item.quantity, branchId, productId]
        );
    }
};

/**
 * Create a new order
 */
export const createOrder = async (orderData) => {
    const {
        userId,
        branchId,
        items,
        total,
        paymentMethod,
        shippingInfo,
        deliverySlotId,
        couponId,
        couponDiscount
    } = orderData;
    
    const orderCode = generateOrderCode();
    
    const { rows } = await query(
        `INSERT INTO orders (
            user_id, branch_id, total, items, status, 
            payment_method, shipping_info, order_code
        )
        VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
        RETURNING id, order_code, status, date`,
        [
            userId,
            branchId || null,
            total,
            JSON.stringify(items),
            paymentMethod || 'cod',
            shippingInfo ? JSON.stringify(shippingInfo) : null,
            orderCode
        ]
    );
    
    return {
        id: rows[0].id,
        orderCode: rows[0].order_code,
        status: rows[0].status,
        date: rows[0].date
    };
};

/**
 * Get order by ID
 */
export const getOrderById = async (orderId) => {
    const { rows } = await query(
        `SELECT * FROM orders WHERE id = $1`,
        [orderId]
    );
    
    if (rows.length === 0) {
        return null;
    }
    
    const order = rows[0];
    return {
        ...order,
        items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items,
        shippingInfo: order.shipping_info ? 
            (typeof order.shipping_info === 'string' ? JSON.parse(order.shipping_info) : order.shipping_info) 
            : null
    };
};

/**
 * Get order by code (for tracking)
 */
export const getOrderByCode = async (orderCode) => {
    const { rows } = await query(
        `SELECT * FROM orders WHERE order_code = $1 OR UPPER(order_code) = $1`,
        [orderCode.toUpperCase()]
    );
    
    if (rows.length === 0) {
        return null;
    }
    
    return rows[0];
};

/**
 * Update order status
 */
export const updateOrderStatus = async (orderId, status, additionalData = {}) => {
    const validStatuses = [
        'pending', 'confirmed', 'preparing', 'ready', 
        'assigned_to_delivery', 'accepted', 'picked_up', 
        'arriving', 'delivered', 'cancelled', 'rejected'
    ];
    
    if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
    }
    
    const updates = ['status = $2'];
    const values = [orderId, status];
    let paramIndex = 3;
    
    if (additionalData.driverId) {
        updates.push(`driver_id = $${paramIndex}`);
        values.push(additionalData.driverId);
        paramIndex++;
    }
    
    if (status === 'delivered') {
        updates.push('delivered_at = CURRENT_TIMESTAMP');
    }
    
    const { rows } = await query(
        `UPDATE orders SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
        values
    );
    
    return rows[0];
};

/**
 * Get user's orders
 */
export const getUserOrders = async (userId, options = {}) => {
    const { page = 1, limit = 10, status } = options;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE user_id = $1';
    const values = [userId];
    
    if (status) {
        whereClause += ' AND status = $2';
        values.push(status);
    }
    
    values.push(limit, offset);
    
    const { rows } = await query(
        `SELECT * FROM orders ${whereClause} 
         ORDER BY date DESC 
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
    );
    
    return rows;
};

export default {
    calculateOrderTotal,
    validateInventory,
    reserveInventory,
    releaseInventory,
    deductInventory,
    createOrder,
    getOrderById,
    getOrderByCode,
    updateOrderStatus,
    getUserOrders
};
