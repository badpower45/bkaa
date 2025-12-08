import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all magazine offers (public)
router.get('/', async (req, res) => {
    try {
        const { category } = req.query;
        
        let sql = `
            SELECT * FROM magazine_offers 
            WHERE is_active = true 
            AND (start_date IS NULL OR start_date <= NOW())
            AND (end_date IS NULL OR end_date >= NOW())
        `;
        const params = [];
        
        if (category && category !== 'جميع العروض') {
            sql += ` AND category = $1`;
            params.push(category);
        }
        
        sql += ` ORDER BY sort_order ASC, created_at DESC`;
        
        const { rows } = await query(sql, params);
        
        res.json({
            success: true,
            data: rows
        });
    } catch (err) {
        console.error('Error fetching magazine offers:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get magazine categories
router.get('/categories', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT DISTINCT category FROM magazine_offers 
            WHERE is_active = true
            ORDER BY category
        `);
        
        const categories = ['جميع العروض', ...rows.map(r => r.category).filter(c => c !== 'جميع العروض')];
        
        res.json({
            success: true,
            data: categories
        });
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: Create magazine offer
router.post('/', [verifyToken, isAdmin], async (req, res) => {
    try {
        const {
            name, name_en, price, old_price, unit, discount_percentage,
            image, category, bg_color, product_id, branch_id,
            start_date, end_date, sort_order
        } = req.body;
        
        const { rows } = await query(`
            INSERT INTO magazine_offers 
            (name, name_en, price, old_price, unit, discount_percentage, image, category, bg_color, product_id, branch_id, start_date, end_date, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `, [name, name_en, price, old_price, unit || 'كجم', discount_percentage, image, category || 'جميع العروض', bg_color, product_id, branch_id, start_date, end_date, sort_order || 0]);
        
        res.status(201).json({
            success: true,
            data: rows[0]
        });
    } catch (err) {
        console.error('Error creating magazine offer:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: Update magazine offer
router.put('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, name_en, price, old_price, unit, discount_percentage,
            image, category, bg_color, product_id, branch_id,
            start_date, end_date, is_active, sort_order
        } = req.body;
        
        const { rows } = await query(`
            UPDATE magazine_offers SET
                name = COALESCE($1, name),
                name_en = COALESCE($2, name_en),
                price = COALESCE($3, price),
                old_price = COALESCE($4, old_price),
                unit = COALESCE($5, unit),
                discount_percentage = COALESCE($6, discount_percentage),
                image = COALESCE($7, image),
                category = COALESCE($8, category),
                bg_color = COALESCE($9, bg_color),
                product_id = $10,
                branch_id = $11,
                start_date = COALESCE($12, start_date),
                end_date = COALESCE($13, end_date),
                is_active = COALESCE($14, is_active),
                sort_order = COALESCE($15, sort_order),
                updated_at = NOW()
            WHERE id = $16
            RETURNING *
        `, [name, name_en, price, old_price, unit, discount_percentage, image, category, bg_color, product_id, branch_id, start_date, end_date, is_active, sort_order, id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Offer not found' });
        }
        
        res.json({
            success: true,
            data: rows[0]
        });
    } catch (err) {
        console.error('Error updating magazine offer:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: Delete magazine offer
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        
        await query('DELETE FROM magazine_offers WHERE id = $1', [id]);
        
        res.json({
            success: true,
            message: 'Offer deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting magazine offer:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
