import express from 'express';
import pool from '../database.js';

const router = express.Router();

// Admin: Get all categories (including inactive) - MUST BE BEFORE /:id
router.get('/admin/all', async (req, res) => {
    try {
        const includeOfferOnly = req.query.includeOfferOnly === 'true';
        const offerOnlyClause = includeOfferOnly
            ? ''
            : 'AND (p.is_offer_only = FALSE OR p.is_offer_only IS NULL)';

        const result = await pool.query(`
            SELECT 
                c.*,
                COUNT(DISTINCT p.id) as products_count
            FROM categories c
            LEFT JOIN products p ON (
                (
                    TRIM(LOWER(p.category)) = TRIM(LOWER(c.name))
                    OR TRIM(LOWER(p.category)) = TRIM(LOWER(c.name_ar))
                )
                ${offerOnlyClause}
            )
            GROUP BY c.id
            ORDER BY c.display_order ASC, c.name ASC
        `);
        
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching admin categories:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch categories' });
    }
});

// Get category by name (for products page) - MUST BE BEFORE /:id
router.get('/name/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const result = await pool.query('SELECT * FROM categories WHERE name = $1 OR name_ar = $1', [name]);
        
        if (result.rows.length === 0) {
            return res.json({ success: true, data: { name, name_ar: name, image: null, bg_color: 'bg-orange-50' } });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch category' });
    }
});

// Seed default categories (for development)
router.post('/dev/seed', async (req, res) => {
    try {
        const defaultCategories = [
            { name: 'بقالة', name_ar: 'بقالة', icon: '🛒', bg_color: 'bg-amber-50', display_order: 1 },
            { name: 'ألبان', name_ar: 'ألبان', icon: '🥛', bg_color: 'bg-blue-50', display_order: 2 },
            { name: 'مشروبات', name_ar: 'مشروبات', icon: '🥤', bg_color: 'bg-cyan-50', display_order: 3 },
            { name: 'سناكس', name_ar: 'سناكس', icon: '🍿', bg_color: 'bg-yellow-50', display_order: 4 },
            { name: 'حلويات', name_ar: 'حلويات', icon: '🍫', bg_color: 'bg-pink-50', display_order: 5 },
            { name: 'زيوت', name_ar: 'زيوت', icon: '🫗', bg_color: 'bg-green-50', display_order: 6 },
            { name: 'منظفات', name_ar: 'منظفات', icon: '🧼', bg_color: 'bg-purple-50', display_order: 7 },
            { name: 'عناية شخصية', name_ar: 'عناية شخصية', icon: '🧴', bg_color: 'bg-indigo-50', display_order: 8 }
        ];

        for (const cat of defaultCategories) {
            // Check if exists first
            const existing = await pool.query('SELECT id FROM categories WHERE name = $1 AND parent_id IS NULL', [cat.name]);
            if (existing.rows.length === 0) {
                await pool.query(
                    `INSERT INTO categories (name, name_ar, icon, bg_color, display_order, is_active, parent_id)
                     VALUES ($1, $2, $3, $4, $5, true, NULL)`,
                    [cat.name, cat.name_ar, cat.icon, cat.bg_color, cat.display_order]
                );
            }
        }

        // Add some subcategories
        const subcats = [
            { parent: 'بقالة', name: 'أرز', name_ar: 'أرز' },
            { parent: 'بقالة', name: 'مكرونة', name_ar: 'مكرونة' },
            { parent: 'بقالة', name: 'سكر', name_ar: 'سكر' },
            { parent: 'ألبان', name: 'لبن', name_ar: 'لبن' },
            { parent: 'ألبان', name: 'جبن', name_ar: 'جبن' },
            { parent: 'ألبان', name: 'زبادي', name_ar: 'زبادي' },
            { parent: 'مشروبات', name: 'مشروبات غازية', name_ar: 'مشروبات غازية' },
            { parent: 'مشروبات', name: 'عصائر', name_ar: 'عصائر' },
            { parent: 'سناكس', name: 'شيبس', name_ar: 'شيبس' },
            { parent: 'سناكس', name: 'بسكويت', name_ar: 'بسكويت' },
            { parent: 'حلويات', name: 'شوكولاتة', name_ar: 'شوكولاتة' },
            { parent: 'حلويات', name: 'حلوى', name_ar: 'حلوى' }
        ];

        for (const sub of subcats) {
            const parentResult = await pool.query('SELECT id FROM categories WHERE name = $1 AND parent_id IS NULL', [sub.parent]);
            if (parentResult.rows.length > 0) {
                const existingSub = await pool.query(
                    'SELECT id FROM categories WHERE name = $1 AND parent_id = $2',
                    [sub.name, parentResult.rows[0].id]
                );
                if (existingSub.rows.length === 0) {
                    await pool.query(
                        `INSERT INTO categories (name, name_ar, parent_id, is_active)
                         VALUES ($1, $2, $3, true)`,
                        [sub.name, sub.name_ar, parentResult.rows[0].id]
                    );
                }
            }
        }

        res.json({ success: true, message: 'تم إضافة التصنيفات بنجاح' });
    } catch (error) {
        console.error('Error seeding categories:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all categories with images
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.*,
                COUNT(DISTINCT p.id) as products_count
            FROM categories c
            LEFT JOIN products p ON (
                normalize_arabic_text(p.category) = normalize_arabic_text(c.name_ar)
                OR normalize_arabic_text(p.category) = normalize_arabic_text(c.name)
                OR p.category = c.name
                OR p.category = c.name_ar
            ) AND (p.is_offer_only = FALSE OR p.is_offer_only IS NULL)
            WHERE c.is_active = true
            GROUP BY c.id
            ORDER BY c.display_order ASC, c.name ASC
        `);
        
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching categories:', error);
        // Return empty array instead of fallback from products
        res.json({ success: true, data: [] });
    }
});

// Get single category
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch category' });
    }
});

// Admin: Create category
router.post('/', async (req, res) => {
    try {
        const {
            name,
            name_ar,
            image,
            icon,
            bg_color = 'bg-orange-50',
            description,
            parent_id,
            display_order = 0,
            is_active = true
        } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }
        
        // إذا لم يتم تحديد parent_id، يكون null (تصنيف أب)
        const finalParentId = parent_id !== undefined && parent_id !== '' ? parent_id : null;
        
        const result = await pool.query(`
            INSERT INTO categories (name, name_ar, image, icon, bg_color, description, parent_id, display_order, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [name, name_ar || name, image, icon, bg_color, description, finalParentId, display_order, is_active]);
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error creating category:', error);
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({ success: false, error: 'Category with this name already exists' });
        }
        res.status(500).json({ success: false, error: 'Failed to create category' });
    }
});

// Admin: Update category
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            name_ar,
            image,
            icon,
            bg_color,
            description,
            parent_id,
            display_order,
            is_active
        } = req.body;
        
        const result = await pool.query(`
            UPDATE categories 
            SET name = COALESCE($1, name),
                name_ar = COALESCE($2, name_ar),
                image = COALESCE($3, image),
                icon = COALESCE($4, icon),
                bg_color = COALESCE($5, bg_color),
                description = COALESCE($6, description),
                parent_id = $7,
                display_order = COALESCE($8, display_order),
                is_active = COALESCE($9, is_active),
                updated_at = NOW()
            WHERE id = $10
            RETURNING *
        `, [name, name_ar, image, icon, bg_color, description, parent_id, display_order, is_active, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ success: false, error: 'Failed to update category' });
    }
});

// Admin: Delete category
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if category has products
        const productsCheck = await pool.query(
            'SELECT COUNT(*) FROM products p JOIN categories c ON p.category = c.name WHERE c.id = $1',
            [id]
        );
        
        if (parseInt(productsCheck.rows[0].count) > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot delete category with products. Move or delete products first.' 
            });
        }
        
        const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }
        
        res.json({ success: true, message: 'Category deleted' });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ success: false, error: 'Failed to delete category' });
    }
});

// Admin: Reorder categories
router.post('/reorder', async (req, res) => {
    try {
        const { categories } = req.body; // Array of { id, display_order }
        
        if (!Array.isArray(categories)) {
            return res.status(400).json({ success: false, error: 'Categories array is required' });
        }
        
        for (const cat of categories) {
            await pool.query(
                'UPDATE categories SET display_order = $1 WHERE id = $2',
                [cat.display_order, cat.id]
            );
        }
        
        res.json({ success: true, message: 'Categories reordered' });
    } catch (error) {
        console.error('Error reordering categories:', error);
        res.status(500).json({ success: false, error: 'Failed to reorder categories' });
    }
});

// Get subcategories for a parent
router.get('/:id/subcategories', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT * FROM categories 
            WHERE parent_id = $1 AND is_active = true
            ORDER BY display_order ASC, name ASC
        `, [id]);
        
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching subcategories:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch subcategories' });
    }
});

export default router;
