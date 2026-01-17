import { Router } from 'express';
import { query } from '../db/index.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/popups/active
 * الحصول على الـ Pop-ups النشطة
 */
router.get('/active', async (req, res) => {
    try {
        const { page = 'homepage' } = req.query; // homepage, products, etc.
        
        const now = new Date().toISOString();
        
        let sql = `
            SELECT 
                id, title, title_ar, description, description_ar, 
                image_url, link_url, button_text, button_text_ar,
                start_date, end_date, priority
            FROM popups
            WHERE is_active = true
                AND (start_date IS NULL OR start_date <= $1)
                AND (end_date IS NULL OR end_date >= $1)
        `;
        
        if (page === 'homepage') {
            sql += ` AND show_on_homepage = true`;
        } else if (page === 'products') {
            sql += ` AND show_on_products = true`;
        }
        
        sql += ` ORDER BY priority DESC, created_at DESC LIMIT 1`;
        
        const { rows } = await query(sql, [now]);
        
        res.json({ 
            success: true, 
            data: rows[0] || null 
        });
    } catch (err) {
        console.error('Error fetching active popups:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/popups
 * الحصول على كل الـ Pop-ups (Admin فقط)
 */
router.get('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT * FROM popups
            ORDER BY priority DESC, created_at DESC
        `);
        
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Error fetching popups:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/popups
 * إنشاء Pop-up جديد (Admin فقط)
 */
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            title, title_ar, description, description_ar,
            image_url, link_url, button_text, button_text_ar,
            start_date, end_date, is_active = true, priority = 0,
            show_on_homepage = true, show_on_products = false
        } = req.body;
        
        if (!title || !image_url) {
            return res.status(400).json({ error: 'Title and image_url are required' });
        }
        
        const { rows } = await query(`
            INSERT INTO popups (
                title, title_ar, description, description_ar,
                image_url, link_url, button_text, button_text_ar,
                start_date, end_date, is_active, priority,
                show_on_homepage, show_on_products
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `, [
            title, title_ar, description, description_ar,
            image_url, link_url, button_text, button_text_ar,
            start_date, end_date, is_active, priority,
            show_on_homepage, show_on_products
        ]);
        
        res.status(201).json({ 
            success: true, 
            data: rows[0],
            message: 'Popup created successfully' 
        });
    } catch (err) {
        console.error('Error creating popup:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/popups/:id
 * تحديث Pop-up (Admin فقط)
 */
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title, title_ar, description, description_ar,
            image_url, link_url, button_text, button_text_ar,
            start_date, end_date, is_active, priority,
            show_on_homepage, show_on_products
        } = req.body;
        
        const { rows } = await query(`
            UPDATE popups SET
                title = COALESCE($1, title),
                title_ar = COALESCE($2, title_ar),
                description = COALESCE($3, description),
                description_ar = COALESCE($4, description_ar),
                image_url = COALESCE($5, image_url),
                link_url = COALESCE($6, link_url),
                button_text = COALESCE($7, button_text),
                button_text_ar = COALESCE($8, button_text_ar),
                start_date = COALESCE($9, start_date),
                end_date = COALESCE($10, end_date),
                is_active = COALESCE($11, is_active),
                priority = COALESCE($12, priority),
                show_on_homepage = COALESCE($13, show_on_homepage),
                show_on_products = COALESCE($14, show_on_products),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $15
            RETURNING *
        `, [
            title, title_ar, description, description_ar,
            image_url, link_url, button_text, button_text_ar,
            start_date, end_date, is_active, priority,
            show_on_homepage, show_on_products, id
        ]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Popup not found' });
        }
        
        res.json({ 
            success: true, 
            data: rows[0],
            message: 'Popup updated successfully' 
        });
    } catch (err) {
        console.error('Error updating popup:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/popups/:id
 * حذف Pop-up (Admin فقط)
 */
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const { rows } = await query(`
            DELETE FROM popups WHERE id = $1 RETURNING id
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Popup not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Popup deleted successfully' 
        });
    } catch (err) {
        console.error('Error deleting popup:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
