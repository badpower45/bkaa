import express from 'express';
import pool from '../database.js';

const router = express.Router();

// Get all active reels (for frontend)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM facebook_reels 
            WHERE is_active = true 
            ORDER BY display_order ASC, created_at DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching facebook reels:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch reels' });
    }
});

// Admin: Get all reels (including inactive)
router.get('/admin/all', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM facebook_reels 
            ORDER BY display_order ASC, created_at DESC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching admin facebook reels:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch reels' });
    }
});

// Get single reel
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM facebook_reels WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Reel not found' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error fetching reel:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch reel' });
    }
});

// Create new reel
router.post('/', async (req, res) => {
    try {
        const { 
            title, 
            thumbnail_url, 
            video_url, 
            facebook_url, 
            views_count, 
            duration, 
            is_active, 
            display_order 
        } = req.body;

        const result = await pool.query(`
            INSERT INTO facebook_reels (title, thumbnail_url, video_url, facebook_url, views_count, duration, is_active, display_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [title, thumbnail_url, video_url || null, facebook_url, views_count || '0', duration || '0:30', is_active !== false, display_order || 0]);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error creating reel:', error);
        res.status(500).json({ success: false, error: 'Failed to create reel' });
    }
});

// Update reel
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            title, 
            thumbnail_url, 
            video_url, 
            facebook_url, 
            views_count, 
            duration, 
            is_active, 
            display_order 
        } = req.body;

        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (title !== undefined) { updates.push(`title = $${paramIndex++}`); values.push(title); }
        if (thumbnail_url !== undefined) { updates.push(`thumbnail_url = $${paramIndex++}`); values.push(thumbnail_url); }
        if (video_url !== undefined) { updates.push(`video_url = $${paramIndex++}`); values.push(video_url); }
        if (facebook_url !== undefined) { updates.push(`facebook_url = $${paramIndex++}`); values.push(facebook_url); }
        if (views_count !== undefined) { updates.push(`views_count = $${paramIndex++}`); values.push(views_count); }
        if (duration !== undefined) { updates.push(`duration = $${paramIndex++}`); values.push(duration); }
        if (is_active !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(is_active); }
        if (display_order !== undefined) { updates.push(`display_order = $${paramIndex++}`); values.push(display_order); }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await pool.query(
            `UPDATE facebook_reels SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Reel not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error updating reel:', error);
        res.status(500).json({ success: false, error: 'Failed to update reel' });
    }
});

// Delete reel
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM facebook_reels WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Reel not found' });
        }

        res.json({ success: true, message: 'Reel deleted successfully' });
    } catch (error) {
        console.error('Error deleting reel:', error);
        res.status(500).json({ success: false, error: 'Failed to delete reel' });
    }
});

// Reorder reels
router.post('/reorder', async (req, res) => {
    try {
        const { reels } = req.body; // Array of { id, display_order }

        for (const reel of reels) {
            await pool.query(
                'UPDATE facebook_reels SET display_order = $1 WHERE id = $2',
                [reel.display_order, reel.id]
            );
        }

        res.json({ success: true, message: 'Reels reordered successfully' });
    } catch (error) {
        console.error('Error reordering reels:', error);
        res.status(500).json({ success: false, error: 'Failed to reorder reels' });
    }
});

export default router;
