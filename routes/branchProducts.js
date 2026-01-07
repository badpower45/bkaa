import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// 🆕 GET: Get all products with their branch inventory (ENHANCED)
// ============================================
router.get('/all-branches', verifyToken, async (req, res) => {
    const { productId, branchId } = req.query;
    
    try {
        let sql = `
            SELECT 
                p.id as product_id,
                p.name as product_name,
                p.category,
                p.subcategory,
                p.barcode,
                p.image,
                p.weight,
                br.id as branch_id,
                br.name as branch_name,
                bp.price,
                bp.discount_price,
                bp.stock_quantity,
                bp.reserved_quantity,
                bp.expiry_date,
                bp.is_available,
                bp.min_stock_alert,
                bp.last_stock_update,
                bp.branch_notes,
                CASE 
                    WHEN bp.stock_quantity IS NULL THEN 'غير متوفر'
                    WHEN bp.stock_quantity = 0 THEN 'نفذت الكمية'
                    WHEN bp.stock_quantity <= COALESCE(bp.min_stock_alert, 5) THEN 'مخزون منخفض'
                    ELSE 'متوفر'
                END as stock_status,
                COALESCE(bp.stock_quantity, 0) - COALESCE(bp.reserved_quantity, 0) as available_quantity
            FROM products p
            CROSS JOIN branches br
            LEFT JOIN branch_products bp ON bp.product_id = p.id AND bp.branch_id = br.id
            WHERE br.is_active = TRUE
        `;
        
        const params = [];
        let paramIndex = 1;
        
        if (productId) {
            sql += ` AND p.id = $${paramIndex}`;
            params.push(productId);
            paramIndex++;
        }
        
        if (branchId) {
            sql += ` AND br.id = $${paramIndex}`;
            params.push(parseInt(branchId));
            paramIndex++;
        }
        
        sql += ` ORDER BY p.name, br.name`;
        
        const { rows } = await query(sql, params);
        
        // Group by product
        const grouped = {};
        rows.forEach(row => {
            if (!grouped[row.product_id]) {
                grouped[row.product_id] = {
                    product_id: row.product_id,
                    product_name: row.product_name,
                    category: row.category,
                    subcategory: row.subcategory,
                    barcode: row.barcode,
                    image: row.image,
                    weight: row.weight,
                    branches: []
                };
            }
            
            grouped[row.product_id].branches.push({
                branch_id: row.branch_id,
                branch_name: row.branch_name,
                price: row.price,
                discount_price: row.discount_price,
                stock_quantity: row.stock_quantity,
                reserved_quantity: row.reserved_quantity,
                expiry_date: row.expiry_date,
                is_available: row.is_available,
                min_stock_alert: row.min_stock_alert,
                last_stock_update: row.last_stock_update,
                branch_notes: row.branch_notes,
                stock_status: row.stock_status,
                available_quantity: row.available_quantity
            });
        });
        
        res.json({
            message: 'success',
            data: Object.values(grouped)
        });
    } catch (error) {
        console.error('Error fetching products by branch:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all products for a specific branch
router.get('/:branchId', async (req, res) => {
    const { branchId } = req.params;
    const { category, available } = req.query;

    try {
        let sql = `
            SELECT p.*, 
                   bp.price, bp.discount_price, bp.stock_quantity, bp.is_available,
                   bp.min_stock_alert, bp.last_stock_update, bp.branch_notes,
                   b.name_ar as brand_name, b.name_en as brand_name_en,
                   CASE 
                       WHEN bp.stock_quantity = 0 THEN 'نفذت الكمية'
                       WHEN bp.stock_quantity <= COALESCE(bp.min_stock_alert, 5) THEN 'مخزون منخفض'
                       ELSE 'متوفر'
                   END as stock_status
            FROM products p
            JOIN branch_products bp ON p.id = bp.product_id
            LEFT JOIN brands b ON p.brand_id = b.id
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

// Add product to branch (with price and stock) - ENHANCED
router.post('/', [verifyToken, isAdmin], async (req, res) => {
    const { 
        branchId, productId, price, discountPrice, stockQuantity, 
        isAvailable, expiryDate, minStockAlert, branchNotes 
    } = req.body;

    if (!branchId || !productId || !price) {
        return res.status(400).json({ error: "Branch ID, Product ID, and Price are required" });
    }

    try {
        const sql = `
            INSERT INTO branch_products (
                branch_id, product_id, price, discount_price, stock_quantity, 
                is_available, expiry_date, min_stock_alert, branch_notes,
                last_updated_by, last_stock_update
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
            ON CONFLICT (branch_id, product_id) 
            DO UPDATE SET 
                price = EXCLUDED.price,
                discount_price = EXCLUDED.discount_price,
                stock_quantity = EXCLUDED.stock_quantity,
                is_available = EXCLUDED.is_available,
                expiry_date = EXCLUDED.expiry_date,
                min_stock_alert = EXCLUDED.min_stock_alert,
                branch_notes = EXCLUDED.branch_notes,
                last_updated_by = EXCLUDED.last_updated_by,
                last_stock_update = CURRENT_TIMESTAMP
            RETURNING *
        `;

        const { rows } = await query(sql, [
            branchId, productId, price, discountPrice || null, stockQuantity || 0,
            isAvailable !== undefined ? isAvailable : true,
            expiryDate || null,
            minStockAlert || 5,
            branchNotes || null,
            req.user.id
        ]);

        const { rows } = await query(sql, [
            branchId,
            productId,
            price,
            discountPrice || null,
            stockQuantity || 0,
            isAvailable !== undefined ? isAvailable : true
        ]);

        res.json({ message: 'تم إضافة/تحديث المنتج في الفرع بنجاح', data: rows[0] });
    } catch (err) {
        console.error("Error adding product to branch:", err);
        res.status(500).json({ error: err.message });
    }
});

// Update branch product (price/stock) - ENHANCED
router.put('/:branchId/:productId', [verifyToken, isAdmin], async (req, res) => {
    const { branchId, productId } = req.params;
    const { 
        price, discountPrice, stockQuantity, isAvailable,
        expiryDate, minStockAlert, branchNotes 
    } = req.body;

    try {
        const sql = `
            UPDATE branch_products
            SET price = COALESCE($1, price),
                discount_price = COALESCE($2, discount_price),
                stock_quantity = COALESCE($3, stock_quantity),
                is_available = COALESCE($4, is_available),
                expiry_date = COALESCE($5, expiry_date),
                min_stock_alert = COALESCE($6, min_stock_alert),
                branch_notes = COALESCE($7, branch_notes),
                last_updated_by = $8,
                last_stock_update = CURRENT_TIMESTAMP
            WHERE branch_id = $9 AND product_id = $10
            RETURNING *
        `;

        const { rows } = await query(sql, [
            price,
            discountPrice,
            stockQuantity,
            isAvailable,
            expiryDate,
            minStockAlert,
            branchNotes,
            req.user.id,
            branchId,
            productId
        ]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Branch product not found' });
        }

        res.json({ message: 'تم تحديث المنتج بنجاح', data: rows[0] });
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
                `UPDATE branch_products 
                 SET stock_quantity = $1, 
                     last_stock_update = CURRENT_TIMESTAMP,
                     last_updated_by = $4
                 WHERE branch_id = $2 AND product_id = $3`,
                [stockQuantity, branchId, productId, req.user.id]
            );
        }

        await query('COMMIT');
        res.json({ message: 'تم تحديث المخزون بنجاح', updated: updates.length });
    } catch (err) {
        await query('ROLLBACK');
        console.error("Error bulk updating stock:", err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// 🆕 POST: Transfer stock between branches
// ============================================
router.post('/transfer-stock', [verifyToken, isAdmin], async (req, res) => {
    const { productId, fromBranchId, toBranchId, quantity, notes } = req.body;
    
    if (!productId || !fromBranchId || !toBranchId || !quantity) {
        return res.status(400).json({ 
            error: 'جميع الحقول مطلوبة: productId, fromBranchId, toBranchId, quantity' 
        });
    }
    
    if (quantity <= 0) {
        return res.status(400).json({ error: 'الكمية يجب أن تكون أكبر من صفر' });
    }
    
    try {
        await query('BEGIN');
        
        // Check stock in source branch
        const checkSql = `
            SELECT stock_quantity, price 
            FROM branch_products 
            WHERE product_id = $1 AND branch_id = $2
        `;
        const { rows: sourceRows } = await query(checkSql, [productId, fromBranchId]);
        
        if (sourceRows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'المنتج غير موجود في الفرع المصدر' });
        }
        
        if (sourceRows[0].stock_quantity < quantity) {
            await query('ROLLBACK');
            return res.status(400).json({ 
                error: 'الكمية المتاحة في الفرع المصدر غير كافية',
                available: sourceRows[0].stock_quantity,
                requested: quantity
            });
        }
        
        const sourcePrice = sourceRows[0].price;
        
        // Deduct from source branch
        await query(
            `UPDATE branch_products 
             SET stock_quantity = stock_quantity - $1,
                 last_stock_update = CURRENT_TIMESTAMP,
                 last_updated_by = $2
             WHERE product_id = $3 AND branch_id = $4`,
            [quantity, req.user.id, productId, fromBranchId]
        );
        
        // Add to destination branch
        await query(
            `INSERT INTO branch_products (
                product_id, branch_id, price, stock_quantity,
                is_available, last_updated_by, last_stock_update
            ) VALUES ($1, $2, $3, $4, TRUE, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (branch_id, product_id) 
            DO UPDATE SET 
                stock_quantity = branch_products.stock_quantity + $4,
                last_stock_update = CURRENT_TIMESTAMP,
                last_updated_by = $5`,
            [productId, toBranchId, sourcePrice, quantity, req.user.id]
        );
        
        // Log the transfer
        await query(
            `INSERT INTO stock_movements (
                product_id, from_branch_id, to_branch_id, quantity,
                movement_type, notes, performed_by
            ) VALUES ($1, $2, $3, $4, 'TRANSFER', $5, $6)`,
            [productId, fromBranchId, toBranchId, quantity, notes || null, req.user.id]
        );
        
        await query('COMMIT');
        
        res.json({
            message: `تم نقل ${quantity} وحدة بنجاح من الفرع ${fromBranchId} إلى الفرع ${toBranchId}`,
            success: true
        });
    } catch (err) {
        await query('ROLLBACK');
        console.error("Error transferring stock:", err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// 🆕 GET: Get stock movement history
// ============================================
router.get('/stock-movements', verifyToken, async (req, res) => {
    const { productId, branchId, limit = 50 } = req.query;
    
    try {
        let sql = `
            SELECT 
                sm.*,
                p.name as product_name,
                p.barcode,
                fb.name as from_branch_name,
                tb.name as to_branch_name,
                u.name as performed_by_name
            FROM stock_movements sm
            LEFT JOIN products p ON sm.product_id = p.id
            LEFT JOIN branches fb ON sm.from_branch_id = fb.id
            LEFT JOIN branches tb ON sm.to_branch_id = tb.id
            LEFT JOIN users u ON sm.performed_by = u.id
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;
        
        if (productId) {
            sql += ` AND sm.product_id = $${paramIndex}`;
            params.push(productId);
            paramIndex++;
        }
        
        if (branchId) {
            sql += ` AND (sm.from_branch_id = $${paramIndex} OR sm.to_branch_id = $${paramIndex})`;
            params.push(parseInt(branchId));
            paramIndex++;
        }
        
        sql += ` ORDER BY sm.created_at DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));
        
        const { rows } = await query(sql, params);
        
        res.json({
            message: 'success',
            data: rows
        });
    } catch (error) {
        console.error('Error fetching stock movements:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 🆕 GET: Get low stock alerts
// ============================================
router.get('/low-stock-alerts', verifyToken, async (req, res) => {
    const { branchId } = req.query;
    
    try {
        let sql = `
            SELECT 
                p.id as product_id,
                p.name as product_name,
                p.barcode,
                p.category,
                br.id as branch_id,
                br.name as branch_name,
                bp.stock_quantity,
                bp.min_stock_alert,
                bp.reserved_quantity,
                bp.price
            FROM products p
            JOIN branch_products bp ON p.id = bp.product_id
            JOIN branches br ON bp.branch_id = br.id
            WHERE bp.stock_quantity <= COALESCE(bp.min_stock_alert, 5)
            AND br.is_active = TRUE
        `;
        
        const params = [];
        
        if (branchId) {
            sql += ` AND br.id = $1`;
            params.push(parseInt(branchId));
        }
        
        sql += ` ORDER BY bp.stock_quantity ASC, p.name`;
        
        const { rows } = await query(sql, params);
        
        res.json({
            message: 'success',
            count: rows.length,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching low stock alerts:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
