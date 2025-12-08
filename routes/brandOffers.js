import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all active brand offers (public)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT * FROM brand_offers 
            WHERE is_active = true 
            AND (starts_at IS NULL OR starts_at <= NOW())
            AND (expires_at IS NULL OR expires_at >= NOW())
            ORDER BY display_order ASC
        `);
        res.json({ data: rows, message: 'success' });
    } catch (err) {
        console.error('Error fetching brand offers:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all brand offers (admin)
router.get('/admin', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT * FROM brand_offers 
            ORDER BY display_order ASC
        `);
        res.json({ data: rows, message: 'success' });
    } catch (err) {
        console.error('Error fetching all brand offers:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get single brand offer
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await query('SELECT * FROM brand_offers WHERE id = $1', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Brand offer not found' });
        }
        
        res.json({ data: rows[0], message: 'success' });
    } catch (err) {
        console.error('Error fetching brand offer:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create brand offer (admin)
router.post('/', [verifyToken, isAdmin], async (req, res) => {
    try {
        const {
            title, title_ar, subtitle, subtitle_ar,
            discount_text, discount_text_ar,
            background_type, background_value, text_color,
            badge_color, badge_text_color,
            image_url, brand_logo_url,
            linked_product_id, linked_brand_id, link_type, custom_link,
            is_active, display_order, starts_at, expires_at
        } = req.body;

        const { rows } = await query(`
            INSERT INTO brand_offers (
                title, title_ar, subtitle, subtitle_ar,
                discount_text, discount_text_ar,
                background_type, background_value, text_color,
                badge_color, badge_text_color,
                image_url, brand_logo_url,
                linked_product_id, linked_brand_id, link_type, custom_link,
                is_active, display_order, starts_at, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING *
        `, [
            title, title_ar, subtitle, subtitle_ar,
            discount_text, discount_text_ar,
            background_type || 'gradient', background_value, text_color || '#FEF3C7',
            badge_color || '#EF4444', badge_text_color || '#FFFFFF',
            image_url, brand_logo_url,
            linked_product_id, linked_brand_id, link_type || 'product', custom_link,
            is_active !== false, display_order || 0, starts_at, expires_at
        ]);

        res.status(201).json({ data: rows[0], message: 'Brand offer created successfully' });
    } catch (err) {
        console.error('Error creating brand offer:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update brand offer (admin)
router.put('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title, title_ar, subtitle, subtitle_ar,
            discount_text, discount_text_ar,
            background_type, background_value, text_color,
            badge_color, badge_text_color,
            image_url, brand_logo_url,
            linked_product_id, linked_brand_id, link_type, custom_link,
            is_active, display_order, starts_at, expires_at
        } = req.body;

        const { rows } = await query(`
            UPDATE brand_offers SET
                title = COALESCE($1, title),
                title_ar = COALESCE($2, title_ar),
                subtitle = COALESCE($3, subtitle),
                subtitle_ar = COALESCE($4, subtitle_ar),
                discount_text = COALESCE($5, discount_text),
                discount_text_ar = COALESCE($6, discount_text_ar),
                background_type = COALESCE($7, background_type),
                background_value = COALESCE($8, background_value),
                text_color = COALESCE($9, text_color),
                badge_color = COALESCE($10, badge_color),
                badge_text_color = COALESCE($11, badge_text_color),
                image_url = COALESCE($12, image_url),
                brand_logo_url = COALESCE($13, brand_logo_url),
                linked_product_id = $14,
                linked_brand_id = $15,
                link_type = COALESCE($16, link_type),
                custom_link = $17,
                is_active = COALESCE($18, is_active),
                display_order = COALESCE($19, display_order),
                starts_at = $20,
                expires_at = $21,
                updated_at = NOW()
            WHERE id = $22
            RETURNING *
        `, [
            title, title_ar, subtitle, subtitle_ar,
            discount_text, discount_text_ar,
            background_type, background_value, text_color,
            badge_color, badge_text_color,
            image_url, brand_logo_url,
            linked_product_id, linked_brand_id, link_type, custom_link,
            is_active, display_order, starts_at, expires_at, id
        ]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Brand offer not found' });
        }

        res.json({ data: rows[0], message: 'Brand offer updated successfully' });
    } catch (err) {
        console.error('Error updating brand offer:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete brand offer (admin)
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await query('DELETE FROM brand_offers WHERE id = $1 RETURNING *', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Brand offer not found' });
        }
        
        res.json({ message: 'Brand offer deleted successfully' });
    } catch (err) {
        console.error('Error deleting brand offer:', err);
        res.status(500).json({ error: err.message });
    }
});

// Reorder brand offers (admin)
router.put('/reorder/batch', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { orders } = req.body; // Array of { id, display_order }
        
        for (const order of orders) {
            await query(
                'UPDATE brand_offers SET display_order = $1, updated_at = NOW() WHERE id = $2',
                [order.display_order, order.id]
            );
        }
        
        res.json({ message: 'Brand offers reordered successfully' });
    } catch (err) {
        console.error('Error reordering brand offers:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
