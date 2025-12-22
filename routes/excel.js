import express from 'express';
import xlsx from 'xlsx';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Generate Excel template with brand support
router.get('/template', [verifyToken, isAdmin], async (req, res) => {
    try {
        // Get list of brands for reference
        const { rows: brands } = await query('SELECT id, name_ar, name_en FROM brands ORDER BY name_ar');
        
        // Create sample data with all columns including brand
        const sampleData = [
            {
                'id': 'PROD001',
                'اسم المنتج': 'مثال - بيبسي 330 مل',
                'name': 'Pepsi 330ml',
                'التصنيف الاساسي': 'مشروبات',
                'category': 'Beverages',
                'التصنيف الفرعي': 'مشروبات غازية',
                'subcategory': 'Soft Drinks',
                'البراند': brands.length > 0 ? brands[0].id : '',
                'brand_id': brands.length > 0 ? brands[0].id : '',
                'brand_name_ar': brands.length > 0 ? brands[0].name_ar : 'بيبسي',
                'brand_name_en': brands.length > 0 ? brands[0].name_en : 'Pepsi',
                'لينك الصوره': 'https://example.com/image.jpg',
                'image': 'https://example.com/image.jpg',
                'الوزن/الحجم': '330 مل',
                'weight': '330ml',
                'الباركود': '123456789',
                'barcode': '123456789',
                'السعر بعد': 10,
                'price': 10,
                'السعر قبل': 12,
                'originalPrice': 12,
                'عدد القطع المتوفره': 100,
                'stock_quantity': 100,
                'الفرع': 1,
                'branchId': 1,
                'عضوي؟': 'لا',
                'isOrganic': false,
                'جديد؟': 'نعم',
                'isNew': true,
                'مكان التخزين': 'A-12',
                'shelfLocation': 'A-12'
            }
        ];

        // Create worksheet
        const ws = xlsx.utils.json_to_sheet(sampleData);
        
        // Create a new workbook and add the worksheet
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'Products');
        
        // Add brands sheet for reference
        if (brands.length > 0) {
            const brandsData = brands.map(b => ({
                'Brand ID': b.id,
                'الاسم بالعربي': b.name_ar,
                'الاسم بالإنجليزي': b.name_en
            }));
            const brandsWs = xlsx.utils.json_to_sheet(brandsData);
            xlsx.utils.book_append_sheet(wb, brandsWs, 'Brands Reference');
        }
        
        // Generate buffer
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        // Set headers
        res.setHeader('Content-Disposition', 'attachment; filename="products_template_with_brands.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        // Send file
        res.send(buffer);
        
    } catch (error) {
        console.error('Error generating template:', error);
        res.status(500).json({ error: 'Failed to generate template', message: error.message });
    }
});

// Export products to Excel with brands
router.get('/export', [verifyToken, isAdmin], async (req, res) => {
    try {
        const sql = `
            SELECT 
                p.id,
                p.name as "اسم المنتج",
                p.name,
                p.category as "التصنيف الاساسي",
                p.category,
                p.subcategory as "التصنيف الفرعي",
                p.subcategory,
                p.brand_id as "البراند",
                p.brand_id,
                b.name_ar as brand_name_ar,
                b.name_en as brand_name_en,
                p.image as "لينك الصوره",
                p.image,
                p.weight as "الوزن/الحجم",
                p.weight,
                p.barcode as "الباركود",
                p.barcode,
                bp.price as "السعر بعد",
                bp.price,
                bp.discount_price as "السعر قبل",
                bp.discount_price as originalPrice,
                bp.stock_quantity as "عدد القطع المتوفره",
                bp.stock_quantity,
                bp.branch_id as "الفرع",
                bp.branch_id as branchId,
                CASE WHEN p.is_organic THEN 'نعم' ELSE 'لا' END as "عضوي؟",
                p.is_organic as isOrganic,
                CASE WHEN p.is_new THEN 'نعم' ELSE 'لا' END as "جديد؟",
                p.is_new as isNew,
                p.shelf_location as "مكان التخزين",
                p.shelf_location as shelfLocation
            FROM products p
            LEFT JOIN branch_products bp ON p.id = bp.product_id
            LEFT JOIN brands b ON p.brand_id = b.id
            ORDER BY p.id
            LIMIT 1000
        `;
        
        const { rows } = await query(sql);
        
        // Create worksheet
        const ws = xlsx.utils.json_to_sheet(rows);
        
        // Create workbook
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'Products');
        
        // Generate buffer
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        // Set headers
        const filename = `products_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        // Send file
        res.send(buffer);
        
    } catch (error) {
        console.error('Error exporting products:', error);
        res.status(500).json({ error: 'Failed to export products', message: error.message });
    }
});

export default router;
