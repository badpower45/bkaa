import express from 'express';
import { query } from '../database.js';

const router = express.Router();

/**
 * GET /api/magazine/pages
 * Get all active magazine pages ordered by display_order
 */
router.get('/pages', async (req, res) => {
    try {
        console.log('📚 Fetching magazine pages...');
        
        const result = await query(
            `SELECT 
                id, page_number, image_url, title, description,
                display_order, cta_text, cta_url, category_id, product_id, is_active
             FROM magazine_pages
             WHERE is_active = true
             ORDER BY display_order ASC, page_number ASC`
        );
        
        console.log('📚 Found', result.rows.length, 'active magazine pages');
        
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error fetching magazine pages:', error);
        res.status(500).json({ error: 'Failed to fetch magazine pages' });
    }
});

/**
 * GET /api/magazine/pages/:id
 * Get a specific magazine page by ID
 */
router.get('/pages/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await query(
            `SELECT * FROM magazine_pages WHERE id = $1`,
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Magazine page not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching magazine page:', error);
        res.status(500).json({ error: 'Failed to fetch magazine page' });
    }
});

/**
 * POST /api/magazine/pages
 * Create a new magazine page (Admin only)
 */
router.post('/pages', async (req, res) => {
    const {
        page_number,
        image_url,
        title,
        description,
        display_order,
        cta_text,
        cta_url,
        category_id,
        product_id
    } = req.body;
    
    // Validation
    if (!page_number || !image_url) {
        return res.status(400).json({ error: 'page_number and image_url are required' });
    }
    
    try {
        const result = await query(
            `INSERT INTO magazine_pages (
                page_number, image_url, title, description,
                display_order, cta_text, cta_url, category_id, product_id
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                page_number,
                image_url,
                title || null,
                description || null,
                display_order || 0,
                cta_text || null,
                cta_url || null,
                category_id || null,
                product_id || null
            ]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating magazine page:', error);
        
        // Handle unique constraint violation
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Page number already exists' });
        }
        
        res.status(500).json({ error: 'Failed to create magazine page' });
    }
});

/**
 * PUT /api/magazine/pages/:id
 * Update a magazine page (Admin only)
 */
router.put('/pages/:id', async (req, res) => {
    const { id } = req.params;
    const {
        page_number,
        image_url,
        title,
        description,
        display_order,
        is_active,
        cta_text,
        cta_url,
        category_id,
        product_id
    } = req.body;
    
    try {
        const result = await query(
            `UPDATE magazine_pages
             SET 
                page_number = COALESCE($1, page_number),
                image_url = COALESCE($2, image_url),
                title = COALESCE($3, title),
                description = COALESCE($4, description),
                display_order = COALESCE($5, display_order),
                is_active = COALESCE($6, is_active),
                cta_text = COALESCE($7, cta_text),
                cta_url = COALESCE($8, cta_url),
                category_id = COALESCE($9, category_id),
                product_id = COALESCE($10, product_id),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $11
             RETURNING *`,
            [
                page_number,
                image_url,
                title,
                description,
                display_order,
                is_active,
                cta_text,
                cta_url,
                category_id,
                product_id,
                id
            ]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Magazine page not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating magazine page:', error);
        res.status(500).json({ error: 'Failed to update magazine page' });
    }
});

/**
 * DELETE /api/magazine/pages/:id
 * Delete a magazine page (Admin only)
 */
router.delete('/pages/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await query(
            `DELETE FROM magazine_pages WHERE id = $1 RETURNING *`,
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Magazine page not found' });
        }
        
        res.json({ message: 'Magazine page deleted successfully', page: result.rows[0] });
    } catch (error) {
        console.error('Error deleting magazine page:', error);
        res.status(500).json({ error: 'Failed to delete magazine page' });
    }
});

export default router;
