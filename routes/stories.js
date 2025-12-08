import express from 'express';
import pool from '../database.js';

const router = express.Router();

// Get all stories for admin (including expired) - MUST BE BEFORE /:id
router.get('/admin/all', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                s.*,
                u.name as user_name
            FROM stories s
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.created_at DESC
        `);
        
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching admin stories:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stories' });
    }
});

// Get all active stories
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                s.*,
                u.name as user_name
            FROM stories s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.is_active = true 
            AND (s.expires_at IS NULL OR s.expires_at > NOW())
            ORDER BY s.priority DESC, s.created_at DESC
        `);
        
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching stories:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stories' });
    }
});

// Get single story
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT 
                s.*,
                u.name as user_name
            FROM stories s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Story not found' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error fetching story:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch story' });
    }
});

// Record a view
router.post('/:id/view', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        
        await pool.query(
            'UPDATE stories SET views_count = views_count + 1 WHERE id = $1',
            [id]
        );
        
        res.json({ success: true, message: 'View recorded' });
    } catch (error) {
        console.error('Error recording view:', error);
        res.status(500).json({ success: false, error: 'Failed to record view' });
    }
});

// Create new story (Admin)
router.post('/', async (req, res) => {
    try {
        const {
            title,
            media_url,
            media_type = 'image',
            duration = 5,
            link_url,
            link_text,
            expires_in_hours = 24,
            priority = 0,
            branch_id
        } = req.body;
        
        if (!title || !media_url) {
            return res.status(400).json({ success: false, error: 'Title and media_url are required' });
        }
        
        const expires_at = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000);
        
        const result = await pool.query(`
            INSERT INTO stories (title, media_url, media_type, duration, link_url, link_text, expires_at, priority, branch_id, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
            RETURNING *
        `, [title, media_url, media_type, duration, link_url, link_text, expires_at, priority, branch_id]);
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error creating story:', error);
        res.status(500).json({ success: false, error: 'Failed to create story' });
    }
});

// Update story (Admin)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            media_url,
            media_type,
            duration,
            link_url,
            link_text,
            expires_in_hours,
            priority,
            is_active,
            branch_id
        } = req.body;
        
        let query = 'UPDATE stories SET ';
        const values = [];
        const updates = [];
        let paramIndex = 1;
        
        if (title !== undefined) { updates.push(`title = $${paramIndex++}`); values.push(title); }
        if (media_url !== undefined) { updates.push(`media_url = $${paramIndex++}`); values.push(media_url); }
        if (media_type !== undefined) { updates.push(`media_type = $${paramIndex++}`); values.push(media_type); }
        if (duration !== undefined) { updates.push(`duration = $${paramIndex++}`); values.push(duration); }
        if (link_url !== undefined) { updates.push(`link_url = $${paramIndex++}`); values.push(link_url); }
        if (link_text !== undefined) { updates.push(`link_text = $${paramIndex++}`); values.push(link_text); }
        if (expires_in_hours !== undefined) {
            const expires_at = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000);
            updates.push(`expires_at = $${paramIndex++}`);
            values.push(expires_at);
        }
        if (priority !== undefined) { updates.push(`priority = $${paramIndex++}`); values.push(priority); }
        if (is_active !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(is_active); }
        if (branch_id !== undefined) { updates.push(`branch_id = $${paramIndex++}`); values.push(branch_id); }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        
        query += updates.join(', ') + ` WHERE id = $${paramIndex} RETURNING *`;
        values.push(id);
        
        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Story not found' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error updating story:', error);
        res.status(500).json({ success: false, error: 'Failed to update story' });
    }
});

// Delete story (Admin)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM stories WHERE id = $1 RETURNING id',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Story not found' });
        }
        
        res.json({ success: true, message: 'Story deleted' });
    } catch (error) {
        console.error('Error deleting story:', error);
        res.status(500).json({ success: false, error: 'Failed to delete story' });
    }
});

export default router;
