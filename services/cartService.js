/**
 * Cart Service
 * Handles all cart-related business logic
 */
import { query } from '../database.js';

/**
 * Get user's cart with product details
 */
export const getCart = async (userId, branchId = 1) => {
    const { rows } = await query(
        `SELECT c.id as cart_id, c.quantity, c.substitution_preference,
                p.id, p.name, p.image, p.category, p.description, p.weight, p.barcode,
                COALESCE(bp.price, 0) as price,
                bp.discount_price,
                bp.stock_quantity
         FROM cart c
         JOIN products p ON c.product_id::text = p.id::text 
         LEFT JOIN branch_products bp ON p.id::text = bp.product_id::text AND bp.branch_id = $2
         WHERE c.user_id = $1`,
        [userId, branchId]
    );

    return rows.map(row => ({
        id: row.id,
        cartId: row.cart_id,
        name: row.name,
        image: row.image,
        price: Number(row.price) || 0,
        discountPrice: row.discount_price ? Number(row.discount_price) : null,
        quantity: row.quantity,
        substitutionPreference: row.substitution_preference || 'none',
        category: row.category,
        description: row.description,
        weight: row.weight,
        barcode: row.barcode,
        stockQuantity: row.stock_quantity
    }));
};

/**
 * Calculate cart totals
 */
export const getCartTotals = async (userId, branchId = 1) => {
    const items = await getCart(userId, branchId);
    
    const subtotal = items.reduce((sum, item) => {
        const price = item.discountPrice || item.price;
        return sum + (price * item.quantity);
    }, 0);

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    return {
        items,
        itemCount,
        subtotal: Math.round(subtotal * 100) / 100,
        uniqueItems: items.length
    };
};

/**
 * Add item to cart
 */
export const addToCart = async (userId, productId, quantity = 1, substitutionPreference = 'none') => {
    // Check if item already exists
    const { rows: existing } = await query(
        'SELECT * FROM cart WHERE user_id = $1 AND product_id = $2',
        [userId, productId]
    );

    if (existing.length > 0) {
        // Update quantity
        const newQuantity = Math.min(existing[0].quantity + quantity, 100); // Max 100
        
        const { rows } = await query(
            `UPDATE cart 
             SET quantity = $1, substitution_preference = $2 
             WHERE id = $3 
             RETURNING *`,
            [newQuantity, substitutionPreference, existing[0].id]
        );

        return { action: 'updated', item: rows[0] };
    }

    // Insert new item
    const { rows } = await query(
        `INSERT INTO cart (user_id, product_id, quantity, substitution_preference) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [userId, productId, Math.min(quantity, 100), substitutionPreference]
    );

    return { action: 'added', item: rows[0] };
};

/**
 * Update cart item quantity
 */
export const updateCartItem = async (userId, productId, quantity, substitutionPreference) => {
    // If quantity is 0 or less, remove the item
    if (quantity <= 0) {
        return removeFromCart(userId, productId);
    }

    const updates = ['quantity = $3'];
    const values = [userId, productId, Math.min(quantity, 100)];

    if (substitutionPreference !== undefined) {
        updates.push(`substitution_preference = $4`);
        values.push(substitutionPreference);
    }

    const { rows, rowCount } = await query(
        `UPDATE cart 
         SET ${updates.join(', ')} 
         WHERE user_id = $1 AND product_id = $2 
         RETURNING *`,
        values
    );

    if (rowCount === 0) {
        return { found: false };
    }

    return { found: true, item: rows[0] };
};

/**
 * Remove item from cart
 */
export const removeFromCart = async (userId, productId) => {
    const result = await query(
        'DELETE FROM cart WHERE user_id = $1 AND product_id = $2',
        [userId, productId]
    );

    return { removed: result.rowCount > 0 };
};

/**
 * Clear user's entire cart
 */
export const clearCart = async (userId) => {
    const result = await query('DELETE FROM cart WHERE user_id = $1', [userId]);
    return { cleared: result.rowCount };
};

/**
 * Sync guest cart to user cart after login
 */
export const syncGuestCart = async (userId, guestItems) => {
    if (!guestItems || guestItems.length === 0) return;

    await query('BEGIN');

    try {
        for (const item of guestItems) {
            await addToCart(
                userId,
                item.productId || item.id,
                item.quantity || 1,
                item.substitutionPreference || 'none'
            );
        }

        await query('COMMIT');
    } catch (err) {
        await query('ROLLBACK');
        throw err;
    }
};

/**
 * Validate cart items against inventory
 */
export const validateCart = async (userId, branchId) => {
    const items = await getCart(userId, branchId);
    const issues = [];

    for (const item of items) {
        if (item.stockQuantity !== null && item.quantity > item.stockQuantity) {
            issues.push({
                productId: item.id,
                name: item.name,
                requested: item.quantity,
                available: item.stockQuantity,
                issue: 'insufficient_stock'
            });
        }

        if (item.price === 0 && !item.discountPrice) {
            issues.push({
                productId: item.id,
                name: item.name,
                issue: 'no_price'
            });
        }
    }

    return {
        valid: issues.length === 0,
        issues,
        items
    };
};

export default {
    getCart,
    getCartTotals,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    syncGuestCart,
    validateCart
};
