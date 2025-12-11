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
    'price': ['price', 'السعر', 'سعر'],
    'image': ['image', 'image_url', 'الصورة', 'صورة'],
    'category': ['category', 'القسم', 'الفئة', 'فئة'],
    
    // Optional fields
    'name_en': ['name_en', 'english_name', 'الاسم بالانجليزي'],
    'description': ['description', 'الوصف', 'وصف'],
    'description_en': ['description_en', 'english_description'],
    'weight': ['weight', 'الوزن', 'وزن'],
    'barcode': ['barcode', 'الباركود', 'باركود'],
    'sku': ['sku'],
    'brand': ['brand', 'brand_id', 'البراند', 'الماركة'],
    'stock_quantity': ['stock_quantity', 'stock', 'الكمية', 'كمية'],
    'old_price': ['old_price', 'السعر القديم'],
    'discount_percentage': ['discount_percentage', 'discount', 'الخصم', 'خصم'],
    'nutrition_info': ['nutrition_info', 'معلومات غذائية'],
    'ingredients': ['ingredients', 'المكونات', 'مكونات'],
    'allergens': ['allergens', 'الحساسية', 'حساسية'],
    'branch_id': ['branch_id', 'معرف الفرع']
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
    
    // Required fields
    const requiredFields = ['name', 'price', 'image', 'category'];
    for (const field of requiredFields) {
        const value = findColumnValue(row, COLUMN_MAPPING[field]);
        if (!value) {
            errors.push(`Missing required field: ${field}`);
        } else {
            product[field] = value;
        }
    }
    
    // Optional fields
    const optionalFields = [
        'name_en', 'description', 'description_en', 'weight', 'barcode', 
        'sku', 'brand', 'stock_quantity', 'old_price', 'discount_percentage',
        'nutrition_info', 'ingredients', 'allergens', 'branch_id'
    ];
    
    for (const field of optionalFields) {
        const value = findColumnValue(row, COLUMN_MAPPING[field]);
        product[field] = value || null;
    }
    
    // Validation
    if (product.price) {
        const priceNum = parseFloat(product.price);
        if (isNaN(priceNum) || priceNum <= 0) {
            errors.push('Invalid price format - must be a positive number');
        } else {
            product.price = priceNum;
        }
    }
    
    if (product.old_price) {
        const oldPriceNum = parseFloat(product.old_price);
        if (!isNaN(oldPriceNum)) {
            product.old_price = oldPriceNum;
        } else {
            product.old_price = null;
        }
    }
    
    if (product.discount_percentage) {
        const discountNum = parseInt(product.discount_percentage);
        if (!isNaN(discountNum) && discountNum >= 0 && discountNum <= 100) {
            product.discount_percentage = discountNum;
        } else {
            product.discount_percentage = 0;
        }
    } else {
        product.discount_percentage = 0;
    }
    
    if (product.stock_quantity) {
        const stockNum = parseInt(product.stock_quantity);
        if (!isNaN(stockNum) && stockNum >= 0) {
            product.stock_quantity = stockNum;
        } else {
            product.stock_quantity = 0;
        }
    } else {
        product.stock_quantity = 0;
    }
    
    if (product.image && !product.image.startsWith('http') && !product.image.startsWith('data:')) {
        errors.push('Invalid image URL - must start with http:// or https://');
    }
    
    // Default branch_id to 1 if not provided
    if (!product.branch_id) {
        product.branch_id = 1;
    } else {
        const branchNum = parseInt(product.branch_id);
        if (!isNaN(branchNum)) {
            product.branch_id = branchNum;
        } else {
            product.branch_id = 1;
        }
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
        
        // Read Excel file
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const rows = xlsx.utils.sheet_to_json(worksheet, { defval: null });
        
        if (rows.length === 0) {
            return res.status(400).json({ error: 'Excel file is empty' });
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
                            name, name_en, description, description_en, 
                            category, image, weight, barcode, sku,
                            old_price, discount_percentage,
                            nutrition_info, ingredients, allergens,
                            is_active, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, NOW(), NOW()
                        ) RETURNING id, name, category, price
                    `, [
                        product.name,
                        product.name_en,
                        product.description,
                        product.description_en,
                        product.category,
                        product.image,
                        product.weight,
                        product.barcode,
                        product.sku,
                        product.old_price,
                        product.discount_percentage,
                        product.nutrition_info ? JSON.stringify(product.nutrition_info) : null,
                        product.ingredients,
                        product.allergens
                    ]);
                    
                    const productId = insertedProduct[0].id;
                    
                    // Insert into branch_products table
                    await query(`
                        INSERT INTO branch_products (
                            branch_id, product_id, price, stock_quantity, 
                            is_available, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, true, NOW(), NOW()
                        )
                        ON CONFLICT (branch_id, product_id) 
                        DO UPDATE SET 
                            price = EXCLUDED.price,
                            stock_quantity = EXCLUDED.stock_quantity,
                            updated_at = NOW()
                    `, [
                        product.branch_id,
                        productId,
                        product.price,
                        product.stock_quantity
                    ]);
                    
                    imported.push({
                        id: productId,
                        name: product.name,
                        category: product.category,
                        price: product.price
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
                'barcode': '6221155123456',
                'sku': 'CHOC-GAL-100',
                'brand': 'جالاكسي',
                'stock_quantity': 150,
                'image': 'https://i.imgur.com/abc123.jpg',
                'description': 'شوكولاتة لذيذة بالحليب',
                'description_en': 'Delicious milk chocolate',
                'ingredients': 'حليب، سكر، كاكاو',
                'allergens': 'حليب',
                'branch_id': 1
            }
        ];
        
        // Create workbook
        const worksheet = xlsx.utils.json_to_sheet(templateData);
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
