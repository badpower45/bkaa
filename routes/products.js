import express from 'express';
import { query } from '../database.js'; // Use the exported query helper
import { verifyToken, isAdmin } from '../middleware/auth.js';
import { createExcelUploader, verifyFileContent, handleUploadError } from '../middleware/fileUpload.js';
import { validate, productSchema, searchSchema } from '../middleware/validation.js';
import * as xlsx from 'xlsx';

const router = express.Router();

// ✅ Security: Use secure file upload middleware
const secureExcelUpload = createExcelUploader();

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

// Get all products (filtered by branch)
router.get('/', async (req, res) => {
    const { branchId, category, search, limit } = req.query;

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
        
        let sql = `
            SELECT p.id, p.name, p.category, p.image, p.weight, p.rating, p.reviews, p.is_organic, p.is_new, p.barcode, p.shelf_location,
                   bp.price, bp.discount_price, bp.stock_quantity, bp.is_available
            FROM products p
            JOIN branch_products bp ON p.id = bp.product_id
            WHERE bp.branch_id = $1 AND bp.is_available = TRUE
        `;
        const params = [branchId];
        let paramIndex = 2;

        if (category && category !== 'All') {
            sql += ` AND p.category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        if (search) {
            sql += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        // Add ORDER BY for consistent results
        sql += ` ORDER BY p.id`;
        
        // Add LIMIT for pagination
        if (limit) {
            sql += ` LIMIT $${paramIndex}`;
            params.push(parseInt(limit));
            paramIndex++;
        }

        const { rows } = await query(sql, params);

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
        let sql, params;

        if (branchId) {
            sql = `
                SELECT p.*, bp.price, bp.discount_price, bp.stock_quantity, bp.is_available
                FROM products p
                LEFT JOIN branch_products bp ON p.id = bp.product_id AND bp.branch_id = $2
                WHERE p.barcode = $1
            `;
            params = [barcode, branchId];
        } else {
            sql = "SELECT * FROM products WHERE barcode = $1";
            params = [barcode];
        }

        const { rows } = await query(sql, params);
        const row = rows[0];

        res.json({
            "message": row ? "success" : "not found",
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
        price, originalPrice, branchId, stockQuantity, expiryDate, shelfLocation 
    } = req.body;
    
    // ID generation: keep using timestamp or UUID. Schema says TEXT.
    const id = Date.now().toString();

    try {
        await query('BEGIN');

        // Insert product
        const sql = `
            INSERT INTO products (id, name, category, subcategory, image, weight, description, rating, reviews, is_organic, is_new, barcode, shelf_location)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $8, $9, $10, $11)
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
            shelfLocation || null
        ]);

        // Add to branch inventory if price provided
        if (price && branchId) {
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
                id,
                price,
                originalPrice || null, // السعر قبل (الأصلي) يُخزن في discount_price
                stockQuantity || 0,
                expiryDate || null
            ]);
        }

        await query('COMMIT');

        res.json({
            "message": "success",
            "data": rows[0]
        });
    } catch (err) {
        await query('ROLLBACK');
        console.error("Error creating product:", err);
        res.status(400).json({ "error": err.message });
    }
});

// Update Product (Admin only)
router.put('/:id', [verifyToken, isAdmin], async (req, res) => {
    const { 
        name, category, subcategory, image, weight, description, barcode, isOrganic, isNew, isWeighted,
        price, originalPrice, branchId, stockQuantity, expiryDate, shelfLocation 
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
                is_weighted = COALESCE($10, is_weighted),
                shelf_location = COALESCE($11, shelf_location)
            WHERE id = $12
            RETURNING *
        `;
        
        const { rows } = await query(sql, [
            name, category, subcategory, image, weight, description, barcode,
            isOrganic, isNew, isWeighted, shelfLocation, req.params.id
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
            SELECT p.*, bp.price, bp.discount_price, bp.stock_quantity, bp.is_available
            FROM products p
            JOIN branch_products bp ON p.id = bp.product_id
            WHERE bp.branch_id = $1 AND p.category = $2 AND bp.is_available = TRUE
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
                const subcategory = p.subcategory || p["التصنيف الفرعي"] || null;
                const category = p.category || p["التصنيف الاساسي"] || 'Uncategorized';

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
