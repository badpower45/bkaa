import express from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

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
    'expiry_date': ['expiry_date', 'تاريخ الصلاحيه', 'تاريخ الصلاحية', 'صلاحيه', 'صلاحية']
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

// Extract and map data from row
function mapRowToProduct(row, rowIndex) {
    const product = {};
    const errors = [];
    
    // All 10 fields are required
    const allFields = [
        'name', 'barcode', 'old_price', 'price', 'category', 
        'subcategory', 'branch_id', 'stock_quantity', 'image', 'expiry_date'
    ];
    
    for (const field of allFields) {
        const value = findColumnValue(row, COLUMN_MAPPING[field]);
        if (!value && value !== 0) {
            errors.push(`Missing required field: ${field}`);
        } else {
            product[field] = value;
        }
    }
    
    // Validation
    if (product.price) {
        const priceNum = parseFloat(product.price);
        if (isNaN(priceNum) || priceNum <= 0) {
            errors.push('السعر بعد غير صحيح - يجب أن يكون رقم أكبر من صفر');
        } else {
            product.price = priceNum;
        }
    }
    
    if (product.old_price) {
        const oldPriceNum = parseFloat(product.old_price);
        if (isNaN(oldPriceNum) || oldPriceNum < 0) {
            errors.push('السعر قبل غير صحيح - يجب أن يكون رقم');
        } else {
            product.old_price = oldPriceNum;
        }
    }
    
    if (product.stock_quantity) {
        const stockNum = parseInt(product.stock_quantity);
        if (isNaN(stockNum) || stockNum < 0) {
            errors.push('الكمية غير صحيحة - يجب أن تكون رقم صحيح');
        } else {
            product.stock_quantity = stockNum;
        }
    }
    
    if (product.branch_id) {
        const branchNum = parseInt(product.branch_id);
        if (isNaN(branchNum) || branchNum <= 0) {
            errors.push('معرف الفرع غير صحيح - يجب أن يكون رقم أكبر من صفر');
        } else {
            product.branch_id = branchNum;
        }
    }
    
    if (product.image && !product.image.startsWith('http') && !product.image.startsWith('data:')) {
        errors.push('رابط الصورة غير صحيح - يجب أن يبدأ بـ http:// أو https://');
    }
    
    // Calculate discount percentage
    if (product.old_price && product.price && product.old_price > product.price) {
        product.discount_percentage = Math.round(((product.old_price - product.price) / product.old_price) * 100);
    } else {
        product.discount_percentage = 0;
    }
    
    return { product, errors, rowIndex };
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
        
        // Parse and validate all rows
        const validProducts = [];
        const failedRows = [];
        
        rows.forEach((row, index) => {
            const { product, errors, rowIndex } = mapRowToProduct(row, index + 2); // +2 for Excel row number (header + 1-indexed)
            
            if (errors.length > 0) {
                failedRows.push({
                    row: rowIndex,
                    data: row,
                    errors: errors
                });
            } else {
                validProducts.push(product);
            }
        });
        
        console.log(`Valid products: ${validProducts.length}, Failed: ${failedRows.length}`);
        
        // Import valid products
        const imported = [];
        const importErrors = [];
        
        await query('BEGIN');
        
        try {
            for (const product of validProducts) {
                try {
                    // Insert into products table
                    const { rows: insertedProduct } = await query(`
                        INSERT INTO products (
                            name, category, subcategory, image, barcode,
                            old_price, discount_percentage,
                            is_active, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW()
                        ) RETURNING id, name, category
                    `, [
                        product.name,
                        product.category,
                        product.subcategory,
                        product.image,
                        product.barcode,
                        product.old_price,
                        product.discount_percentage
                    ]);
                    
                    const productId = insertedProduct[0].id;
                    
                    // Insert into branch_products table
                    await query(`
                        INSERT INTO branch_products (
                            branch_id, product_id, price, stock_quantity, 
                            expiry_date, is_available, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, true, NOW(), NOW()
                        )
                        ON CONFLICT (branch_id, product_id) 
                        DO UPDATE SET 
                            price = EXCLUDED.price,
                            stock_quantity = EXCLUDED.stock_quantity,
                            expiry_date = EXCLUDED.expiry_date,
                            updated_at = NOW()
                    `, [
                        product.branch_id,
                        productId,
                        product.price,
                        product.stock_quantity,
                        product.expiry_date
                    ]);
                    
                    imported.push({
                        id: productId,
                        name: product.name,
                        category: product.category
                    });
                } catch (err) {
                    console.error('Error importing product:', product.name, err);
                    importErrors.push({
                        name: product.name,
                        error: err.message
                    });
                }
            }
            
            await query('COMMIT');
            
            console.log(`Successfully imported ${imported.length} products`);
            
            res.json({
                success: true,
                message: `Successfully imported ${imported.length} products`,
                imported: imported.length,
                failed: failedRows.length + importErrors.length,
                total: rows.length,
                details: {
                    imported: imported,
                    validationErrors: failedRows,
                    importErrors: importErrors
                }
            });
            
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
