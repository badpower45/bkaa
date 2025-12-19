import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ============ PUBLIC ROUTES ============

// Get all active notifications for a user
router.get('/user', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const { rows } = await query(`
            SELECT * FROM notifications
            WHERE user_id = $1 OR user_id IS NULL
            ORDER BY created_at DESC
            LIMIT 50
        `, [userId]);
        
        res.json({ data: rows, message: 'success' });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ error: err.message });
    }
});

// Mark notification as read
router.put('/read/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const { rows } = await query(`
            UPDATE notifications SET is_read = true
            WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
            RETURNING *
        `, [id, userId]);
        
        res.json({ data: rows[0], message: 'Notification marked as read' });
    } catch (err) {
        console.error('Error marking notification as read:', err);
        res.status(500).json({ error: err.message });
    }
});

// Mark all as read
router.put('/read-all', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        await query(`
            UPDATE notifications SET is_read = true
            WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false
        `, [userId]);
        
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error('Error marking all as read:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get unread count
router.get('/unread-count', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const { rows } = await query(`
            SELECT COUNT(*) as count FROM notifications
            WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false
        `, [userId]);
        
        res.json({ data: { count: parseInt(rows[0].count) }, message: 'success' });
    } catch (err) {
        console.error('Error fetching unread count:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ ADMIN ROUTES ============

// Create notification (admin)
router.post('/admin/create', [verifyToken, isAdmin], async (req, res) => {
    try {
        const {
            user_id, type, title, body, data, image_url, link_url
        } = req.body;
        
        if (!type || !title || !body) {
            return res.status(400).json({ error: 'Type, title, and body are required' });
        }
        
        const { rows } = await query(`
            INSERT INTO notifications (
                user_id, type, title, body, data, image_url, link_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            user_id || null, // null means send to all users
            type, title, body,
            data ? JSON.stringify(data) : '{}',
            image_url || null,
            link_url || null
        ]);
        
        res.status(201).json({ data: rows[0], message: 'Notification created successfully' });
    } catch (err) {
        console.error('Error creating notification:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all notifications (admin)
router.get('/admin/all', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { limit = 100, offset = 0, type } = req.query;
        
        let queryStr = `
            SELECT n.*, u.name as user_name
            FROM notifications n
            LEFT JOIN users u ON n.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        
        if (type) {
            params.push(type);
            queryStr += ` AND n.type = $${params.length}`;
        }
        
        params.push(limit, offset);
        queryStr += ` ORDER BY n.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
        
        const { rows } = await query(queryStr, params);
        res.json({ data: rows, message: 'success' });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete notification (admin)
router.delete('/admin/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM notifications WHERE id = $1', [id]);
        res.json({ message: 'Notification deleted successfully' });
    } catch (err) {
        console.error('Error deleting notification:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;

// Helper function to send notification
export async function sendNotification(userId, type, title, body, data = {}, imageUrl = null, linkUrl = null) {
    try {
        await query(`
            INSERT INTO notifications (
                user_id, type, title, body, data, image_url, link_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            userId || null,
            type, title, body,
            JSON.stringify(data),
            imageUrl, linkUrl
        ]);
        return { success: true };
    } catch (err) {
        console.error('Error sending notification:', err);
        return { success: false, error: err.message };
    }
}

// Helper: Send notification when new reel added
export async function notifyNewReel(reelTitle, reelId) {
    return sendNotification(
        null, // Send to all users
        'reel',
        'ريل جديد! 🎬',
        `تم إضافة ريل جديد: ${reelTitle}`,
        { reel_id: reelId },
        null,
        `/reels/${reelId}`
    );
}

// Helper: Send notification when new offer added
export async function notifyNewOffer(offerTitle, offerId) {
    return sendNotification(
        null,
        'offer',
        'عرض جديد! 🎁',
        `عرض مميز: ${offerTitle}`,
        { offer_id: offerId },
        null,
        `/offers/${offerId}`
    );
}

// Helper: Send notification when product added to magazine
export async function notifyProductInMagazine(productName, productId) {
    return sendNotification(
        null,
        'offer',
        'منتج جديد في مجلة العروض! 📰',
        `تم إضافة ${productName} لمجلة العروض`,
        { product_id: productId },
        null,
        `/product/${productId}`
    );
}
