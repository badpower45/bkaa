import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get loyalty transactions for a user
router.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const userId = req.query.userId || req.user.id;
        const result = await db.query(
            `SELECT * FROM loyalty_points_history 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 100`,
            [userId]
        );
        res.json({ data: result.rows });
    } catch (error) {
        console.error('Error fetching loyalty transactions:', error);
        res.status(500).json({ error: 'Failed to fetch loyalty transactions' });
    }
});

// Get user's current loyalty points
router.get('/balance', authenticateToken, async (req, res) => {
    try {
        const userId = req.query.userId || req.user.id;
        const result = await db.query(
            'SELECT loyalty_points FROM users WHERE id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ points: result.rows[0].loyalty_points || 0 });
    } catch (error) {
        console.error('Error fetching loyalty balance:', error);
        res.status(500).json({ error: 'Failed to fetch loyalty balance' });
    }
});

export default router;
