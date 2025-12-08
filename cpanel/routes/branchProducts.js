const express = require('express');
const { query } = require('../database');
const { verifyToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all products for a specific branch
router.get('/:branchId', async (req, res) => {
    const { branchId } = req.params;
    const { category, available } = req.query;

    try {
        let sql = `
            SELECT p.*, bp.price, bp.discount_price, bp.stock_quantity, bp.is_available
            FROM products p
            JOIN branch_products bp ON p.id = bp.product_id
            WHERE bp.branch_id = $1
        `;
        const params = [branchId];
        let paramIndex = 2;

        if (category) {
            sql += ` AND p.category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        if (available === 'true') {
            sql += ` AND bp.is_available = TRUE`;
        }

        sql += ' ORDER BY p.name';

        const { rows } = await query(sql, params);
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error("Error fetching branch products:", err);
        res.status(500).json({ error: err.message });
    }
});

// Add product to branch (with price and stock)
router.post('/', [verifyToken, isAdmin], async (req, res) => {
    const { branchId, productId, price, discountPrice, stockQuantity, isAvailable } = req.body;

    if (!branchId || !productId || !price) {
        return res.status(400).json({ error: "Branch ID, Product ID, and Price are required" });
    }

    try {
        const sql = `
            INSERT INTO branch_products (branch_id, product_id, price, discount_price, stock_quantity, is_available)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (branch_id, product_id) 
            DO UPDATE SET 
                price = EXCLUDED.price,
                discount_price = EXCLUDED.discount_price,
                stock_quantity = EXCLUDED.stock_quantity,
                is_available = EXCLUDED.is_available
            RETURNING *
        `;

        const { rows } = await query(sql, [
            branchId,
            productId,
            price,
            discountPrice || null,
            stockQuantity || 0,
            isAvailable !== undefined ? isAvailable : true
        ]);

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error("Error adding product to branch:", err);
        res.status(500).json({ error: err.message });
    }
});

// Update branch product (price/stock)
router.put('/:branchId/:productId', [verifyToken, isAdmin], async (req, res) => {
    const { branchId, productId } = req.params;
    const { price, discountPrice, stockQuantity, isAvailable } = req.body;

    try {
        const sql = `
            UPDATE branch_products
            SET price = COALESCE($1, price),
                discount_price = COALESCE($2, discount_price),
                stock_quantity = COALESCE($3, stock_quantity),
                is_available = COALESCE($4, is_available)
            WHERE branch_id = $5 AND product_id = $6
            RETURNING *
        `;

        const { rows } = await query(sql, [
            price,
            discountPrice,
            stockQuantity,
            isAvailable,
            branchId,
            productId
        ]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Branch product not found' });
        }

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error("Error updating branch product:", err);
        res.status(500).json({ error: err.message });
    }
});

// Delete product from branch
router.delete('/:branchId/:productId', [verifyToken, isAdmin], async (req, res) => {
    const { branchId, productId } = req.params;

    try {
        const result = await query(
            "DELETE FROM branch_products WHERE branch_id = $1 AND product_id = $2",
            [branchId, productId]
        );

        res.json({ message: 'deleted', rowCount: result.rowCount });
    } catch (err) {
        console.error("Error deleting branch product:", err);
        res.status(500).json({ error: err.message });
    }
});

// Bulk update stock quantities
router.post('/bulk-update-stock', [verifyToken, isAdmin], async (req, res) => {
    const { updates } = req.body; // Array of { branchId, productId, stockQuantity }

    if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates array required" });
    }

    try {
        await query('BEGIN');

        for (const update of updates) {
            const { branchId, productId, stockQuantity } = update;
            await query(
                "UPDATE branch_products SET stock_quantity = $1 WHERE branch_id = $2 AND product_id = $3",
                [stockQuantity, branchId, productId]
            );
        }

        await query('COMMIT');
        res.json({ message: 'success', updated: updates.length });
    } catch (err) {
        await query('ROLLBACK');
        console.error("Error bulk updating stock:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
