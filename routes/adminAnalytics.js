/**
 * Admin Analytics API Endpoints
 * Backend Routes for Admin & Analytics System
 */

import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ====================================
// 1. Customer Analytics Endpoints
// ====================================

/**
 * GET /api/admin/customer-analytics
 * الحصول على تحليلات جميع العملاء
 */
router.get('/customer-analytics', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { search, rating, sortBy, limit } = req.query;
        
        let sql = `
            SELECT 
                ca.*,
                u.is_blocked,
                u.block_reason,
                u.blocked_at,
                u.banned_until
            FROM customer_analytics ca
            LEFT JOIN users u ON ca.id = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;
        
        // البحث
        if (search) {
            sql += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone LIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        // الفلترة حسب التقييم
        if (rating && rating !== 'all') {
            sql += ` AND customer_rating = $${paramIndex}`;
            params.push(rating);
            paramIndex++;
        }
        
        // الترتيب
        const sortOptions = {
            'rejected': 'rejected_orders DESC',
            'spent': 'total_spent DESC',
            'orders': 'total_orders DESC',
            'recent': 'last_order_date DESC'
        };
        sql += ` ORDER BY ${sortOptions[sortBy] || 'total_spent DESC'}`;
        
        // الحد الأقصى
        if (limit) {
            sql += ` LIMIT $${paramIndex}`;
            params.push(parseInt(limit));
        }
        
        const result = await query(sql, params);
        
        res.json({
            success: true,
            data: result.rows,
            total: result.rowCount
        });
    } catch (error) {
        console.error('Error fetching customer analytics:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch customer analytics' 
        });
    }
});

/**
 * GET /api/admin/customer-analytics/stats
 * إحصائيات عامة عن العملاء
 * IMPORTANT: This must come BEFORE the /:userId route
 */
router.get('/customer-analytics/stats', [verifyToken, isAdmin], async (req, res) => {
    try {
        const stats = await query(`
            SELECT 
                COUNT(*) as total_customers,
                COUNT(CASE WHEN customer_rating = 'excellent' THEN 1 END) as excellent_customers,
                COUNT(CASE WHEN customer_rating = 'good' THEN 1 END) as good_customers,
                COUNT(CASE WHEN customer_rating = 'problematic' THEN 1 END) as problematic_customers,
                COUNT(CASE WHEN customer_rating = 'banned' THEN 1 END) as banned_customers,
                SUM(total_orders) as total_orders_all,
                SUM(rejected_orders) as total_rejected_orders,
                SUM(completed_orders) as total_completed_orders,
                SUM(total_spent) as total_revenue,
                AVG(average_order_value) as avg_order_value
            FROM customer_analytics
        `);
        
        res.json({
            success: true,
            data: stats.rows[0]
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch stats' 
        });
    }
});

/**
 * GET /api/admin/customer-analytics/:userId
 * الحصول على تحليلات عميل محدد
 */
router.get('/customer-analytics/:userId', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await query(
            `SELECT 
                ca.*,
                u.is_blocked,
                u.block_reason,
                u.blocked_at,
                u.banned_until
            FROM customer_analytics ca
            LEFT JOIN users u ON ca.id = u.id
            WHERE ca.id = $1`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch customer' 
        });
    }
});

/**
 * PUT /api/admin/customers/:userId/rating
 * تحديث تقييم العميل يدوياً
 */
router.put('/customers/:userId/rating', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { userId } = req.params;
        const { rating } = req.body;
        
        // التحقق من صحة التقييم
        const validRatings = ['excellent', 'good', 'problematic', 'banned', 'new'];
        if (!validRatings.includes(rating)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid rating value'
            });
        }
        
        const result = await query(
            'UPDATE users SET customer_rating = $1 WHERE id = $2 RETURNING *',
            [rating, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Customer rating updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating customer rating:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update customer rating' 
        });
    }
});

/**
 * GET /api/admin/customer-analytics/stats
 * إحصائيات عامة عن العملاء
 */
router.get('/customer-analytics/stats', [verifyToken, isAdmin], async (req, res) => {
    try {
        const stats = await query(`
            SELECT 
                COUNT(*) as total_customers,
                COUNT(CASE WHEN customer_rating = 'excellent' THEN 1 END) as excellent_customers,
                COUNT(CASE WHEN customer_rating = 'good' THEN 1 END) as good_customers,
                COUNT(CASE WHEN customer_rating = 'problematic' THEN 1 END) as problematic_customers,
                COUNT(CASE WHEN customer_rating = 'banned' THEN 1 END) as banned_customers,
                SUM(total_orders) as total_orders_all,
                SUM(rejected_orders) as total_rejected_orders,
                SUM(completed_orders) as total_completed_orders,
                SUM(total_spent) as total_revenue,
                AVG(average_order_value) as avg_order_value
            FROM customer_analytics
        `);
        
        res.json({
            success: true,
            data: stats.rows[0]
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch stats' 
        });
    }
});


// ====================================
// 2. Banner Management Endpoints
// ====================================

/**
 * PUT /api/categories/:categoryId/banner
 * تحديث بانر التصنيف
 */
router.put('/categories/:categoryId/banner', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { 
            banner_type,
            banner_title,
            banner_subtitle,
            banner_image,
            bg_color,
            banner_action_url,
            banner_button_text
        } = req.body;
        
        const result = await query(`
            UPDATE categories 
            SET 
                banner_type = $1,
                banner_title = $2,
                banner_subtitle = $3,
                banner_image = $4,
                bg_color = $5,
                banner_action_url = $6,
                banner_button_text = $7,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $8
            RETURNING *
        `, [
            banner_type,
            banner_title,
            banner_subtitle,
            banner_image,
            bg_color,
            banner_action_url,
            banner_button_text,
            categoryId
        ]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Banner updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating banner:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update banner' 
        });
    }
});

/**
 * POST /api/banner-clicks
 * تسجيل نقرة على بانر (للتحليلات)
 */
router.post('/banner-clicks', async (req, res) => {
    try {
        const { 
            category_id, 
            user_id, 
            banner_type, 
            action_url, 
            session_id 
        } = req.body;
        
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;
        
        await query(`
            INSERT INTO banner_clicks (
                category_id, user_id, banner_type, action_url, 
                session_id, user_agent, ip_address
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            category_id,
            user_id || null,
            banner_type,
            action_url,
            session_id,
            userAgent,
            ipAddress
        ]);
        
        res.json({
            success: true,
            message: 'Click tracked successfully'
        });
    } catch (error) {
        console.error('Error tracking banner click:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to track click' 
        });
    }
});

/**
 * GET /api/admin/banner-analytics
 * إحصائيات البانرات
 */
router.get('/banner-analytics', [verifyToken, isAdmin], async (req, res) => {
    try {
        const result = await query('SELECT * FROM banner_analytics ORDER BY total_clicks DESC');
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching banner analytics:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch banner analytics' 
        });
    }
});


// ====================================
// 3. Push Notifications Endpoints
// ====================================

/**
 * POST /api/notifications/send
 * إرسال إشعار فوري
 */
router.post('/notifications/send', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { 
            title, 
            body, 
            image_url, 
            action_url, 
            notification_type,
            target_segment,
            target_user_ids,
            metadata
        } = req.body;
        
        const userId = req.user.id; // من middleware
        
        // استدعاء الـ Stored Procedure
        const result = await query(`
            SELECT send_push_notification($1, $2, $3, $4, $5, $6, $7, $8, $9) as notification_id
        `, [
            title,
            body,
            notification_type || 'custom',
            image_url || null,
            action_url || null,
            target_segment || 'all',
            target_user_ids || null,
            userId,
            metadata || null
        ]);
        
        const notificationId = result.rows[0].notification_id;
        
        // هنا يتم الإرسال الفعلي عبر OneSignal أو FCM
        // await sendViaOneSignal(title, body, image_url, action_url);
        
        res.json({
            success: true,
            message: 'Notification sent successfully',
            notification_id: notificationId
        });
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send notification' 
        });
    }
});

/**
 * POST /api/notifications/subscribe
 * تسجيل اشتراك إشعارات
 */
router.post('/notifications/subscribe', async (req, res) => {
    try {
        const { user_id, device_token, platform, metadata } = req.body;
        
        await query(`
            INSERT INTO push_subscriptions (user_id, device_token, platform, metadata)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (device_token) 
            DO UPDATE SET 
                is_active = true, 
                last_active = CURRENT_TIMESTAMP,
                metadata = EXCLUDED.metadata
        `, [user_id, device_token, platform, metadata || null]);
        
        res.json({
            success: true,
            message: 'Subscription registered successfully'
        });
    } catch (error) {
        console.error('Error subscribing:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to subscribe' 
        });
    }
});

/**
 * DELETE /api/notifications/subscribe/:deviceToken
 * إلغاء اشتراك إشعارات
 */
router.delete('/notifications/subscribe/:deviceToken', async (req, res) => {
    try {
        const { deviceToken } = req.params;
        
        await query(`
            UPDATE push_subscriptions 
            SET is_active = false 
            WHERE device_token = $1
        `, [deviceToken]);
        
        res.json({
            success: true,
            message: 'Unsubscribed successfully'
        });
    } catch (error) {
        console.error('Error unsubscribing:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to unsubscribe' 
        });
    }
});

/**
 * GET /api/admin/notifications
 * الحصول على سجل الإشعارات
 */
router.get('/notifications', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        
        const result = await query(`
            SELECT * FROM push_notifications 
            ORDER BY sent_at DESC 
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        
        const countResult = await query('SELECT COUNT(*) FROM push_notifications');
        
        res.json({
            success: true,
            data: result.rows,
            total: parseInt(countResult.rows[0].count)
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch notifications' 
        });
    }
});
export default router;
