import { Router } from 'express';
import { query } from '../db/index.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/category-banners/category/:categoryId
 * الحصول على البانر الخاص بتصنيف معين
 */
router.get('/category/:categoryId', async (req, res) => {
    try {
        const { categoryId } = req.params;
        
        const { rows } = await query(`
            SELECT 
                cb.id, cb.category_id, cb.category_name, cb.category_name_ar,
                cb.image_url, cb.mobile_image_url, cb.link_url,
                cb.title, cb.title_ar, cb.subtitle, cb.subtitle_ar,
                cb.background_color, cb.text_color, cb.priority
            FROM category_banners cb
            WHERE cb.category_id = $1 AND cb.is_active = true
            ORDER BY cb.priority DESC, cb.created_at DESC
            LIMIT 1
        `, [categoryId]);
        
        res.json({ 
            success: true, 
            data: rows[0] || null 
        });
    } catch (err) {
        console.error('Error fetching category banner:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/category-banners/category-name/:categoryName
 * الحصول على البانر عن طريق اسم التصنيف
 */
router.get('/category-name/:categoryName', async (req, res) => {
    try {
        const { categoryName } = req.params;
        
        const { rows } = await query(`
            SELECT 
                cb.id, cb.category_id, cb.category_name, cb.category_name_ar,
                cb.image_url, cb.mobile_image_url, cb.link_url,
                cb.title, cb.title_ar, cb.subtitle, cb.subtitle_ar,
                cb.background_color, cb.text_color, cb.priority
            FROM category_banners cb
            LEFT JOIN categories c ON cb.category_id = c.id
            WHERE (
                c.name ILIKE $1 
                OR c.name_ar ILIKE $1
                OR cb.category_name ILIKE $1
                OR cb.category_name_ar ILIKE $1
            )
            AND cb.is_active = true
            ORDER BY cb.priority DESC, cb.created_at DESC
            LIMIT 1
        `, [categoryName]);
        
        res.json({ 
            success: true, 
            data: rows[0] || null 
        });
    } catch (err) {
        console.error('Error fetching category banner:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/category-banners
 * الحصول على كل البانرات (Admin فقط)
 */
router.get('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT 
                cb.*,
                c.name as category_name_from_db,
                c.name_ar as category_name_ar_from_db
            FROM category_banners cb
            LEFT JOIN categories c ON cb.category_id = c.id
            ORDER BY cb.priority DESC, cb.created_at DESC
        `);
        
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Error fetching category banners:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/category-banners
 * إنشاء بانر جديد لتصنيف (Admin فقط)
 */
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            category_id, category_name, category_name_ar,
            image_url, mobile_image_url, link_url,
            title, title_ar, subtitle, subtitle_ar,
            background_color = '#f3f4f6',
            text_color = '#1f2937',
            is_active = true,
            priority = 0
        } = req.body;
        
        if (!image_url) {
            return res.status(400).json({ error: 'image_url is required' });
        }
        
        if (!category_id && !category_name) {
            return res.status(400).json({ error: 'Either category_id or category_name is required' });
        }
        
        const { rows } = await query(`
            INSERT INTO category_banners (
                category_id, category_name, category_name_ar,
                image_url, mobile_image_url, link_url,
                title, title_ar, subtitle, subtitle_ar,
                background_color, text_color, is_active, priority
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `, [
            category_id, category_name, category_name_ar,
            image_url, mobile_image_url, link_url,
            title, title_ar, subtitle, subtitle_ar,
            background_color, text_color, is_active, priority
        ]);
        
        res.status(201).json({ 
            success: true, 
            data: rows[0],
            message: 'Category banner created successfully' 
        });
    } catch (err) {
        console.error('Error creating category banner:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/category-banners/:id
 * تحديث بانر (Admin فقط)
 */
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            category_id, category_name, category_name_ar,
            image_url, mobile_image_url, link_url,
            title, title_ar, subtitle, subtitle_ar,
            background_color, text_color, is_active, priority
        } = req.body;
        
        const { rows } = await query(`
            UPDATE category_banners SET
                category_id = COALESCE($1, category_id),
                category_name = COALESCE($2, category_name),
                category_name_ar = COALESCE($3, category_name_ar),
                image_url = COALESCE($4, image_url),
                mobile_image_url = COALESCE($5, mobile_image_url),
                link_url = COALESCE($6, link_url),
                title = COALESCE($7, title),
                title_ar = COALESCE($8, title_ar),
                subtitle = COALESCE($9, subtitle),
                subtitle_ar = COALESCE($10, subtitle_ar),
                background_color = COALESCE($11, background_color),
                text_color = COALESCE($12, text_color),
                is_active = COALESCE($13, is_active),
                priority = COALESCE($14, priority),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $15
            RETURNING *
        `, [
            category_id, category_name, category_name_ar,
            image_url, mobile_image_url, link_url,
            title, title_ar, subtitle, subtitle_ar,
            background_color, text_color, is_active, priority, id
        ]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Category banner not found' });
        }
        
        res.json({ 
            success: true, 
            data: rows[0],
            message: 'Category banner updated successfully' 
        });
    } catch (err) {
        console.error('Error updating category banner:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/category-banners/:id
 * حذف بانر (Admin فقط)
 */
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const { rows } = await query(`
            DELETE FROM category_banners WHERE id = $1 RETURNING id
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Category banner not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Category banner deleted successfully' 
        });
    } catch (err) {
        console.error('Error deleting category banner:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
