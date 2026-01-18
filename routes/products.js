import express from 'express';
import { query } from '../database.js'; // Use the exported query helper
import { verifyToken, isAdmin } from '../middleware/auth.js';
import { createExcelUploader, createFrameUploader, verifyFileContent, handleUploadError } from '../middleware/fileUpload.js';
import { validate, productSchema, searchSchema } from '../middleware/validation.js';
import * as xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// ✅ Security: Use secure file upload middleware
const secureExcelUpload = createExcelUploader();
const secureFrameUpload = createFrameUploader();

const normalizeCategoryValue = (value = '') =>
    value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/أ|إ|آ/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\s+/g, '')
        .replace(/[-_]/g, '');

const buildCategoryIndex = async () => {
    const { rows } = await query('SELECT id, name, name_ar, parent_id FROM categories');
    const byId = new Map();
    const rootMap = new Map();
    const subMapByParent = new Map();
    const subMapGlobal = new Map();

    rows.forEach((row) => {
        byId.set(row.id, row);
        const keys = [row.name, row.name_ar].filter(Boolean).map(normalizeCategoryValue);
        if (row.parent_id) {
            const map = subMapByParent.get(row.parent_id) || new Map();
            keys.forEach((key) => {
                if (!map.has(key)) map.set(key, row);
                if (!subMapGlobal.has(key)) subMapGlobal.set(key, row);
            });
            subMapByParent.set(row.parent_id, map);
        } else {
            keys.forEach((key) => {
                if (!rootMap.has(key)) rootMap.set(key, row);
            });
        }
    });

    return { byId, rootMap, subMapByParent, subMapGlobal };
};

const mapCategoryValues = (rawCategory, rawSubcategory, categoryIndex) => {
    const categoryKey = rawCategory ? normalizeCategoryValue(rawCategory) : '';
    const subcategoryKey = rawSubcategory ? normalizeCategoryValue(rawSubcategory) : '';
    const matchedCategory = categoryKey ? categoryIndex.rootMap.get(categoryKey) : null;
    const subMap = matchedCategory ? categoryIndex.subMapByParent.get(matchedCategory.id) : null;
    const matchedSubcategory = subcategoryKey
        ? (subMap?.get(subcategoryKey) || categoryIndex.subMapGlobal.get(subcategoryKey))
        : null;
    const parentCategory = !matchedCategory && matchedSubcategory?.parent_id
        ? categoryIndex.byId.get(matchedSubcategory.parent_id)
        : null;

    return {
        category: (matchedCategory || parentCategory)?.name_ar || (matchedCategory || parentCategory)?.name || rawCategory || null,
        subcategory: matchedSubcategory?.name_ar || matchedSubcategory?.name || rawSubcategory || null
    };
};

// Dev-only: Seed sample products + branch inventory for quick testing
router.post('/dev/seed-sample', async (req, res) => {
    try {
        const isProd = process.env.NODE_ENV === 'production';
        if (isProd && process.env.ALLOW_DEV_SEED !== 'true') {
            return res.status(403).json({ error: 'Seeding disabled' });
        }

        // Ensure branch 1 exists
        let { rows: bRows } = await query('SELECT id FROM branches WHERE id = 1');
        if (bRows.length === 0) {
            await query("INSERT INTO branches (id, name, location_lat, location_lng, coverage_radius_km) VALUES (1, 'Main Branch', 30.05, 31.23, 10)");
        }

        const samples = [
            { id: 'p1001', name: 'لبن كامل الدسم 1 لتر', category: 'ألبان', image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?q=80&w=600&auto=format&fit=crop', weight: '1 لتر' },
            { id: 'p1002', name: 'أرز مصري ممتاز 1 كجم', category: 'بقالة', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?q=80&w=600&auto=format&fit=crop', weight: '1 كجم' },
            { id: 'p1003', name: 'شيبسي طماطم عائلي', category: 'سناكس', image: 'https://images.unsplash.com/photo-1613919085533-0a05360b1cbe?q=80&w=600&auto=format&fit=crop', weight: 'جامبو' },
            { id: 'p1004', name: 'بيبسي كانز 330 مل', category: 'مشروبات', image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?q=80&w=600&auto=format&fit=crop', weight: '330 مل' },
            { id: 'p1005', name: 'زيت عباد 800 مل', category: 'زيوت', image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=600&auto=format&fit=crop', weight: '800 مل' },
        ];

        await query('BEGIN');
        for (const p of samples) {
            await query(
                `INSERT INTO products (id, name, category, image, weight, rating, reviews, is_organic, is_new)
                 VALUES ($1, $2, $3, $4, $5, 0, 0, FALSE, TRUE)
                 ON CONFLICT (id) DO NOTHING`,
                [p.id, p.name, p.category, p.image, p.weight]
            );
            const price = Math.round((50 + Math.random() * 100) * 100) / 100;
            const stock = 20 + Math.floor(Math.random() * 80);
            await query(
                `INSERT INTO branch_products (branch_id, product_id, price, stock_quantity, is_available)
                 VALUES (1, $1, $2, $3, TRUE)
                 ON CONFLICT (branch_id, product_id) DO UPDATE SET price = EXCLUDED.price, stock_quantity = EXCLUDED.stock_quantity`,
                [p.id, price, stock]
            );
        }
        await query('COMMIT');

        return res.json({ message: 'seeded', count: samples.length, branchId: 1 });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Seed sample failed', err);
        return res.status(500).json({ error: 'Seed sample failed' });
    }
});

// Fix products with missing or zero prices in branch_products
router.post('/dev/fix-prices', [verifyToken, isAdmin], async (req, res) => {
    try {
        // Find products without branch_products entries
        const missingQuery = `
            SELECT p.id, p.name, p.barcode 
            FROM products p
            LEFT JOIN branch_products bp ON p.id = bp.product_id
            WHERE bp.product_id IS NULL
        `;
        const { rows: missingProducts } = await query(missingQuery);
        
        // Find products with zero prices
        const zeroPriceQuery = `
            SELECT p.id, p.name, p.barcode, bp.branch_id
            FROM products p
            JOIN branch_products bp ON p.id = bp.product_id
            WHERE bp.price = 0 OR bp.price IS NULL
        `;
        const { rows: zeroProducts } = await query(zeroPriceQuery);
        
        console.log(`\ud83d\udd27 Found ${missingProducts.length} products without branch entries`);
        console.log(`\ud83d\udd27 Found ${zeroProducts.length} products with zero/null prices`);
        
        await query('BEGIN');
        
        // Add missing products to branch 1 with default price of 10
        for (const product of missingProducts) {
            await query(`
                INSERT INTO branch_products (branch_id, product_id, price, stock_quantity, is_available)
                VALUES (1, $1, 10.00, 10, TRUE)
                ON CONFLICT (branch_id, product_id) DO NOTHING
            `, [product.id]);
        }
        
        // Update zero prices to 10
        for (const product of zeroProducts) {
            await query(`
                UPDATE branch_products 
                SET price = 10.00, stock_quantity = COALESCE(stock_quantity, 10)
                WHERE product_id = $1 AND branch_id = $2
            `, [product.id, product.branch_id]);
        }
        
        await query('COMMIT');
        
        return res.json({ 
            message: 'Prices fixed successfully',
            fixed: {
                addedToBranch: missingProducts.length,
                updatedPrices: zeroProducts.length
            },
            details: {
                missing: missingProducts.map(p => ({ id: p.id, name: p.name })),
                zeroPrice: zeroProducts.map(p => ({ id: p.id, name: p.name }))
            }
        });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Fix prices failed', err);
        return res.status(500).json({ error: 'Fix prices failed: ' + err.message });
    }
});

// ✅ NEW: Get special offers only (products with discount)
router.get('/special-offers', async (req, res) => {
    const { branchId } = req.query;
    const branch = branchId || 1; // Default branch
    
    try {
        const { rows } = await query(`
            SELECT DISTINCT p.id, p.name, p.category, p.image, p.weight, p.rating, p.reviews,
                   p.is_organic, p.is_new, p.barcode, p.shelf_location, p.subcategory, p.description,
                   p.frame_overlay_url, p.frame_enabled,
                   bp.price, bp.discount_price, bp.stock_quantity, bp.is_available, bp.branch_id
            FROM products p
            INNER JOIN branch_products bp ON p.id = bp.product_id
            WHERE bp.branch_id = $1
              AND bp.discount_price IS NOT NULL
              AND bp.discount_price > 0
              AND bp.discount_price < bp.price
              AND bp.is_available = TRUE
            ORDER BY (bp.price - bp.discount_price) DESC
            LIMIT 100
        `, [branch]);
        
        console.log(`✨ Special offers loaded: ${rows.length} products with discount`);
        return res.json({ data: rows });
    } catch (err) {
        console.error('Special offers API failed:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Get all products (filtered by branch)
router.get('/', async (req, res) => {
    const { branchId, category, search, limit, offset, includeAllBranches, includeMagazine } = req.query;
    
    // 🔥 إضافة limit و offset للـ pagination
    const limitValue = limit ? parseInt(limit) : 100; // Default 100 instead of unlimited
    const offsetValue = offset ? parseInt(offset) : 0;
    
    console.log(`📦 Products API - Branch: ${branchId}, Category: ${category || 'All'}, Limit: ${limitValue}, Offset: ${offsetValue}`);

    // For admin panel - show all products with their branch data
    if (includeAllBranches === 'true') {
        try {
            const params = [];
            let paramIndex = 1;
            let categoryParamIndex;
            let categoryCte = '';
            let categoryJoin = '';

            if (category && category !== 'All') {
                categoryParamIndex = paramIndex;
                categoryCte = `
                WITH matched_category AS (
                    SELECT c.*
                    FROM categories c
                    WHERE normalize_arabic_text(c.name) = normalize_arabic_text($${categoryParamIndex})
                       OR normalize_arabic_text(c.name_ar) = normalize_arabic_text($${categoryParamIndex})
                    LIMIT 1
                )
                `;
                categoryJoin = 'LEFT JOIN matched_category c ON TRUE';
                params.push(category);
                paramIndex++;
            }

            let sql = `
                ${categoryCte}
                SELECT DISTINCT ON (p.id) p.id, p.name, p.category, p.image, p.weight, p.rating, p.reviews, 
                       p.is_organic, p.is_new, p.barcode, p.shelf_location, p.subcategory, p.description,
                       p.frame_overlay_url, p.frame_enabled,
                       bp.price, bp.discount_price, bp.stock_quantity, bp.is_available, bp.branch_id,
                       (mo.id IS NOT NULL) AS in_magazine
                FROM products p
                LEFT JOIN branch_products bp ON p.id = bp.product_id
                ${categoryJoin}
                LEFT JOIN magazine_offers mo ON mo.product_id = p.id 
                    AND mo.is_active = TRUE 
                    AND (mo.start_date IS NULL OR mo.start_date <= NOW())
                    AND (mo.end_date IS NULL OR mo.end_date >= NOW())
                WHERE 1=1
            `;

            if (categoryParamIndex !== undefined) {
                sql += ` AND (
                    normalize_arabic_text(p.category) = normalize_arabic_text($${categoryParamIndex})
                    OR p.category = $${categoryParamIndex}
                    OR (
                        c.id IS NOT NULL
                        AND (
                            normalize_arabic_text(p.category) = normalize_arabic_text(c.name)
                            OR normalize_arabic_text(p.category) = normalize_arabic_text(c.name_ar)
                            OR p.category = c.name
                            OR p.category = c.name_ar
                        )
                    )
                )`;
            }

            if (search) {
                sql += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
                params.push(`%${search}%`);
                paramIndex++;
            }
            
            sql += ` ORDER BY p.id, bp.branch_id NULLS LAST`;
            
            // 🔥 إضافة LIMIT و OFFSET
            sql += ` LIMIT $${paramIndex}`;
            params.push(limitValue);
            paramIndex++;
            
            if (offsetValue > 0) {
                sql += ` OFFSET $${paramIndex}`;
                params.push(offsetValue);
            }

            const { rows } = await query(sql, params);
            return res.json({
                "message": "success",
                "data": rows
            });
        } catch (err) {
            console.error("Error fetching all products:", err);
            return res.status(500).json({ "error": err.message });
        }
    }

    if (!branchId) {
        // Enforce branch selection as per requirements
        return res.json({
            "message": "success",
            "data": []
        });
    }

    try {
        // Add cache headers for better performance
        res.set('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
        
        const params = [branchId];
        let paramIndex = 2;
        let categoryParamIndex;
        let categoryCte = '';
        let categoryJoin = '';

        if (category && category !== 'All') {
            categoryParamIndex = paramIndex;
            categoryCte = `
            WITH matched_category AS (
                SELECT c.*
                FROM categories c
                WHERE normalize_arabic_text(c.name) = normalize_arabic_text($${categoryParamIndex})
                   OR normalize_arabic_text(c.name_ar) = normalize_arabic_text($${categoryParamIndex})
                LIMIT 1
            )
            `;
            categoryJoin = 'LEFT JOIN matched_category c ON TRUE';
            params.push(category);
            paramIndex++;
        }

        let sql = `
            ${categoryCte}
            SELECT p.id, p.name, p.category, p.image, p.weight, p.rating, p.reviews, p.is_organic, p.is_new, p.barcode, p.shelf_location,
                   p.frame_overlay_url, p.frame_enabled,
                   bp.price, bp.discount_price, bp.stock_quantity, bp.is_available,
                   (mo.id IS NOT NULL) AS in_magazine
        FROM products p
            JOIN branch_products bp ON p.id = bp.product_id
            ${categoryJoin}
            LEFT JOIN magazine_offers mo ON mo.product_id = p.id 
                AND mo.is_active = TRUE 
                AND (mo.start_date IS NULL OR mo.start_date <= NOW())
                AND (mo.end_date IS NULL OR mo.end_date >= NOW())
            WHERE bp.branch_id = $1 AND bp.is_available = TRUE
        `;

        if (categoryParamIndex !== undefined) {
            sql += ` AND (
                normalize_arabic_text(p.category) = normalize_arabic_text($${categoryParamIndex})
                OR p.category = $${categoryParamIndex}
                OR (
                    c.id IS NOT NULL
                    AND (
                        normalize_arabic_text(p.category) = normalize_arabic_text(c.name)
                        OR normalize_arabic_text(p.category) = normalize_arabic_text(c.name_ar)
                        OR p.category = c.name
                        OR p.category = c.name_ar
                    )
                )
            )`;
        }

        if (search) {
            sql += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        // إخفاء منتجات المجلة من القوائم العادية إلا إذا طلب صراحة
        if (includeMagazine !== 'true') {
            sql += ` AND mo.id IS NULL`;
        }

        // Add ORDER BY for consistent results
        sql += ` ORDER BY p.id`;
        
        // 🔥 إضافة LIMIT و OFFSET للـ Pagination
        sql += ` LIMIT $${paramIndex}`;
        params.push(limitValue);
        paramIndex++;
        
        if (offsetValue > 0) {
            sql += ` OFFSET $${paramIndex}`;
            params.push(offsetValue);
        }

        const { rows } = await query(sql, params);
        
        // 🔥 إضافة معلومات Pagination في الـ Response
        console.log(`✅ Returned ${rows.length} products (Limit: ${limitValue}, Offset: ${offsetValue})`);

        // Convert is_organic/is_new back to boolean if needed (Postgres returns boolean for BOOLEAN columns usually, but let's be safe)
        // Schema has is_organic BOOLEAN, is_new BOOLEAN. pg driver converts them to JS booleans automatically.
        // However, the previous code mapped them manually. I will keep it clean.

        res.json({
            "message": "success",
            "data": rows
        });
    } catch (err) {
        console.error("Error fetching products:", err);
        res.status(500).json({ "error": err.message });
    }
});

// ============================================
// 🖼️ PRODUCT FRAMES ROUTES
// ============================================

// Get all frames
router.get('/frames', async (req, res) => {
    try {
        const { rows } = await query(
            'SELECT * FROM product_frames WHERE is_active = TRUE ORDER BY created_at DESC'
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching frames:', error);
        res.status(500).json({ error: 'Failed to fetch frames' });
    }
});

// Upload new frame - Using BASE64 (serverless compatible)
router.post('/upload-frame', verifyToken, isAdmin, async (req, res) => {
    try {
        console.log('🖼️ Upload frame request (base64)');

        const { name, name_ar, category, frame_base64 } = req.body;
        
        if (!name || !name_ar) {
            return res.status(400).json({ error: 'Name and name_ar are required' });
        }

        if (!frame_base64) {
            return res.status(400).json({ error: 'frame_base64 is required' });
        }

        // Store base64 directly in database (no file system needed!)
        const frameUrl = frame_base64; // Base64 data URL
        
        const { rows } = await query(
            `INSERT INTO product_frames (name, name_ar, frame_url, category, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
             RETURNING *`,
            [name, name_ar, frameUrl, category || 'general']
        );

        console.log('✅ Frame uploaded successfully:', rows[0].id);
        res.json({ success: true, data: rows[0], message: 'Frame uploaded successfully' });
    } catch (error) {
        console.error('❌ Error uploading frame:', error);
        res.status(500).json({ error: 'Failed to upload frame', details: error.message });
    }
});

// Delete frame
router.delete('/frames/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if frame is used by any products
        const { rows: usedBy } = await query(
            'SELECT COUNT(*) as count FROM products WHERE frame_overlay_url = (SELECT frame_url FROM product_frames WHERE id = $1)',
            [id]
        );
        
        if (usedBy[0]?.count > 0) {
            return res.status(400).json({ 
                error: `Cannot delete frame. It is used by ${usedBy[0].count} product(s)` 
            });
        }

        await query('DELETE FROM product_frames WHERE id = $1', [id]);
        res.json({ success: true, message: 'Frame deleted successfully' });
    } catch (error) {
        console.error('Error deleting frame:', error);
        res.status(500).json({ error: 'Failed to delete frame' });
    }
});

// Update product frame
router.patch('/:id/frame', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { frame_overlay_url, frame_enabled } = req.body;
        
        const { rows } = await query(
            `UPDATE products 
             SET frame_overlay_url = $1, frame_enabled = $2
             WHERE id = $3
             RETURNING *`,
            [frame_overlay_url, frame_enabled, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error updating product frame:', error);
        res.status(500).json({ error: 'Failed to update product frame' });
    }
});

// Apply frame to ALL products
router.post('/apply-frame-to-all', verifyToken, isAdmin, async (req, res) => {
    try {
        const { frame_overlay_url, frame_enabled } = req.body;
        
        if (!frame_overlay_url) {
            return res.status(400).json({ error: 'frame_overlay_url is required' });
        }

        console.log('🖼️ Applying frame to all products:', { frame_overlay_url, frame_enabled });

        const { rows } = await query(
            `UPDATE products 
             SET frame_overlay_url = $1, frame_enabled = $2
             WHERE 1=1
             RETURNING id`,
            [frame_overlay_url, frame_enabled !== false]
        );

        console.log(`✅ Updated ${rows.length} products with frame`);

        res.json({ 
            success: true, 
            message: `Applied frame to ${rows.length} products`,
            updatedCount: rows.length 
        });
    } catch (error) {
        console.error('Error applying frame to all products:', error);
        res.status(500).json({ error: 'Failed to apply frame to all products' });
    }
});

// Get single product
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const { branchId } = req.query;

    try {
        let sql, params;

        if (branchId) {
            sql = `
                SELECT p.*, bp.price, bp.discount_price, bp.stock_quantity, bp.is_available
                FROM products p
                LEFT JOIN branch_products bp ON p.id = bp.product_id AND bp.branch_id = $2
                WHERE p.id = $1
            `;
            params = [id, branchId];
        } else {
            sql = "SELECT * FROM products WHERE id = $1";
            params = [id];
        }

        const { rows } = await query(sql, params);
        const row = rows[0];

        res.json({
            "message": row ? "success" : "not found",
            "data": row
        });
    } catch (err) {
        console.error("Error fetching product:", err);
        res.status(500).json({ "error": err.message });
    }
});

// Get product by barcode
router.get('/barcode/:barcode', async (req, res) => {
    const { barcode } = req.params;
    const { branchId } = req.query;

    try {
        const targetBranchId = branchId || 1; // Default to branch 1

        // First try to get product with specified branch
        let sql = `
            SELECT p.*, 
                   bp.price, 
                   bp.discount_price, 
                   bp.stock_quantity, 
                   bp.is_available,
                   bp.branch_id
            FROM products p
            LEFT JOIN branch_products bp ON p.id = bp.product_id AND bp.branch_id = $2
            WHERE p.barcode = $1
        `;
        
        const { rows } = await query(sql, [barcode, targetBranchId]);
        let row = rows[0];
        
        if (!row) {
            console.log(`❌ Product not found with barcode: ${barcode}`);
            return res.json({
                "message": "not found",
                "data": null
            });
        }

        // If product found but no price (not in branch_products for this branch)
        // Try to get price from ANY branch as fallback
        if (!row.price || row.price === 0 || row.price === null) {
            console.log(`⚠️ Product ${row.id} found but no price for branch ${targetBranchId}, trying other branches...`);
            
            const fallbackSql = `
                SELECT bp.price, bp.discount_price, bp.stock_quantity, bp.is_available, bp.branch_id
                FROM branch_products bp
                WHERE bp.product_id = $1 AND bp.price > 0
                ORDER BY bp.branch_id
                LIMIT 1
            `;
            
            const { rows: fallbackRows } = await query(fallbackSql, [row.id]);
            
            if (fallbackRows.length > 0) {
                const fallbackData = fallbackRows[0];
                row.price = fallbackData.price;
                row.discount_price = fallbackData.discount_price;
                row.stock_quantity = fallbackData.stock_quantity;
                row.is_available = fallbackData.is_available;
                row.branch_id = fallbackData.branch_id;
                
                console.log(`✅ Found price from branch ${fallbackData.branch_id}: ${fallbackData.price}`);
            } else {
                console.log(`❌ No price found in any branch for product ${row.id}`);
                // Set defaults
                row.price = 0;
                row.stock_quantity = 0;
                row.is_available = false;
            }
        }
        
        // Ensure numeric values
        row.price = Number(row.price) || 0;
        row.discount_price = row.discount_price ? Number(row.discount_price) : null;
        row.stock_quantity = Number(row.stock_quantity) || 0;
        
        console.log(`📦 Product returned for barcode ${barcode}:`, {
            id: row.id,
            name: row.name,
            price: row.price,
            discount_price: row.discount_price,
            stock_quantity: row.stock_quantity,
            branch_id: row.branch_id
        });

        res.json({
            "message": "success",
            "data": row
        });
    } catch (err) {
        console.error("Error fetching product by barcode:", err);
        res.status(500).json({ "error": err.message });
    }
});

// Create Product (Admin only)
// Creates product and optionally adds to branch inventory with price/stock
router.post('/', [verifyToken, isAdmin], async (req, res) => {
    const { 
        name, category, subcategory, image, weight, description, barcode, isOrganic, isNew,
        price, originalPrice, branchId, stockQuantity, expiryDate, shelfLocation,
        frame_overlay_url, frame_enabled
    } = req.body;
    
    // Validation
    if (!name || name.trim() === '') {
        return res.status(400).json({ 
            error: 'اسم المنتج مطلوب',
            message: 'يجب إدخال اسم المنتج'
        });
    }
    
    if (!price || Number(price) <= 0) {
        return res.status(400).json({ 
            error: 'السعر مطلوب ويجب أن يكون أكبر من صفر',
            message: 'يرجى إدخال سعر صحيح للمنتج (يجب أن يكون أكبر من 0)'
        });
    }
    
    // ID generation: keep using timestamp or UUID. Schema says TEXT.
    const id = Date.now().toString();

    try {
        await query('BEGIN');

        // Insert product
        const sql = `
            INSERT INTO products (
                id, name, category, subcategory, image, weight, description,
                rating, reviews, is_organic, is_new, barcode, shelf_location,
                frame_overlay_url, frame_enabled
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `;
        const { rows } = await query(sql, [
            id,
            name,
            category,
            subcategory || null,
            image,
            weight,
            description,
            isOrganic ? true : false,
            isNew ? true : false,
            barcode || null,
            shelfLocation || null,
            frame_overlay_url || null,
            frame_enabled === true
        ]);

        // Add to branch inventory - always add to at least branch 1
        const targetBranchId = branchId || 1; // Default to branch 1
        const targetPrice = price || 0; // Default price
        
        const bpSql = `
            INSERT INTO branch_products (branch_id, product_id, price, discount_price, stock_quantity, expiry_date, is_available)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
            ON CONFLICT (branch_id, product_id) DO UPDATE SET
                price = EXCLUDED.price,
                discount_price = EXCLUDED.discount_price,
                stock_quantity = EXCLUDED.stock_quantity,
                expiry_date = EXCLUDED.expiry_date,
                is_available = EXCLUDED.is_available
        `;
        await query(bpSql, [
            targetBranchId,
            id,
            targetPrice,
            originalPrice || null, // السعر قبل (الأصلي) يُخزن في discount_price
            stockQuantity || 0,
            expiryDate || null
        ]);

        await query('COMMIT');

        console.log(`✅ Product created successfully:`, {
            id,
            name,
            price: targetPrice,
            branchId: targetBranchId
        });

        res.json({
            "message": "success",
            "data": {
                ...rows[0],
                price: targetPrice,
                branch_id: targetBranchId
            }
        });
    } catch (err) {
        await query('ROLLBACK');
        console.error("Error creating product:", err);
        
        // Handle duplicate barcode error
        if (err.code === '23505' && err.constraint === 'products_barcode_key') {
            return res.status(400).json({ 
                error: 'الباركود موجود بالفعل',
                errorCode: 'DUPLICATE_BARCODE',
                barcode: barcode,
                message: `المنتج بالباركود ${barcode} موجود بالفعل. يرجى استخدام باركود مختلف أو تعديل المنتج الموجود.`
            });
        }
        
        res.status(400).json({ "error": err.message });
    }
});

// Update Product (Admin only)
router.put('/:id', [verifyToken, isAdmin], async (req, res) => {
    const { 
        name, category, subcategory, image, weight, description, barcode, isOrganic, isNew,
        price, originalPrice, branchId, stockQuantity, expiryDate, shelfLocation,
        frame_overlay_url, frame_enabled
    } = req.body;
    
    try {
        await query('BEGIN');

        const sql = `
            UPDATE products 
            SET name = COALESCE($1, name),
                category = COALESCE($2, category),
                subcategory = COALESCE($3, subcategory),
                image = COALESCE($4, image),
                weight = COALESCE($5, weight),
                description = COALESCE($6, description),
                barcode = COALESCE($7, barcode),
                is_organic = COALESCE($8, is_organic),
                is_new = COALESCE($9, is_new),
                shelf_location = COALESCE($10, shelf_location),
                frame_overlay_url = COALESCE($11, frame_overlay_url),
                frame_enabled = COALESCE($12, frame_enabled)
            WHERE id = $13
            RETURNING *
        `;
        
        const { rows } = await query(sql, [
            name, category, subcategory, image, weight, description, barcode,
            isOrganic, isNew, shelfLocation, frame_overlay_url, frame_enabled, req.params.id
        ]);

        if (rows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Product not found' });
        }

        // Update branch inventory if price provided
        if (price !== undefined && branchId) {
            const bpSql = `
                INSERT INTO branch_products (branch_id, product_id, price, discount_price, stock_quantity, expiry_date, is_available)
                VALUES ($1, $2, $3, $4, $5, $6, TRUE)
                ON CONFLICT (branch_id, product_id) DO UPDATE SET
                    price = EXCLUDED.price,
                    discount_price = EXCLUDED.discount_price,
                    stock_quantity = EXCLUDED.stock_quantity,
                    expiry_date = EXCLUDED.expiry_date
            `;
            await query(bpSql, [
                branchId,
                req.params.id,
                price,
                originalPrice || null,
                stockQuantity || 0,
                expiryDate || null
            ]);
        }

        await query('COMMIT');

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        await query('ROLLBACK');
        console.error("Error updating product:", err);
        res.status(400).json({ error: err.message });
    }
});
// Get Products by Category
router.get('/category/:category', async (req, res) => {
    const { branchId } = req.query;
    const category = req.params.category;

    if (!branchId) {
        return res.status(400).json({ error: "Branch ID required" });
    }

    try {
        const sql = `
            WITH matched_category AS (
                SELECT c.*
                FROM categories c
                WHERE normalize_arabic_text(c.name) = normalize_arabic_text($2)
                   OR normalize_arabic_text(c.name_ar) = normalize_arabic_text($2)
                LIMIT 1
            )
            SELECT p.*, bp.price, bp.discount_price, bp.stock_quantity, bp.is_available
            FROM products p
            JOIN branch_products bp ON p.id = bp.product_id
            LEFT JOIN matched_category c ON TRUE
            WHERE bp.branch_id = $1 AND bp.is_available = TRUE AND (
                normalize_arabic_text(p.category) = normalize_arabic_text($2)
                OR p.category = $2
                OR (
                    c.id IS NOT NULL
                    AND (
                        normalize_arabic_text(p.category) = normalize_arabic_text(c.name)
                        OR normalize_arabic_text(p.category) = normalize_arabic_text(c.name_ar)
                        OR p.category = c.name
                        OR p.category = c.name_ar
                    )
                )
            )
        `;
        const { rows } = await query(sql, [branchId, category]);
        
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error("Error fetching products by category:", err);
        res.status(500).json({ error: err.message });
    }
});

// Search Products
router.get('/search', async (req, res) => {
    const { q, branchId } = req.query;

    if (!q) {
        return res.status(400).json({ error: "Search query required" });
    }

    if (!branchId) {
        return res.status(400).json({ error: "Branch ID required" });
    }

    try {
        const sql = `
            SELECT p.*, bp.price, bp.discount_price, bp.stock_quantity, bp.is_available
            FROM products p
            JOIN branch_products bp ON p.id = bp.product_id
            WHERE bp.branch_id = $1 
            AND (p.name ILIKE $2 OR p.description ILIKE $2 OR p.barcode ILIKE $2)
            AND bp.is_available = TRUE
        `;
        const { rows } = await query(sql, [branchId, `%${q}%`]);
        
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error("Error searching products:", err);
        res.status(500).json({ error: err.message });
    }
});
// Delete Product
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const result = await query("DELETE FROM products WHERE id = $1", [req.params.id]);
        res.json({ "message": "deleted", rowCount: result.rowCount });
    } catch (err) {
        console.error("Error deleting product:", err);
        res.status(400).json({ "error": err.message });
    }
});

// ✅ Security: Use secure Excel upload with file validation
// Upload Excel - with secure file handling
router.post('/upload', [verifyToken, isAdmin, secureExcelUpload.single('file'), verifyFileContent(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'])], async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const products = xlsx.utils.sheet_to_json(sheet);
        
        // ✅ Security: Limit number of products in single upload
        if (products.length > 5000) {
            return res.status(400).json({ error: "Maximum 5000 products per upload" });
        }

        let successCount = 0;
        let errorCount = 0;
        const categoryIndex = await buildCategoryIndex();

        // Start transaction
        await query('BEGIN');

        for (const p of products) {
            try {
                if (!p.name) { // Price check removed as it's not in products table anymore
                    errorCount++;
                    continue;
                }

                const id = p.id ? p.id.toString() : Date.now().toString() + Math.random().toString(36).substr(2, 5);
                const isOrganic = p.isOrganic === 'true' || p.isOrganic === 1 || p.isOrganic === true;
                const isNew = p.isNew === 'true' || p.isNew === 1 || p.isNew === true;
                const barcode = p.barcode || p.parcode || null; // Support both spellings
                const rawSubcategory = p.subcategory || p["التصنيف الفرعي"] || null;
                const rawCategory = p.category || p["التصنيف الاساسي"] || p["التصنيف الأساسي"] || null;
                const mappedCategory = mapCategoryValues(rawCategory, rawSubcategory, categoryIndex);
                const category = mappedCategory.category || rawCategory || 'Uncategorized';
                const subcategory = mappedCategory.subcategory || rawSubcategory || null;

                const sql = `
                    INSERT INTO products (id, name, category, subcategory, image, weight, rating, reviews, is_organic, is_new, barcode)
                    VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, $8, $9)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        category = EXCLUDED.category,
                        subcategory = EXCLUDED.subcategory,
                        image = EXCLUDED.image,
                        weight = EXCLUDED.weight,
                        is_organic = EXCLUDED.is_organic,
                        is_new = EXCLUDED.is_new,
                        barcode = EXCLUDED.barcode
                `;

                await query(sql, [
                    id,
                    p.name || p["اسم المنتج"],
                    category,
                    subcategory,
                    p.image || p["لينك الصوره"] || '',
                    p.weight || '',
                    isOrganic,
                    isNew,
                    barcode
                ]);

                // If branch and price info provided, also add to branch_products
                const branchId = p.branchId || p.branch_id || p["الفرع"] || 1;
                const price = p.price || p["السعر بعد"] || 0;
                const discountPrice = p.originalPrice || p.discount_price || p["السعر قبل"] || null;
                const stockQty = p.stock_quantity || p["عدد القطع المتوفره"] || 0;
                const expiryDate = p.expiry_date || p["تاريخ الصلاحيه"] || null;

                if (price > 0) {
                    const bpSql = `
                        INSERT INTO branch_products (branch_id, product_id, price, discount_price, stock_quantity, expiry_date, is_available)
                        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
                        ON CONFLICT (branch_id, product_id) DO UPDATE SET
                            price = EXCLUDED.price,
                            discount_price = EXCLUDED.discount_price,
                            stock_quantity = EXCLUDED.stock_quantity,
                            expiry_date = EXCLUDED.expiry_date
                    `;
                    await query(bpSql, [branchId, id, price, discountPrice, stockQty, expiryDate]);
                }

                successCount++;
            } catch (e) {
                console.error("Row error:", e);
                errorCount++;
            }
        }

        await query('COMMIT');

        res.json({
            message: "Upload processed",
            stats: {
                total: products.length,
                success: successCount,
                errors: errorCount
            }
        });

    } catch (err) {
        await query('ROLLBACK');
        console.error("Excel processing error", err);
        res.status(500).json({ error: "Failed to process Excel file" });
    }
});

// Error handler for file upload errors
router.use(handleUploadError);

export default router;
