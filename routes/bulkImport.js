import express from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'text/csv'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
        }
    }
});

// Column mapping (support both English and Arabic names)
const COLUMN_MAPPING = {
    // Required fields
    'name': ['name', 'product_name', 'اسم المنتج', 'الاسم'],
    'barcode': ['barcode', 'الباركود', 'باركود'],
    'old_price': ['old_price', 'السعر قبل', 'السعر القديم', 'سعر قبل'],
    'price': ['price', 'السعر بعد', 'السعر', 'سعر بعد', 'سعر'],
    'category': ['category', 'التصنيف الاساسي', 'التصنيف الأساسي', 'القسم', 'الفئة'],
    'subcategory': ['subcategory', 'sub_category', 'التصنيف الثانوي', 'تصنيف ثانوي'],
    'branch_id': ['branch_id', 'الفرع', 'فرع', 'معرف الفرع'],
    'stock_quantity': ['stock_quantity', 'الكمية', 'الكميه', 'كمية', 'كميه'],
    'image': ['image', 'image_url', 'الصورة', 'صورة', 'صوره'],
    'expiry_date': ['expiry_date', 'تاريخ الصلاحيه', 'تاريخ الصلاحية', 'صلاحيه', 'صلاحية'],
    'brand': ['brand', 'brand_name', 'البراند', 'الماركة', 'اسم البراند']
};

// Find column value by multiple possible names
function findColumnValue(row, possibleNames) {
    for (const name of possibleNames) {
        const lowerName = name.toLowerCase();
        for (const [key, value] of Object.entries(row)) {
            if (key.toLowerCase() === lowerName && value !== undefined && value !== null && value !== '') {
                return value;
            }
        }
    }
    return null;
}

// Extract and map data from row (FLEXIBLE - allows partial data)
function mapRowToProduct(row, rowIndex) {
    const product = {};
    const errors = [];
    const warnings = [];
    
    // Required fields (but we'll be flexible)
    const allFields = [
        'name', 'barcode', 'old_price', 'price', 'category', 
        'subcategory', 'branch_id', 'stock_quantity', 'image', 'expiry_date',
        'brand'
    ];
    
    // Extract all available fields
    for (const field of allFields) {
        const value = findColumnValue(row, COLUMN_MAPPING[field]);
        if (value || value === 0) {
            product[field] = value;
        } else {
            // Just warn, don't fail
            warnings.push(`Missing field: ${field}`);
        }
    }
    
    // Basic validation (very lenient)
    if (product.price) {
        const priceNum = parseFloat(product.price);
        if (isNaN(priceNum) || priceNum < 0) {
            errors.push('السعر بعد غير صحيح - يجب أن يكون رقم');
        } else {
            product.price = priceNum;
        }
    }
    
    if (product.old_price) {
        const oldPriceNum = parseFloat(product.old_price);
        if (isNaN(oldPriceNum) || oldPriceNum < 0) {
            warnings.push('السعر قبل غير صحيح');
            product.old_price = null;
        } else {
            product.old_price = oldPriceNum;
        }
    }
    
    if (product.stock_quantity) {
        const stockNum = parseInt(product.stock_quantity);
        if (isNaN(stockNum) || stockNum < 0) {
            warnings.push('الكمية غير صحيحة');
            product.stock_quantity = 0;
        } else {
            product.stock_quantity = stockNum;
        }
    }
    
    if (product.branch_id) {
        const branchNum = parseInt(product.branch_id);
        if (isNaN(branchNum) || branchNum <= 0) {
            warnings.push('معرف الفرع غير صحيح');
            product.branch_id = 1; // Default branch
        } else {
            product.branch_id = branchNum;
        }
    }
    
    // Calculate discount percentage
    if (product.old_price && product.price && product.old_price > product.price) {
        product.discount_percentage = Math.round(((product.old_price - product.price) / product.old_price) * 100);
    } else {
        product.discount_percentage = 0;
    }
    
    // Clean and validate expiry date
    if (product.expiry_date) {
        try {
            let dateStr = String(product.expiry_date).trim();
            
            // Remove all spaces from date string (handles "2026 - 6 - 12" format)
            dateStr = dateStr.replace(/\s+/g, '');
            
            // Handle different date formats
            if (dateStr.includes('-')) {
                // Format: "2026-6-12" or "2026-06-12"
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                    const year = parts[0].padStart(4, '0');
                    const month = parts[1].padStart(2, '0');
                    const day = parts[2].padStart(2, '0');
                    dateStr = `${year}-${month}-${day}`;
                }
            } else if (dateStr.includes('/')) {
                // Format: "12/6/2026" (DD/MM/YYYY)
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    const year = parts[2].padStart(4, '0');
                    dateStr = `${year}-${month}-${day}`;
                }
            }
            
            // Validate date
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) {
                warnings.push('تاريخ الصلاحية غير صحيح - سيتم تجاهله');
                product.expiry_date = null;
            } else {
                // Format as YYYY-MM-DD for PostgreSQL
                product.expiry_date = dateStr;
            }
        } catch (err) {
            warnings.push('خطأ في معالجة تاريخ الصلاحية - سيتم تجاهله');
            product.expiry_date = null;
        }
    }
    
    return { product, errors, warnings, rowIndex };
}

// POST /api/products/bulk-import - Import products from Excel
router.post('/bulk-import', [verifyToken, isAdmin, upload.single('file')], async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        console.log('Processing Excel file:', req.file.originalname);
        console.log('File size:', req.file.size, 'bytes');
        console.log('File mimetype:', req.file.mimetype);
        
        // Read Excel file
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            return res.status(400).json({ error: 'لا يوجد أوراق في ملف Excel' });
        }
        
        console.log('Available sheets:', workbook.SheetNames);
        
        // Try to find "Products" sheet first, otherwise use first sheet with data
        let sheetName = workbook.SheetNames.find(name => 
            name.toLowerCase() === 'products' || 
            name.toLowerCase() === 'منتجات' ||
            name.toLowerCase() === 'sheet1'
        );
        
        // If no specific sheet found, find first sheet with actual data
        if (!sheetName) {
            for (const name of workbook.SheetNames) {
                const testSheet = workbook.Sheets[name];
                const testRows = xlsx.utils.sheet_to_json(testSheet);
                if (testRows.length > 0) {
                    sheetName = name;
                    break;
                }
            }
        }
        
        // Fallback to first sheet
        if (!sheetName) {
            sheetName = workbook.SheetNames[0];
        }
        
        console.log('Using sheet:', sheetName);
        const worksheet = workbook.Sheets[sheetName];
        
        // Get the range to check if sheet has data
        const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1');
        const hasData = range.e.r > 0; // Check if there are rows beyond header
        
        console.log('Sheet range:', worksheet['!ref']);
        console.log('Has data beyond header:', hasData);
        
        // Convert to JSON - include header even if empty
        const rows = xlsx.utils.sheet_to_json(worksheet, { defval: null });
        
        console.log('Parsed rows:', rows.length);
        
        if (rows.length === 0) {
            // Check if headers exist
            const headers = xlsx.utils.sheet_to_json(worksheet, { header: 1 })[0];
            console.log('Headers found:', headers);
            
            // Check if there are other sheets with data
            const otherSheetsWithData = workbook.SheetNames.filter(name => {
                const sheet = workbook.Sheets[name];
                const testRows = xlsx.utils.sheet_to_json(sheet);
                return testRows.length > 0;
            });
            
            let suggestionMsg = '';
            if (otherSheetsWithData.length > 0) {
                suggestionMsg = ` - تم العثور على بيانات في: ${otherSheetsWithData.join(', ')}. تأكد من استخدام الورقة الصحيحة.`;
            }
            
            return res.status(400).json({ 
                error: `ملف Excel فارغ - الورقة "${sheetName}" لا تحتوي على بيانات${suggestionMsg}`,
                details: headers ? 'تم العثور على عناوين الأعمدة فقط، لكن لا توجد بيانات. تأكد من إضافة صفوف البيانات تحت الـ Headers.' : 'الملف فارغ تماماً',
                availableSheets: workbook.SheetNames,
                sheetsWithData: otherSheetsWithData
            });
        }
        
        console.log(`Found ${rows.length} rows in Excel`);
        
        // Generate batch ID for this import
        const batchId = uuidv4();
        const userId = req.user?.id || null;
        
        // Parse and save ALL rows as drafts (flexible approach)
        const savedDrafts = [];
        const parseErrors = [];
        
        rows.forEach((row, index) => {
            const { product, errors, warnings, rowIndex } = mapRowToProduct(row, index + 2);
            
            // Save even if there are warnings - we'll let user fix them later
            savedDrafts.push({
                product,
                warnings,
                errors,
                rowIndex
            });
        });
        
        console.log(`Parsed ${savedDrafts.length} products, preparing to save as drafts...`);
        
        // Save all as draft products
        const imported = [];
        const importErrors = [];
        
        await query('BEGIN');
        
        try {
            for (const { product, warnings, errors } of savedDrafts) {
                try {
                    // Insert into draft_products table (accepting incomplete data)
                    const { rows: insertedDraft } = await query(`
                        INSERT INTO draft_products (
                            name, category, subcategory, image, barcode,
                            old_price, price, discount_percentage,
                            branch_id, stock_quantity, expiry_date,
                            brand_name,
                            status, import_batch_id, imported_by,
                            validation_errors, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                            $12, $13, $14, $15, $16, NOW(), NOW()
                        ) RETURNING id, name, category, status
                    `, [
                        product.name || 'منتج بدون اسم',
                        product.category || null,
                        product.subcategory || null,
                        product.image || null,
                        product.barcode || null,
                        product.old_price || null,
                        product.price || null,
                        product.discount_percentage || 0,
                        product.branch_id || 1,
                        product.stock_quantity || 0,
                        product.expiry_date || null,
                        product.brand || null,
                        errors.length > 0 ? 'draft' : 'validated',
                        batchId,
                        userId,
                        JSON.stringify({ errors, warnings })
                    ]);
                    
                    imported.push({
                        id: insertedDraft[0].id,
                        name: insertedDraft[0].name,
                        category: insertedDraft[0].category,
                        status: insertedDraft[0].status
                    });
                } catch (err) {
                    console.error('Error saving draft product:', product.name, err);
                    importErrors.push({
                        name: product.name || 'Unknown',
                        error: err.message
                    });
                }
            }
            
            await query('COMMIT');
            
            console.log(`Successfully saved ${imported.length} products as drafts`);
            
            // Check if auto-publish is requested
            const autoPublish = req.body.autoPublish === 'true' || req.body.autoPublish === true;
            
            if (autoPublish && imported.length > 0) {
                console.log('Auto-publishing products...');
                
                // Publish all drafts from this batch
                try {
                    const draftsResult = await query(
                        'SELECT * FROM draft_products WHERE import_batch_id = $1',
                        [batchId]
                    );
                    
                    let publishedCount = 0;
                    const publishErrors = [];
                    
                    for (const draft of draftsResult.rows) {
                        try {
                            // Check if product exists
                            const existingProduct = await query(
                                'SELECT id FROM products WHERE barcode = $1',
                                [draft.barcode]
                            );
                            
                            let productId;
                            
                            if (existingProduct.rows.length > 0) {
                                // Update existing
                                productId = existingProduct.rows[0].id;
                                await query(`
                                    UPDATE products SET
                                        name = $1, category = $2,
                                        subcategory = $3, image = $4
                                    WHERE id = $5
                                `, [
                                    draft.name, draft.category,
                                    draft.subcategory, draft.image,
                                    productId
                                ]);
                            } else {
                                // Insert new - generate ID from barcode or sequence
                                const newProduct = await query(`
                                    INSERT INTO products (
                                        id, name, barcode, category, subcategory, image
                                    ) VALUES (
                                        COALESCE($1, (SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 FROM products WHERE id ~ '^[0-9]+$')::TEXT),
                                        $2, $3, $4, $5, $6
                                    )
                                    RETURNING id
                                `, [
                                    draft.barcode, draft.name, draft.barcode,
                                    draft.category, draft.subcategory, draft.image
                                ]);
                                productId = newProduct.rows[0].id;
                            }
                            
                            // Update branch_products
                            const existingBranchProduct = await query(
                                'SELECT branch_id FROM branch_products WHERE product_id = $1 AND branch_id = $2',
                                [productId, draft.branch_id]
                            );
                            
                            if (existingBranchProduct.rows.length > 0) {
                                await query(`
                                    UPDATE branch_products 
                                    SET 
                                        price = $1,
                                        discount_price = $2,
                                        stock_quantity = stock_quantity + $3,
                                        expiry_date = $4
                                    WHERE product_id = $5 AND branch_id = $6
                                `, [
                                    draft.price, draft.old_price, draft.stock_quantity,
                                    draft.expiry_date, productId, draft.branch_id
                                ]);
                            } else {
                                await query(`
                                    INSERT INTO branch_products (
                                        product_id, branch_id, price, discount_price,
                                        stock_quantity, expiry_date
                                    )
                                    VALUES ($1, $2, $3, $4, $5, $6)
                                `, [
                                    productId, draft.branch_id, draft.price, draft.old_price,
                                    draft.stock_quantity, draft.expiry_date
                                ]);
                            }
                            
                            publishedCount++;
                        } catch (error) {
                            console.error(`Error publishing draft ${draft.id}:`, error);
                            publishErrors.push({
                                name: draft.name,
                                error: error.message
                            });
                        }
                    }
                    
                    // Delete drafts after publishing
                    await query(
                        'DELETE FROM draft_products WHERE import_batch_id = $1',
                        [batchId]
                    );
                    
                    console.log(`Auto-published ${publishedCount} products`);
                    
                    res.json({
                        success: true,
                        message: `✅ تم رفع ونشر ${publishedCount} منتج بنجاح! يمكنك الآن رؤيتها في قائمة المنتجات.`,
                        imported: imported.length,
                        published: publishedCount,
                        failed: importErrors.length + publishErrors.length,
                        total: rows.length,
                        autoPublished: true,
                        details: {
                            imported: imported,
                            validationErrors: [],
                            importErrors: [...importErrors, ...publishErrors]
                        }
                    });
                } catch (publishErr) {
                    console.error('Auto-publish error:', publishErr);
                    // Return draft response as fallback
                    res.json({
                        success: true,
                        message: `⚠️ تم حفظ ${imported.length} منتج كمسودات. اضغط على "نشر جميع المنتجات" لنقلها إلى القائمة الرئيسية.`,
                        imported: imported.length,
                        failed: importErrors.length,
                        total: rows.length,
                        batchId: batchId,
                        details: {
                            imported: imported,
                            validationErrors: [],
                            importErrors: importErrors
                        }
                    });
                }
            } else {
                // Return draft response
                res.json({
                    success: true,
                    message: `⚠️ تم حفظ ${imported.length} منتج كمسودات. اضغط على زر "نشر جميع المنتجات" الأخضر لنقلها إلى القائمة الرئيسية.`,
                    imported: imported.length,
                    failed: importErrors.length,
                    total: rows.length,
                    batchId: batchId,
                    details: {
                        imported: imported,
                        validationErrors: [],
                        importErrors: importErrors
                    }
                });
            }
            
        } catch (err) {
            await query('ROLLBACK');
            throw err;
        }
        
    } catch (err) {
        console.error('Bulk import error:', err);
        res.status(500).json({ 
            error: 'Failed to import products',
            message: err.message 
        });
    }
});

// GET /api/products/drafts - Get all draft products
router.get('/drafts', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { batchId } = req.query;
        
        let queryText = `
            SELECT * FROM draft_products
            WHERE 1=1
        `;
        const params = [];
        
        if (batchId) {
            queryText += ` AND import_batch_id = $1`;
            params.push(batchId);
        }
        
        queryText += ` ORDER BY created_at DESC`;
        
        const { rows } = await query(queryText, params);
        
        res.json({
            success: true,
            drafts: rows
        });
    } catch (err) {
        console.error('Error fetching drafts:', err);
        res.status(500).json({ error: 'Failed to fetch draft products' });
    }
});

// GET /api/products/drafts/:batchId - Get draft products by batch ID
router.get('/drafts/:batchId', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { batchId } = req.params;
        
        // Check if batchId is a number (single draft ID) or a UUID (batch ID)
        const isNumeric = /^\d+$/.test(batchId);
        
        if (isNumeric) {
            // Get single draft by ID
            const { rows } = await query('SELECT * FROM draft_products WHERE id = $1', [batchId]);
            
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Draft product not found' });
            }
            
            return res.json({
                success: true,
                draft: rows[0]
            });
        } else {
            // Get all drafts by batch ID
            const { rows } = await query(`
                SELECT 
                    dp.*,
                    b.name as branch_name
                FROM draft_products dp
                LEFT JOIN branches b ON dp.branch_id = b.id
                WHERE dp.import_batch_id = $1
                ORDER BY dp.created_at DESC
            `, [batchId]);
            
            if (rows.length === 0) {
                return res.status(404).json({ 
                    success: false,
                    error: 'No draft products found for this batch',
                    data: []
                });
            }
            
            return res.json({
                success: true,
                data: rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    barcode: row.barcode,
                    price_before: row.old_price,
                    price_after: row.price,
                    category: row.category,
                    subcategory: row.subcategory,
                    branch_name: row.branch_name || 'غير محدد',
                    quantity: row.stock_quantity,
                    image_url: row.image
                }))
            });
        }
    } catch (err) {
        console.error('Error fetching drafts:', err);
        res.status(500).json({ error: 'Failed to fetch draft products' });
    }
});

// PUT /api/products/drafts/:id - Update draft product
router.put('/drafts/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Build update query dynamically
        const allowedFields = [
            'name', 'category', 'subcategory', 'image', 'barcode',
            'old_price', 'price', 'discount_percentage',
            'branch_id', 'stock_quantity', 'expiry_date', 'status', 'notes'
        ];
        
        const setClause = [];
        const values = [];
        let paramCounter = 1;
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClause.push(`${field} = $${paramCounter}`);
                values.push(updates[field]);
                paramCounter++;
            }
        }
        
        if (setClause.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        setClause.push(`updated_at = NOW()`);
        values.push(id);
        
        const queryText = `
            UPDATE draft_products
            SET ${setClause.join(', ')}
            WHERE id = $${paramCounter}
            RETURNING *
        `;
        
        const { rows } = await query(queryText, values);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Draft product not found' });
        }
        
        res.json({
            success: true,
            draft: rows[0]
        });
    } catch (err) {
        console.error('Error updating draft:', err);
        res.status(500).json({ error: 'Failed to update draft product' });
    }
});

// POST /api/products/drafts/:id/publish - Publish draft to products
router.post('/drafts/:id/publish', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        
        // Use the database function to publish
        const { rows } = await query('SELECT * FROM publish_draft_product($1)', [id]);
        
        if (!rows[0].success) {
            return res.status(400).json({ error: rows[0].message });
        }
        
        res.json({
            success: true,
            message: 'Product published successfully',
            productId: rows[0].product_id
        });
    } catch (err) {
        console.error('Error publishing draft:', err);
        res.status(500).json({ error: 'Failed to publish product' });
    }
});

// POST /api/products/drafts/batch/publish - Publish multiple drafts
router.post('/drafts/batch/publish', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { draftIds } = req.body;
        
        if (!Array.isArray(draftIds) || draftIds.length === 0) {
            return res.status(400).json({ error: 'No draft IDs provided' });
        }
        
        const results = [];
        
        await query('BEGIN');
        
        for (const draftId of draftIds) {
            try {
                const { rows } = await query('SELECT * FROM publish_draft_product($1)', [draftId]);
                results.push({
                    draftId,
                    success: rows[0].success,
                    productId: rows[0].product_id,
                    message: rows[0].message
                });
            } catch (err) {
                results.push({
                    draftId,
                    success: false,
                    error: err.message
                });
            }
        }
        
        await query('COMMIT');
        
        const successCount = results.filter(r => r.success).length;
        
        res.json({
            success: true,
            message: `Published ${successCount} of ${draftIds.length} products`,
            results
        });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error batch publishing:', err);
        res.status(500).json({ error: 'Failed to publish products' });
    }
});

// DELETE /api/products/drafts/:id - Delete draft product
router.delete('/drafts/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await query('DELETE FROM draft_products WHERE id = $1 RETURNING id', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Draft product not found' });
        }
        
        res.json({
            success: true,
            message: 'Draft product deleted'
        });
    } catch (err) {
        console.error('Error deleting draft:', err);
        res.status(500).json({ error: 'Failed to delete draft product' });
    }
});

// POST /api/products/setup-draft-table - Setup draft_products table (run migration)
router.post('/setup-draft-table', [verifyToken, isAdmin], async (req, res) => {
    try {
        console.log('Setting up draft_products table...');
        
        // Read migration file
        const migrationPath = path.join(__dirname, '..', 'migrations', 'add_draft_products_table.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        // Execute migration
        await query(migrationSQL);
        
        // Verify table exists
        const result = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'draft_products'
            );
        `);

        res.json({
            success: true,
            message: 'Draft products table setup completed',
            tableExists: result.rows[0].exists
        });
    } catch (err) {
        console.error('Error setting up draft table:', err);
        res.status(500).json({ 
            error: 'Failed to setup draft table',
            message: err.message 
        });
    }
});

// POST /api/products/drafts/:batchId/publish-all - Publish all draft products from a batch
router.post('/drafts/:batchId/publish-all', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { batchId } = req.params;
        
        await query('BEGIN');
        
        // Get all draft products for this batch
        const draftsResult = await query(
            'SELECT * FROM draft_products WHERE import_batch_id = $1',
            [batchId]
        );
        
        if (draftsResult.rows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                error: 'No draft products found for this batch' 
            });
        }
        
        let successCount = 0;
        let publishErrors = [];
        
        // Process each draft product
        for (const draft of draftsResult.rows) {
            try {
                // Check if product with same barcode already exists
                const existingProduct = await query(
                    'SELECT id FROM products WHERE barcode = $1',
                    [draft.barcode]
                );
                
                let productId;
                
                if (existingProduct.rows.length > 0) {
                    // Update existing product
                    productId = existingProduct.rows[0].id;
                    await query(`
                        UPDATE products SET
                            name = $1,
                            category = $2,
                            subcategory = $3,
                            image = $4
                        WHERE id = $5
                    `, [
                        draft.name,
                        draft.category,
                        draft.subcategory,
                        draft.image,
                        productId
                    ]);
                } else {
                    // Insert new product - generate ID from barcode or sequence
                    const newProduct = await query(`
                        INSERT INTO products (
                            id, name, barcode, category, subcategory, image
                        ) VALUES (
                            COALESCE($1, (SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 FROM products WHERE id ~ '^[0-9]+$')::TEXT),
                            $2, $3, $4, $5, $6
                        )
                        RETURNING id
                    `, [
                        draft.barcode,
                        draft.name,
                        draft.barcode,
                        draft.category,
                        draft.subcategory,
                        draft.image
                    ]);
                    productId = newProduct.rows[0].id;
                }
                
                // Update or insert branch_products
                const existingBranchProduct = await query(
                    'SELECT branch_id FROM branch_products WHERE product_id = $1 AND branch_id = $2',
                    [productId, draft.branch_id]
                );
                
                if (existingBranchProduct.rows.length > 0) {
                    await query(`
                        UPDATE branch_products 
                        SET 
                            price = $1,
                            discount_price = $2,
                            stock_quantity = stock_quantity + $3,
                            expiry_date = $4
                        WHERE product_id = $5 AND branch_id = $6
                    `, [
                        draft.price,
                        draft.old_price,
                        draft.stock_quantity,
                        draft.expiry_date,
                        productId,
                        draft.branch_id
                    ]);
                } else {
                    await query(`
                        INSERT INTO branch_products (
                            product_id, branch_id, price, discount_price,
                            stock_quantity, expiry_date
                        )
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [
                        productId,
                        draft.branch_id,
                        draft.price,
                        draft.old_price,
                        draft.stock_quantity,
                        draft.expiry_date
                    ]);
                }
                
                successCount++;
            } catch (error) {
                console.error(`Error publishing draft ${draft.id}:`, error);
                publishErrors.push({
                    name: draft.name,
                    barcode: draft.barcode,
                    error: error.message
                });
            }
        }
        
        // Delete all draft products from this batch
        await query(
            'DELETE FROM draft_products WHERE import_batch_id = $1',
            [batchId]
        );
        
        await query('COMMIT');
        
        res.json({
            success: true,
            publishedCount: successCount,
            totalDrafts: draftsResult.rows.length,
            errors: publishErrors.length > 0 ? publishErrors : undefined,
            message: `تم نشر ${successCount} من ${draftsResult.rows.length} منتج بنجاح`
        });
        
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error publishing draft products:', err);
        res.status(500).json({ 
            success: false,
            error: 'Failed to publish products',
            message: err.message 
        });
    }
});

// GET /api/products/bulk-import/template - Download Excel template
router.get('/bulk-import/template', (req, res) => {
    try {
        // Create template with example data
        const templateData = [
            {
                'name': 'شوكولاتة جالاكسي',
                'name_en': 'Galaxy Chocolate',
                'price': 25.50,
                'old_price': 30.00,
                'discount_percentage': 15,
                'category': 'حلويات',
                'weight': '100g',
                'اسم المنتج': 'شوكولاتة جالاكسي 100 جرام',
                'الباركود': '6221155123456',
                'السعر قبل': 30.00,
                'السعر بعد': 25.50,
                'التصنيف الاساسي': 'حلويات',
                'التصنيف الثانوي': 'شوكولاتة',
                'الفرع': 1,
                'الكميه': 150,
                'الصورة': 'https://i.imgur.com/abc123.jpg',
                'تاريخ الصلاحيه': '2026-12-31'
            },
            {
                'اسم المنتج': 'بيبسي 2 لتر',
                'الباركود': '6221155789012',
                'السعر قبل': 20.00,
                'السعر بعد': 18.00,
                'التصنيف الاساسي': 'مشروبات',
                'التصنيف الثانوي': 'مشروبات غازية',
                'الفرع': 1,
                'الكميه': 200,
                'الصورة': 'https://i.imgur.com/xyz789.jpg',
                'تاريخ الصلاحيه': '2026-06-30'
            }
        ];
        
        // Create worksheet
        const worksheet = xlsx.utils.json_to_sheet(templateData);
        
        // Create workbook
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Products');
        
        // Generate buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        // Send file
        res.setHeader('Content-Disposition', 'attachment; filename=products_template.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
        
    } catch (err) {
        console.error('Template generation error:', err);
        res.status(500).json({ error: 'Failed to generate template' });
    }
});

export default router;
