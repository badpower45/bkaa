/**
 * Enhanced Admin Analytics & Notifications System
 * نظام الإدارة والتحليلات المحسّن
 */

import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ====================================
// 1. Push Notifications Management
// ====================================

/**
 * POST /api/admin-enhanced/notifications/send
 * Send push notification to users
 */
router.post('/notifications/send', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { 
            title, 
            body, 
            target_users, // 'all', 'active', 'inactive', 'specific', array of user IDs
            user_ids,
            data, // Additional data
            priority = 'normal', // 'high', 'normal', 'low'
            action_url
        } = req.body;
        
        if (!title || !body) {
            return res.status(400).json({ error: 'Title and body are required' });
        }
        
        let userCondition = '';
        let params = [];
        // Determine target users
        if (target_users === 'specific' && user_ids && user_ids.length > 0) {
            userCondition = 'WHERE id = ANY($1)';
            params = [user_ids];
        } else if (target_users === 'active') {
            userCondition = `WHERE last_login > NOW() - INTERVAL '30 days'`;
        } else if (target_users === 'inactive') {
            userCondition = `WHERE last_login < NOW() - INTERVAL '30 days' OR last_login IS NULL`;
        }
        // 'all' means no condition
        
        // Get target users
        const { rows: users } = await query(
            `SELECT id, name, email, fcm_token FROM users ${userCondition}`,
            params
        );
        
        if (users.length === 0) {
            return res.status(400).json({ error: 'No users match the criteria' });
        }
        
        // Create notification record
        const { rows: notificationRows } = await query(`
            INSERT INTO push_notifications (
                title, body, target_users, user_ids, data, priority, action_url, 
                sent_count, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            title, body, target_users, 
            user_ids ? JSON.stringify(user_ids) : null,
            data ? JSON.stringify(data) : null,
            priority, action_url, users.length, req.user.id
        ]);
        
        const notificationId = notificationRows[0].id;
        
        // Create individual notification records
        for (const user of users) {
            await query(`
                INSERT INTO notifications (
                    user_id, title, message, type, data, is_read
                ) VALUES ($1, $2, $3, $4, $5, false)
            `, [
                user.id, title, body, 'push', 
                JSON.stringify({ notification_id: notificationId, action_url, ...data })
            ]);
        }
        
        // TODO: Integrate with Firebase Cloud Messaging or other push service
        // For now, just create the records
        
        res.json({
            success: true,
            message: `Notification sent to ${users.length} users`,
            data: {
                notification_id: notificationId,
                sent_count: users.length
            }
        });
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

/**
 * GET /api/admin-enhanced/notifications/history
 * Get notification history
 */
router.get('/notifications/history', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        
        const { rows } = await query(`
            SELECT pn.*, u.name as created_by_name
            FROM push_notifications pn
            LEFT JOIN users u ON pn.created_by = u.id
            ORDER BY pn.created_at DESC
            LIMIT $1 OFFSET $2
        `, [parseInt(limit), parseInt(offset)]);
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching notification history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// ====================================
// 2. Call-to-Action (CTA) Management
// ====================================

/**
 * POST /api/admin-enhanced/cta/create
 * Create a new CTA banner/button
 */
router.post('/cta/create', [verifyToken, isAdmin], async (req, res) => {
    try {
        const {
            title,
            subtitle,
            button_text,
            action_type, // 'link', 'product', 'category', 'brand', 'page'
            action_value,
            image_url,
            background_color,
            text_color,
            position, // 'home_top', 'home_middle', 'home_bottom', 'cart', 'checkout'
            priority = 0,
            start_date,
            end_date,
            is_active = true
        } = req.body;
        
        if (!title || !button_text || !action_type || !action_value) {
            return res.status(400).json({ 
                error: 'Title, button text, action type, and action value are required' 
            });
        }
        
        const { rows } = await query(`
            INSERT INTO cta_banners (
                title, subtitle, button_text, action_type, action_value,
                image_url, background_color, text_color, position, priority,
                start_date, end_date, is_active, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `, [
            title, subtitle, button_text, action_type, action_value,
            image_url, background_color || '#F97316', text_color || '#FFFFFF',
            position || 'home_middle', priority, start_date, end_date, is_active, req.user.id
        ]);
        
        res.status(201).json({
            success: true,
            message: 'CTA created successfully',
            data: rows[0]
        });
    } catch (error) {
        console.error('Error creating CTA:', error);
        res.status(500).json({ error: 'Failed to create CTA' });
    }
});

/**
 * GET /api/admin-enhanced/cta/all
 * Get all CTAs (Admin)
 */
router.get('/cta/all', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { position, is_active } = req.query;
        
        let sql = 'SELECT * FROM cta_banners WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (position) {
            sql += ` AND position = $${paramIndex}`;
            params.push(position);
            paramIndex++;
        }
        
        if (is_active !== undefined) {
            sql += ` AND is_active = $${paramIndex}`;
            params.push(is_active === 'true');
            paramIndex++;
        }
        
        sql += ' ORDER BY priority DESC, created_at DESC';
        
        const { rows } = await query(sql, params);
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching CTAs:', error);
        res.status(500).json({ error: 'Failed to fetch CTAs' });
    }
});

/**
 * GET /api/admin-enhanced/cta/active
 * Get active CTAs for specific position (Public)
 */
router.get('/cta/active', async (req, res) => {
    try {
        const { position = 'home_middle' } = req.query;
        
        const { rows } = await query(`
            SELECT * FROM cta_banners
            WHERE is_active = true
            AND position = $1
            AND (start_date IS NULL OR start_date <= NOW())
            AND (end_date IS NULL OR end_date >= NOW())
            ORDER BY priority DESC
            LIMIT 5
        `, [position]);
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching active CTAs:', error);
        res.status(500).json({ error: 'Failed to fetch CTAs' });
    }
});

/**
 * PUT /api/admin-enhanced/cta/:id
 * Update CTA
 */
router.put('/cta/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const allowedFields = [
            'title', 'subtitle', 'button_text', 'action_type', 'action_value',
            'image_url', 'background_color', 'text_color', 'position', 'priority',
            'start_date', 'end_date', 'is_active'
        ];
        
        const updateFields = [];
        const values = [];
        let paramIndex = 1;
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                updateFields.push(`${field} = $${paramIndex}`);
                values.push(updates[field]);
                paramIndex++;
            }
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        values.push(id);
        const { rows } = await query(
            `UPDATE cta_banners SET ${updateFields.join(', ')}, updated_at = NOW() 
            WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'CTA not found' });
        }
        
        res.json({
            success: true,
            message: 'CTA updated successfully',
            data: rows[0]
        });
    } catch (error) {
        console.error('Error updating CTA:', error);
        res.status(500).json({ error: 'Failed to update CTA' });
    }
});

/**
 * DELETE /api/admin-enhanced/cta/:id
 * Delete CTA
 */
router.delete('/cta/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        
        const { rows } = await query(
            'DELETE FROM cta_banners WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'CTA not found' });
        }
        
        res.json({
            success: true,
            message: 'CTA deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting CTA:', error);
        res.status(500).json({ error: 'Failed to delete CTA' });
    }
});

/**
 * POST /api/admin-enhanced/cta/:id/track-click
 * Track CTA click
 */
router.post('/cta/:id/track-click', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id } = req.body;
        
        // Increment click count
        await query(
            'UPDATE cta_banners SET clicks = clicks + 1 WHERE id = $1',
            [id]
        );
        
        // Record click event
        await query(
            `INSERT INTO cta_clicks (cta_id, user_id) VALUES ($1, $2)`,
            [id, user_id || null]
        );
        
        res.json({
            success: true,
            message: 'Click tracked'
        });
    } catch (error) {
        console.error('Error tracking click:', error);
        res.status(500).json({ error: 'Failed to track click' });
    }
});

// ====================================
// 3. Analytics Dashboard
// ====================================

/**
 * GET /api/admin-enhanced/dashboard/overview
 * Get dashboard overview statistics
 */
router.get('/dashboard/overview', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { period = '30' } = req.query; // days
        
        const stats = await query(`
            SELECT
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '${period} days') as new_users,
                (SELECT COUNT(*) FROM orders) as total_orders,
                (SELECT COUNT(*) FROM orders WHERE date > NOW() - INTERVAL '${period} days') as recent_orders,
                (SELECT SUM(total) FROM orders WHERE status != 'cancelled') as total_revenue,
                (SELECT SUM(total) FROM orders WHERE date > NOW() - INTERVAL '${period} days' AND status != 'cancelled') as recent_revenue,
                (SELECT COUNT(*) FROM products) as total_products,
                (SELECT COUNT(*) FROM returns WHERE status = 'pending') as pending_returns
        `);
        
        // Top products
        const { rows: topProducts } = await query(`
            SELECT 
                p.id, p.name_ar, p.image_url,
                COUNT(DISTINCT o.id) as order_count,
                SUM((oi->>'quantity')::int) as total_sold
            FROM products p
            JOIN orders o ON o.items::jsonb @> jsonb_build_array(jsonb_build_object('id', p.id))
            CROSS JOIN LATERAL jsonb_array_elements(o.items) oi
            WHERE o.date > NOW() - INTERVAL '${period} days'
            GROUP BY p.id
            ORDER BY total_sold DESC
            LIMIT 5
        `);
        
        // Recent activity
        const { rows: recentActivity } = await query(`
            (SELECT 'order' as type, id, date as created_at, total as value FROM orders ORDER BY date DESC LIMIT 5)
            UNION ALL
            (SELECT 'user' as type, id, created_at, 0 as value FROM users ORDER BY created_at DESC LIMIT 5)
            ORDER BY created_at DESC
            LIMIT 10
        `);
        
        res.json({
            success: true,
            data: {
                overview: stats.rows[0],
                topProducts,
                recentActivity
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard overview:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

export default router;
