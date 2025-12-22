import express from 'express';
import { query } from '../database.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Add review/comment for a product
 */
router.post('/add', verifyToken, async (req, res) => {
    try {
        const { product_id, rating, comment, images } = req.body;
        const user_id = req.user.id;

        if (!product_id || !rating) {
            return res.status(400).json({ error: 'Product ID and rating are required' });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }

        // Check if product exists
        const { rows: productCheck } = await query(
            'SELECT id FROM products WHERE id = $1',
            [product_id]
        );

        if (productCheck.length === 0) {
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }

        // Check if user already reviewed this product
        const { rows: existingReview } = await query(
            'SELECT id FROM product_reviews WHERE user_id = $1 AND product_id = $2',
            [user_id, product_id]
        );

        if (existingReview.length > 0) {
            // Update existing review
            const { rows } = await query(`
                UPDATE product_reviews 
                SET rating = $1, 
                    comment = $2,
                    updated_at = NOW()
                WHERE id = $3
                RETURNING *
            `, [rating, comment, existingReview[0].id]);

            // Recalculate product rating
            await updateProductRating(product_id);

            return res.json({
                success: true,
                message: 'تم تحديث تقييمك بنجاح',
                review: rows[0]
            });
        }

        // Insert new review
        const { rows } = await query(`
            INSERT INTO product_reviews (
                user_id, product_id, rating, comment
            ) VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [user_id, product_id, rating, comment]);

        // Recalculate product rating
        await updateProductRating(product_id);

        res.json({
            success: true,
            message: 'تم إضافة تقييمك بنجاح',
            review: rows[0]
        });

    } catch (error) {
        console.error('Error adding review:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get reviews for a product
 */
router.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { page = 1, limit = 10, sort = 'recent' } = req.query;
        const offset = (page - 1) * limit;

        let orderBy = 'pr.created_at DESC'; // Default: most recent
        
        if (sort === 'highest') {
            orderBy = 'pr.rating DESC, pr.created_at DESC';
        } else if (sort === 'lowest') {
            orderBy = 'pr.rating ASC, pr.created_at DESC';
        } else if (sort === 'helpful') {
            orderBy = 'pr.helpful_count DESC, pr.created_at DESC';
        }

        const { rows: reviews } = await query(`
            SELECT 
                pr.*,
                u.name as user_name,
                (SELECT COUNT(*) FROM product_reviews WHERE product_id = pr.product_id) as total_reviews
            FROM product_reviews pr
            JOIN users u ON pr.user_id = u.id
            WHERE pr.product_id = $1 AND pr.is_approved = true
            ORDER BY ${orderBy}
            LIMIT $2 OFFSET $3
        `, [productId, limit, offset]);

        // Get rating distribution
        const { rows: distribution } = await query(`
            SELECT 
                rating,
                COUNT(*) as count
            FROM product_reviews
            WHERE product_id = $1 AND is_approved = true
            GROUP BY rating
            ORDER BY rating DESC
        `, [productId]);

        // Get overall stats
        const { rows: stats } = await query(`
            SELECT 
                COUNT(*) as total_reviews,
                AVG(rating)::numeric(3,2) as average_rating,
                COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
                COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
                COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
                COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
                COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
            FROM product_reviews
            WHERE product_id = $1 AND is_approved = true
        `, [productId]);

        res.json({
            reviews,
            stats: stats[0],
            distribution,
            pagination: {
                current_page: parseInt(page),
                limit: parseInt(limit),
                total: reviews[0]?.total_reviews || 0
            }
        });

    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Mark review as helpful
 */
router.post('/helpful/:reviewId', verifyToken, async (req, res) => {
    try {
        const { reviewId } = req.params;
        const user_id = req.user.id;

        // Check if already marked as helpful
        const { rows: existing } = await query(
            'SELECT id FROM review_helpful WHERE review_id = $1 AND user_id = $2',
            [reviewId, user_id]
        );

        if (existing.length > 0) {
            // Remove helpful mark
            await query(
                'DELETE FROM review_helpful WHERE review_id = $1 AND user_id = $2',
                [reviewId, user_id]
            );

            await query(
                'UPDATE product_reviews SET helpful_count = GREATEST(0, helpful_count - 1) WHERE id = $1',
                [reviewId]
            );

            return res.json({ success: true, helpful: false });
        }

        // Add helpful mark
        await query(
            'INSERT INTO review_helpful (review_id, user_id) VALUES ($1, $2)',
            [reviewId, user_id]
        );

        await query(
            'UPDATE product_reviews SET helpful_count = helpful_count + 1 WHERE id = $1',
            [reviewId]
        );

        res.json({ success: true, helpful: true });

    } catch (error) {
        console.error('Error marking review helpful:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Delete review (own review only)
 */
router.delete('/:reviewId', verifyToken, async (req, res) => {
    try {
        const { reviewId } = req.params;
        const user_id = req.user.id;

        const { rows } = await query(
            'DELETE FROM product_reviews WHERE id = $1 AND user_id = $2 RETURNING product_id',
            [reviewId, user_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'التقييم غير موجود' });
        }

        // Recalculate product rating
        await updateProductRating(rows[0].product_id);

        res.json({ success: true, message: 'تم حذف التقييم' });

    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Admin: Approve/reject review
 */
router.put('/admin/approve/:reviewId', verifyToken, async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { is_approved } = req.body;

        const { rows } = await query(`
            UPDATE product_reviews 
            SET is_approved = $1, 
                updated_at = NOW()
            WHERE id = $2
            RETURNING product_id
        `, [is_approved, reviewId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'التقييم غير موجود' });
        }

        // Recalculate product rating
        await updateProductRating(rows[0].product_id);

        res.json({ 
            success: true, 
            message: is_approved ? 'تم قبول التقييم' : 'تم رفض التقييم' 
        });

    } catch (error) {
        console.error('Error approving review:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Admin: Get pending reviews
 */
router.get('/admin/pending', verifyToken, async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT 
                pr.*,
                u.name as user_name,
                u.email as user_email,
                p.name_ar as product_name
            FROM product_reviews pr
            JOIN users u ON pr.user_id = u.id
            JOIN products p ON pr.product_id = p.id
            WHERE pr.is_approved = false
            ORDER BY pr.created_at DESC
        `);

        res.json({ data: rows });

    } catch (error) {
        console.error('Error fetching pending reviews:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Helper: Update product average rating
 */
async function updateProductRating(productId) {
    try {
        const { rows } = await query(`
            SELECT 
                AVG(rating)::numeric(3,2) as avg_rating,
                COUNT(*) as review_count
            FROM product_reviews
            WHERE product_id = $1 AND is_approved = true
        `, [productId]);

        const avgRating = rows[0].avg_rating || 0;
        const reviewCount = rows[0].review_count || 0;

        await query(`
            UPDATE products 
            SET rating = $1,
                reviews_count = $2
            WHERE id = $3
        `, [avgRating, reviewCount, productId]);

    } catch (error) {
        console.error('Error updating product rating:', error);
    }
}

export default router;
