import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all active brands (public)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT b.*, 
                   COUNT(DISTINCT p.id) as products_count,
                   bo.title_ar as current_offer_title,
                   bo.discount_text_ar as current_offer_discount
            FROM brands b
            LEFT JOIN products p ON p.brand_id = b.id
            LEFT JOIN brand_offers bo ON b.current_offer_id = bo.id AND bo.is_active = true
            WHERE b.is_active = true
            GROUP BY b.id, bo.id
            ORDER BY b.display_order ASC, b.name_ar ASC
        `);
        res.json({ data: rows, message: 'success' });
    } catch (err) {
        console.error('Error fetching brands:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get featured brands (public)
router.get('/featured', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT b.*, 
                   COUNT(DISTINCT p.id) as products_count
            FROM brands b
            LEFT JOIN products p ON p.brand_id = b.id
            WHERE b.is_active = true AND b.is_featured = true
            GROUP BY b.id
            ORDER BY b.display_order ASC
            LIMIT 10
        `);
        res.json({ data: rows, message: 'success' });
    } catch (err) {
        console.error('Error fetching featured brands:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get single brand by ID (public)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await query(`
            SELECT b.*, 
                   COUNT(DISTINCT p.id) as products_count,
                   COUNT(DISTINCT r.id) as reviews_count,
                   COALESCE(AVG(r.rating), 0) as average_rating
            FROM brands b
            LEFT JOIN products p ON p.brand_id = b.id
            LEFT JOIN reviews r ON r.product_id = p.id
            WHERE b.id = $1
            GROUP BY b.id
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Brand not found' });
        }
        
        res.json({ data: rows[0], message: 'success' });
    } catch (err) {
        console.error('Error fetching brand:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get brand categories (public)
router.get('/:id/categories', async (req, res) => {
    try {
        const { id } = req.params;
        const { branchId } = req.query;
        
        let sql = `
            SELECT DISTINCT c.id, c.name_ar, c.name_en, c.icon, c.image_url,
                   COUNT(DISTINCT p.id) as products_count
            FROM categories c
            INNER JOIN products p ON p.category_id = c.id
            INNER JOIN branch_products bp ON p.id = bp.product_id
            WHERE p.brand_id = $1 AND bp.is_available = true
        `;
        
        const params = [id];
        let paramIndex = 2;
        
        if (branchId) {
            sql += ` AND bp.branch_id = $${paramIndex}`;
            params.push(branchId);
            paramIndex++;
        }
        
        sql += ` GROUP BY c.id ORDER BY c.name_ar ASC`;
        
        const { rows } = await query(sql, params);
        res.json({ data: rows, message: 'success' });
    } catch (err) {
        console.error('Error fetching brand categories:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get brand price range (public)
router.get('/:id/price-range', async (req, res) => {
    try {
        const { id } = req.params;
        const { branchId } = req.query;
        
        let sql = `
            SELECT 
                MIN(COALESCE(bp.discount_price, bp.price)) as min_price,
                MAX(COALESCE(bp.discount_price, bp.price)) as max_price
            FROM products p
            INNER JOIN branch_products bp ON p.id = bp.product_id
            WHERE p.brand_id = $1 AND bp.is_available = true
        `;
        
        const params = [id];
        if (branchId) {
            sql += ` AND bp.branch_id = $2`;
            params.push(branchId);
        }
        
        const { rows } = await query(sql, params);
        res.json({ 
            data: {
                min: parseFloat(rows[0].min_price) || 0,
                max: parseFloat(rows[0].max_price) || 0
            },
            message: 'success' 
        });
    } catch (err) {
        console.error('Error fetching brand price range:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get brand products with advanced filtering (public)
router.get('/:id/products', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            category, 
            minPrice, 
            maxPrice, 
            sortBy = 'name_asc', 
            available = 'true',
            branchId,
            limit,
            offset = 0
        } = req.query;
        
        let sql = `
            SELECT p.*, 
                   bp.price, 
                   bp.discount_price, 
                   bp.stock_quantity,
                   bp.is_available,
                   bp.branch_id,
                   COALESCE(AVG(r.rating), 0) as average_rating,
                   COUNT(DISTINCT r.id) as reviews_count,
                   c.name_ar as category_name
            FROM products p
            INNER JOIN branch_products bp ON p.id = bp.product_id
            LEFT JOIN reviews r ON r.product_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.brand_id = $1
        `;
        
        const params = [id];
        let paramIndex = 2;
        
        // Filter by branch
        if (branchId) {
            sql += ` AND bp.branch_id = $${paramIndex}`;
            params.push(branchId);
            paramIndex++;
        }
        
        // Filter by availability
        if (available === 'true') {
            sql += ` AND bp.is_available = true`;
        }
        
        // Filter by category
        if (category) {
            sql += ` AND p.category_id = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }
        
        sql += ` GROUP BY p.id, bp.price, bp.discount_price, bp.stock_quantity, bp.is_available, bp.branch_id, c.name_ar`;
        
        // Filter by price range (after GROUP BY)
        const havingConditions = [];
        if (minPrice) {
            havingConditions.push(`COALESCE(bp.discount_price, bp.price) >= ${parseFloat(minPrice)}`);
        }
        if (maxPrice) {
            havingConditions.push(`COALESCE(bp.discount_price, bp.price) <= ${parseFloat(maxPrice)}`);
        }
        if (havingConditions.length > 0) {
            sql += ` HAVING ${havingConditions.join(' AND ')}`;
        }
        
        // Sort
        const sortOptions = {
            'name_asc': 'p.name_ar ASC',
            'name_desc': 'p.name_ar DESC',
            'price_asc': 'COALESCE(bp.discount_price, bp.price) ASC',
            'price_desc': 'COALESCE(bp.discount_price, bp.price) DESC',
            'rating': 'average_rating DESC',
            'popular': 'reviews_count DESC'
        };
        sql += ` ORDER BY ${sortOptions[sortBy] || sortOptions['name_asc']}`;
        
        // Pagination
        if (limit) {
            sql += ` LIMIT ${parseInt(limit)}`;
        }
        if (offset) {
            sql += ` OFFSET ${parseInt(offset)}`;
        }
        
        const { rows } = await query(sql, params);
        
        // Get total count
        let countSql = `
            SELECT COUNT(DISTINCT p.id) as total
            FROM products p
            INNER JOIN branch_products bp ON p.id = bp.product_id
            WHERE p.brand_id = $1
        `;
        const countParams = [id];
        let countParamIndex = 2;
        
        if (branchId) {
            countSql += ` AND bp.branch_id = $${countParamIndex}`;
            countParams.push(branchId);
            countParamIndex++;
        }
        if (available === 'true') {
            countSql += ` AND bp.is_available = true`;
        }
        if (category) {
            countSql += ` AND p.category_id = $${countParamIndex}`;
            countParams.push(category);
        }
        
        const { rows: countRows } = await query(countSql, countParams);
        
        res.json({ 
            data: rows, 
            total: parseInt(countRows[0].total),
            message: 'success' 
        });
    } catch (err) {
        console.error('Error fetching brand products:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ ADMIN ROUTES ============

// Get all brands (admin)
router.get('/admin/all', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT b.*, 
                   COUNT(DISTINCT p.id) as products_count
            FROM brands b
            LEFT JOIN products p ON p.brand_id = b.id
            GROUP BY b.id
            ORDER BY b.display_order ASC, b.created_at DESC
        `);
        res.json({ data: rows, message: 'success' });
    } catch (err) {
        console.error('Error fetching all brands:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create brand (admin)
router.post('/', [verifyToken, isAdmin], async (req, res) => {
    try {
        const {
            id, name_ar, name_en, slogan_ar, slogan_en,
            description_ar, description_en, rating,
            logo_url, banner_url, primary_color, secondary_color,
            location_lat, location_lng, google_maps_link, address,
            current_offer_text, is_featured, display_order
        } = req.body;

        const { rows } = await query(`
            INSERT INTO brands (
                id, name_ar, name_en, slogan_ar, slogan_en,
                description_ar, description_en, rating,
                logo_url, banner_url, primary_color, secondary_color,
                location_lat, location_lng, google_maps_link, address,
                current_offer_text, is_featured, display_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING *
        `, [
            id || null, name_ar, name_en, slogan_ar || null, slogan_en || null,
            description_ar || null, description_en || null, rating || 0,
            logo_url || null, banner_url || null, primary_color || '#F97316', secondary_color || '#FB923C',
            location_lat || null, location_lng || null, google_maps_link || null, address || null,
            current_offer_text || null, is_featured || false, display_order || 0
        ]);

        res.status(201).json({ data: rows[0], message: 'Brand created successfully' });
    } catch (err) {
        console.error('Error creating brand:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update brand (admin)
router.put('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name_ar, name_en, slogan_ar, slogan_en,
            description_ar, description_en, rating,
            logo_url, banner_url, primary_color, secondary_color,
            location_lat, location_lng, google_maps_link, address,
            current_offer_text, is_featured, is_active, display_order
        } = req.body;

        const { rows } = await query(`
            UPDATE brands SET
                name_ar = COALESCE($1, name_ar),
                name_en = COALESCE($2, name_en),
                slogan_ar = $3,
                slogan_en = $4,
                description_ar = $5,
                description_en = $6,
                rating = COALESCE($7, rating),
                logo_url = $8,
                banner_url = $9,
                primary_color = COALESCE($10, primary_color),
                secondary_color = COALESCE($11, secondary_color),
                location_lat = $12,
                location_lng = $13,
                google_maps_link = $14,
                address = $15,
                current_offer_text = $16,
                is_featured = COALESCE($17, is_featured),
                is_active = COALESCE($18, is_active),
                display_order = COALESCE($19, display_order),
                updated_at = NOW()
            WHERE id = $20
            RETURNING *
        `, [
            name_ar, name_en, slogan_ar, slogan_en,
            description_ar, description_en, rating,
            logo_url, banner_url, primary_color, secondary_color,
            location_lat, location_lng, google_maps_link, address,
            current_offer_text, is_featured, is_active, display_order, id
        ]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Brand not found' });
        }

        res.json({ data: rows[0], message: 'Brand updated successfully' });
    } catch (err) {
        console.error('Error updating brand:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete brand (admin)
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await query('DELETE FROM brands WHERE id = $1 RETURNING *', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Brand not found' });
        }

        res.json({ data: rows[0], message: 'Brand deleted successfully' });
    } catch (err) {
        console.error('Error deleting brand:', err);
        res.status(500).json({ error: err.message });
    }
});

// Extract coordinates from Google Maps link (utility endpoint)
router.post('/extract-coordinates', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { google_maps_link } = req.body;
        
        if (!google_maps_link) {
            return res.status(400).json({ error: 'Google Maps link is required' });
        }

        // Extract coordinates from various Google Maps URL formats
        let lat = null, lng = null;
        
        // Format: @30.0444196,31.2357116
        const coordsMatch = google_maps_link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (coordsMatch) {
            lat = parseFloat(coordsMatch[1]);
            lng = parseFloat(coordsMatch[2]);
        }
        
        // Format: q=30.0444196,31.2357116
        const qMatch = google_maps_link.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (qMatch && !lat) {
            lat = parseFloat(qMatch[1]);
            lng = parseFloat(qMatch[2]);
        }

        if (!lat || !lng) {
            return res.status(400).json({ error: 'Could not extract coordinates from link' });
        }

        res.json({ 
            data: { latitude: lat, longitude: lng },
            message: 'Coordinates extracted successfully' 
        });
    } catch (err) {
        console.error('Error extracting coordinates:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
