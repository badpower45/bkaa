import express from 'express';
import pool, { query } from '../database.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Get current user's favorites (authenticated)
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;
        
        const result = await query(`
            SELECT 
                f.id,
                f.user_id,
                f.product_id,
                f.created_at,
                p.name,
                p.description,
                p.category,
                p.subcategory,
                p.rating,
                p.reviews,
                p.image,
                p.weight,
                p.barcode,
                COALESCE(bp.price, 0) as price,
                bp.discount_price as original_price,
                bp.stock_quantity,
                bp.is_available
            FROM favorites f
            JOIN products p ON f.product_id::text = p.id::text
            LEFT JOIN branch_products bp ON p.id::text = bp.product_id::text AND bp.branch_id = 1
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC
        `, [userId]);
        
        const favorites = result.rows.map(row => ({
            id: row.product_id,
            name: row.name,
            description: row.description,
            category: row.category,
            subcategory: row.subcategory,
            rating: parseFloat(row.rating) || 0,
            reviews: row.reviews || 0,
            image: row.image,
            weight: row.weight,
            barcode: row.barcode,
            price: parseFloat(row.price) || 0,
            originalPrice: row.original_price ? parseFloat(row.original_price) : null,
            stockQuantity: row.stock_quantity,
            isAvailable: row.is_available
        }));
        
        res.json({ message: 'success', data: favorites });
    } catch (err) {
        console.error('Error getting favorites:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get user's favorites by userId (legacy)
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Get favorites with product details (using only existing columns)
        const result = await pool.query(`
            SELECT 
                f.id,
                f.user_id,
                f.product_id,
                f.created_at,
                p.name,
                p.description,
                p.category,
                p.subcategory,
                p.rating,
                p.reviews,
                p.image,
                p.weight,
                p.barcode,
                COALESCE(bp.price, 0) as price,
                bp.discount_price as original_price,
                bp.stock_quantity,
                bp.is_available
            FROM favorites f
            JOIN products p ON f.product_id::text = p.id::text
            LEFT JOIN branch_products bp ON p.id::text = bp.product_id::text AND bp.branch_id = 1
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC
        `, [userId]);
        
        // Transform to match Product type
        const favorites = result.rows.map(row => ({
            id: row.product_id,
            name: row.name,
            description: row.description,
            category: row.category,
            subcategory: row.subcategory,
            rating: parseFloat(row.rating) || 0,
            reviews: row.reviews || 0,
            image: row.image,
            weight: row.weight,
            barcode: row.barcode,
            price: parseFloat(row.price) || 0,
            originalPrice: row.original_price ? parseFloat(row.original_price) : null,
            stockQuantity: row.stock_quantity,
            isAvailable: row.is_available,
            favoriteId: row.id,
            addedAt: row.created_at
        }));
        
        res.json({ success: true, data: favorites });
    } catch (error) {
        console.error('Error fetching favorites:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch favorites' });
    }
});

// Add product to favorites
router.post('/', async (req, res) => {
    try {
        const { userId, productId } = req.body;
        
        if (!userId || !productId) {
            return res.status(400).json({ success: false, error: 'userId and productId are required' });
        }
        
        // Check if already in favorites
        const existing = await pool.query(
            'SELECT id FROM favorites WHERE user_id = $1 AND product_id = $2',
            [userId, productId]
        );
        
        if (existing.rows.length > 0) {
            return res.json({ success: true, message: 'Already in favorites', data: { id: existing.rows[0].id } });
        }
        
        // Add to favorites
        const result = await pool.query(
            'INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) RETURNING id, created_at',
            [userId, productId]
        );
        
        res.json({ 
            success: true, 
            message: 'Added to favorites',
            data: { id: result.rows[0].id, createdAt: result.rows[0].created_at }
        });
    } catch (error) {
        console.error('Error adding to favorites:', error);
        res.status(500).json({ success: false, error: 'Failed to add to favorites' });
    }
});

// Remove product from favorites
router.delete('/:userId/:productId', async (req, res) => {
    try {
        const { userId, productId } = req.params;
        
        const result = await pool.query(
            'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2 RETURNING id',
            [userId, productId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Favorite not found' });
        }
        
        res.json({ success: true, message: 'Removed from favorites' });
    } catch (error) {
        console.error('Error removing from favorites:', error);
        res.status(500).json({ success: false, error: 'Failed to remove from favorites' });
    }
});

// Check if product is in favorites
router.get('/:userId/check/:productId', async (req, res) => {
    try {
        const { userId, productId } = req.params;
        
        const result = await pool.query(
            'SELECT id FROM favorites WHERE user_id = $1 AND product_id = $2',
            [userId, productId]
        );
        
        res.json({ 
            success: true, 
            isFavorite: result.rows.length > 0,
            data: result.rows[0] || null
        });
    } catch (error) {
        console.error('Error checking favorite:', error);
        res.status(500).json({ success: false, error: 'Failed to check favorite' });
    }
});

// Clear all favorites for a user
router.delete('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        await pool.query('DELETE FROM favorites WHERE user_id = $1', [userId]);
        
        res.json({ success: true, message: 'All favorites cleared' });
    } catch (error) {
        console.error('Error clearing favorites:', error);
        res.status(500).json({ success: false, error: 'Failed to clear favorites' });
    }
});

export default router;
