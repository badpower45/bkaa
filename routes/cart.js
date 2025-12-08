import express from 'express';
import { query } from '../database.js';
import { verifyToken } from '../middleware/auth.js';
import { validate, cartItemSchema, cartUpdateSchema } from '../middleware/validation.js';

const router = express.Router();

// Get cart items for a user
router.get('/', [verifyToken], async (req, res) => {
    const userId = req.userId; // من التوكن فقط للأمان
    const branchId = req.query.branchId || 1; // Default branch

    if (!userId) return res.status(400).json({ error: "User ID required" });

    try {
        const sql = `
            SELECT c.id as cart_id, c.quantity, c.substitution_preference,
                   p.id, p.name, p.image, p.category, p.description, p.weight, p.barcode,
                   COALESCE(bp.price, 0) as price,
                   bp.discount_price as discount_price,
                   bp.stock_quantity
            FROM cart c
            JOIN products p ON c.product_id::text = p.id::text 
            LEFT JOIN branch_products bp ON p.id::text = bp.product_id::text AND bp.branch_id = $2
            WHERE c.user_id = $1
        `;
        const { rows } = await query(sql, [userId, branchId]);

        const items = rows.map(row => ({
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

        res.json({
            "message": "success",
            "data": items
        });
    } catch (err) {
        console.error('Error getting cart:', err);
        res.status(400).json({ "error": err.message });
    }
});

// Add to cart - with validation
router.post('/add', [verifyToken, validate(cartItemSchema)], async (req, res) => {
    const userId = req.userId; // من التوكن فقط
    const { productId, quantity, substitutionPreference } = req.body;

    try {
        // ✅ Security: Validate quantity is reasonable
        if (quantity > 100) {
            return res.status(400).json({ error: 'Maximum quantity is 100' });
        }
        
        // Check if item exists
        const checkSql = "SELECT * FROM cart WHERE user_id = $1 AND product_id = $2";
        const { rows } = await query(checkSql, [userId, productId]);
        const existing = rows[0];

        if (existing) {
            // Update quantity and substitution preference
            const newQuantity = existing.quantity + (quantity || 1);
            
            // ✅ Security: Prevent quantity overflow
            if (newQuantity > 100) {
                return res.status(400).json({ error: 'Maximum quantity is 100' });
            }
            
            const updateSql = "UPDATE cart SET quantity = $1, substitution_preference = $2 WHERE id = $3";
            await query(updateSql, [newQuantity, substitutionPreference || 'none', existing.id]);
            res.json({ message: "updated", data: { ...existing, quantity: newQuantity, substitution_preference: substitutionPreference || 'none' } });
        } else {
            // Insert new
            const insertSql = "INSERT INTO cart (user_id, product_id, quantity, substitution_preference) VALUES ($1, $2, $3, $4) RETURNING id";
            const { rows: newRows } = await query(insertSql, [userId, productId, quantity || 1, substitutionPreference || 'none']);
            res.json({ message: "added", id: newRows[0].id });
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Remove from cart
router.delete('/remove/:productId', [verifyToken], async (req, res) => {
    const userId = req.userId; // من التوكن فقط
    const productId = req.params.productId;

    try {
        const result = await query("DELETE FROM cart WHERE user_id = $1 AND product_id = $2", [userId, productId]);
        res.json({ message: "deleted", rowCount: result.rowCount });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update quantity
router.post('/update', [verifyToken], async (req, res) => {
    const userId = req.userId; // من التوكن فقط
    const { productId, quantity, substitutionPreference } = req.body;
    try {
        if (substitutionPreference !== undefined) {
            await query("UPDATE cart SET quantity = $1, substitution_preference = $2 WHERE user_id = $3 AND product_id = $4", [quantity, substitutionPreference, userId, productId]);
        } else {
            await query("UPDATE cart SET quantity = $1 WHERE user_id = $2 AND product_id = $3", [quantity, userId, productId]);
        }
        res.json({ message: "updated" });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Clear cart - مسح السلة بالكامل
router.delete('/clear', [verifyToken], async (req, res) => {
    const userId = req.userId; // من التوكن فقط

    if (!userId) {
        return res.status(400).json({ error: "User ID required" });
    }
    
    try {
        const result = await query("DELETE FROM cart WHERE user_id = $1", [userId]);
        res.json({ message: "cleared", rowCount: result.rowCount });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

export default router;
