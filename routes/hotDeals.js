import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all hot deals (public)
router.get('/', async (req, res) => {
    try {
        const { brandId } = req.query;
        let sql = `
            SELECT hd.*, p.brand_id
            FROM hot_deals hd
            LEFT JOIN products p ON hd.product_id = p.id
            WHERE hd.is_active = true 
            AND hd.end_time > NOW()
        `;
        const params = [];
        if (brandId) {
            sql += ` AND p.brand_id = $1`;
            params.push(brandId);
        }
        sql += ` ORDER BY hd.is_flash_deal DESC, hd.sort_order ASC, hd.created_at DESC`;
        const { rows } = await query(sql, params);
        
        // Calculate remaining time and update sold percentage
        const deals = rows.map(deal => ({
            ...deal,
            time_remaining: new Date(deal.end_time).getTime() - Date.now(),
            sold_percentage: deal.total_quantity > 0 
                ? Math.round((deal.sold_quantity / deal.total_quantity) * 100) 
                : deal.sold_percentage
        }));
        
        res.json({
            success: true,
            data: deals
        });
    } catch (err) {
        console.error('Error fetching hot deals:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get flash deal (the main featured deal)
router.get('/flash', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT * FROM hot_deals 
            WHERE is_active = true 
            AND is_flash_deal = true
            AND end_time > NOW()
            ORDER BY end_time ASC
            LIMIT 1
        `);
        
        if (rows.length === 0) {
            return res.json({
                success: true,
                data: null
            });
        }
        
        const deal = rows[0];
        deal.time_remaining = new Date(deal.end_time).getTime() - Date.now();
        deal.sold_percentage = deal.total_quantity > 0 
            ? Math.round((deal.sold_quantity / deal.total_quantity) * 100) 
            : deal.sold_percentage;
        
        res.json({
            success: true,
            data: deal
        });
    } catch (err) {
        console.error('Error fetching flash deal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: Create hot deal
router.post('/', [verifyToken, isAdmin], async (req, res) => {
    try {
        const {
            name, name_en, price, old_price, discount_percentage,
            image, total_quantity, product_id, branch_id,
            start_time, end_time, is_flash_deal, sort_order,
            barcode, description, weight, category
        } = req.body;
        
        let finalProductId = product_id;
        
        // If no product_id provided, create a new product for this hot deal
        if (!product_id) {
            // Generate unique product ID
            const newProductId = `HOTDEAL-${Date.now()}`;
            
            console.log(`🆕 Creating new product for hot deal with ID: ${newProductId}`);
            
            const productResult = await query(`
                INSERT INTO products 
                (id, name, name_en, description, image, category, weight, barcode, is_offer_only, is_new)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, true)
                RETURNING id
            `, [
                newProductId,
                name, 
                name_en || name, 
                description || `عرض ساخن: ${name}`,
                image,
                category || 'عروض ساخنة',
                weight || 'قطعة',
                barcode || newProductId,
            ]);
            
            finalProductId = productResult.rows[0].id;
            
            // Add product to branch_products with the hot deal price
            if (branch_id) {
                await query(`
                    INSERT INTO branch_products (branch_id, product_id, price, discount_price, stock_quantity, is_available)
                    VALUES ($1, $2, $3, $4, $5, true)
                    ON CONFLICT (branch_id, product_id) 
                    DO UPDATE SET price = EXCLUDED.price, discount_price = EXCLUDED.discount_price, stock_quantity = EXCLUDED.stock_quantity
                `, [branch_id, finalProductId, old_price || price, price, total_quantity || 100]);
                
                console.log(`✅ Added product to branch ${branch_id} with price ${price}`);
            }
            
            console.log(`✅ Created new product for hot deal: ${finalProductId}`);
        }
        
        const { rows } = await query(`
            INSERT INTO hot_deals 
            (name, name_en, price, old_price, discount_percentage, image, total_quantity, product_id, branch_id, start_time, end_time, is_flash_deal, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [name, name_en, price, old_price, discount_percentage, image, total_quantity || 100, finalProductId, branch_id, start_time || new Date(), end_time, is_flash_deal || false, sort_order || 0]);
        
        res.status(201).json({
            success: true,
            data: rows[0],
            productCreated: !product_id,
            productId: finalProductId
        });
    } catch (err) {
        console.error('Error creating hot deal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: Update hot deal
router.put('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, name_en, price, old_price, discount_percentage,
            image, total_quantity, sold_quantity, product_id, branch_id,
            start_time, end_time, is_flash_deal, is_active, sort_order
        } = req.body;
        
        const { rows } = await query(`
            UPDATE hot_deals SET
                name = COALESCE($1, name),
                name_en = COALESCE($2, name_en),
                price = COALESCE($3, price),
                old_price = COALESCE($4, old_price),
                discount_percentage = COALESCE($5, discount_percentage),
                image = COALESCE($6, image),
                total_quantity = COALESCE($7, total_quantity),
                sold_quantity = COALESCE($8, sold_quantity),
                product_id = $9,
                branch_id = $10,
                start_time = COALESCE($11, start_time),
                end_time = COALESCE($12, end_time),
                is_flash_deal = COALESCE($13, is_flash_deal),
                is_active = COALESCE($14, is_active),
                sort_order = COALESCE($15, sort_order),
                updated_at = NOW()
            WHERE id = $16
            RETURNING *
        `, [name, name_en, price, old_price, discount_percentage, image, total_quantity, sold_quantity, product_id, branch_id, start_time, end_time, is_flash_deal, is_active, sort_order, id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Deal not found' });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (err) {
        console.error('Error updating hot deal:', err);
        res.status(500).json({ error: err.message });
    }
});

// Increment sold quantity (when someone purchases)
router.post('/:id/sold', async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity = 1 } = req.body;
        
        const { rows } = await query(`
            UPDATE hot_deals SET
                sold_quantity = sold_quantity + $1,
                updated_at = NOW()
            WHERE id = $2 AND is_active = true
            RETURNING *
        `, [quantity, id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Deal not found' });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (err) {
        console.error('Error updating sold quantity:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: Delete hot deal
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        
        await query('DELETE FROM hot_deals WHERE id = $1', [id]);
        
        res.json({
            success: true,
            message: 'Deal deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting hot deal:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
