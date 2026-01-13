import express from 'express';
import { query } from '../database.js';

const router = express.Router();

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

// ============================================
// GET all active home sections with products
// ============================================
router.get('/', async (req, res) => {
    try {
        const branchId = req.query.branchId;

        // Check if home_sections table exists and has data
        const sectionsResult = await query(
            `SELECT * FROM home_sections 
             WHERE is_active = true 
             ORDER BY display_order ASC`,
            []
        );

        const sections = sectionsResult?.rows || [];
        
        // If no sections, return empty array
        if (sections.length === 0) {
            console.log('No active home sections found');
            return res.json({ data: [] });
        }

        // For each section, get products from that category
        const sectionsWithProducts = await Promise.all(
            sections.map(async (section) => {
                try {
                    console.log(`🔍 Fetching products for section "${section.section_name_ar}" - Category: ${section.category}, Max: ${section.max_products}`);
                    
                    const categoryCandidates = [
                        section.category,
                        section.section_name_ar,
                        section.section_name
                    ]
                        .filter(Boolean)
                        .map((value) => value.toString().trim())
                        .filter((value, index, self) => self.indexOf(value) === index);

                    const normalizedCandidates = categoryCandidates.map(normalizeCategoryValue).filter(Boolean);
                    const hasCandidates = normalizedCandidates.length > 0;

                    const categoryFilter = hasCandidates
                        ? normalizedCandidates
                            .map((_, idx) => `
                                normalize_arabic_text(p.category) = normalize_arabic_text($${idx + 1})
                                OR p.category = $${idx + 1}
                            `)
                            .join(' OR ')
                        : 'TRUE';

                    const categoryMatchFilter = hasCandidates
                        ? normalizedCandidates
                            .map((_, idx) => `
                                normalize_arabic_text(c.name) = normalize_arabic_text($${idx + 1})
                                OR normalize_arabic_text(c.name_ar) = normalize_arabic_text($${idx + 1})
                            `)
                            .join(' OR ')
                        : 'FALSE';

                    let productsQuery = `
                        WITH matched_category AS (
                            SELECT c.*
                            FROM categories c
                            WHERE ${categoryMatchFilter}
                            LIMIT 1
                        )
                        SELECT DISTINCT ON (p.id) 
                            p.id, p.name, p.category, p.image, p.rating, p.reviews,
                            p.is_organic, p.is_new, p.description, p.weight, p.barcode,
                            bp.price, bp.discount_price, bp.stock_quantity, bp.is_available
                        FROM products p
                        LEFT JOIN branch_products bp ON p.id = bp.product_id
                        LEFT JOIN matched_category c ON TRUE
                        WHERE (p.is_offer_only = FALSE OR p.is_offer_only IS NULL)
                        AND (
                            ${categoryFilter}
                            OR (
                                c.id IS NOT NULL
                                AND (
                                    normalize_arabic_text(p.category) = normalize_arabic_text(c.name)
                                    OR normalize_arabic_text(p.category) = normalize_arabic_text(c.name_ar)
                                )
                            )
                        )
                    `;

                    const params = hasCandidates ? categoryCandidates : [section.category];

                    if (branchId) {
                        productsQuery += ` AND bp.branch_id = $${params.length + 1} AND bp.is_available = true`;
                        params.push(branchId);
                    }

                    productsQuery += ` ORDER BY p.is_new DESC, p.id DESC LIMIT $${params.length + 1}`;
                    params.push(section.max_products || 8);

                    console.log(`🔎 Searching for category candidates:`, categoryCandidates);
                    console.log(`🔎 Query params:`, params);
                    console.log(`🔎 SQL Query:`, productsQuery.replace(/\s+/g, ' ').trim());
                    
                    const productsResult = await query(productsQuery, params);
                    
                    console.log(`✅ Found ${productsResult?.rows?.length || 0} products for category "${section.category}"`);
                    if (productsResult?.rows?.length > 0) {
                        console.log(`📦 Sample product:`, { 
                            id: productsResult.rows[0].id, 
                            name: productsResult.rows[0].name, 
                            category: productsResult.rows[0].category,
                            price: productsResult.rows[0].price 
                        });
                    } else {
                        console.warn(`⚠️ No products found for category "${section.category}" - Check if category name matches exactly`);
                    }

                    return {
                        ...section,
                        products: productsResult?.rows || []
                    };
                } catch (err) {
                    console.error(`❌ Error fetching products for section ${section.id}:`, err);
                    return {
                        ...section,
                        products: []
                    };
                }
            })
        );
        
        console.log(`📦 Returning ${sectionsWithProducts.length} sections with products`);

        res.json({ data: sectionsWithProducts });
    } catch (error) {
        console.error('Error fetching home sections:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to fetch home sections', message: error.message, data: [] });
    }
});

// ============================================
// GET single home section
// ============================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            'SELECT * FROM home_sections WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Section not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching section:', error);
        res.status(500).json({ error: 'Failed to fetch section' });
    }
});

// ============================================
// CREATE new home section (Admin only)
// ============================================
router.post('/', async (req, res) => {
    try {
        const {
            section_name,
            section_name_ar,
            banner_image,
            category,
            display_order,
            max_products,
            is_active
        } = req.body;

        // Validation
        if (!section_name || !section_name_ar || !banner_image || !category) {
            return res.status(400).json({
                error: 'Missing required fields'
            });
        }

        const result = await query(
            `INSERT INTO home_sections 
             (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                section_name,
                section_name_ar,
                banner_image,
                category,
                display_order || 0,
                max_products || 8,
                is_active !== false
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating section:', error);
        res.status(500).json({ error: 'Failed to create section' });
    }
});

// ============================================
// UPDATE home section (Admin only)
// ============================================
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            section_name,
            section_name_ar,
            banner_image,
            category,
            display_order,
            max_products,
            is_active
        } = req.body;

        const result = await query(
            `UPDATE home_sections 
             SET section_name = COALESCE($1, section_name),
                 section_name_ar = COALESCE($2, section_name_ar),
                 banner_image = COALESCE($3, banner_image),
                 category = COALESCE($4, category),
                 display_order = COALESCE($5, display_order),
                 max_products = COALESCE($6, max_products),
                 is_active = COALESCE($7, is_active)
             WHERE id = $8
             RETURNING *`,
            [
                section_name,
                section_name_ar,
                banner_image,
                category,
                display_order,
                max_products,
                is_active,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Section not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating section:', error);
        res.status(500).json({ error: 'Failed to update section' });
    }
});

// ============================================
// DELETE home section (Admin only)
// ============================================
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            'DELETE FROM home_sections WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Section not found' });
        }

        res.json({ message: 'Section deleted successfully' });
    } catch (error) {
        console.error('Error deleting section:', error);
        res.status(500).json({ error: 'Failed to delete section' });
    }
});

// ============================================
// REORDER sections (Admin only)
// ============================================
router.post('/reorder', async (req, res) => {
    try {
        const { sections } = req.body; // Array of {id, display_order}

        if (!Array.isArray(sections)) {
            return res.status(400).json({ error: 'Invalid data format' });
        }

        await query('BEGIN');

        for (const section of sections) {
            await query(
                'UPDATE home_sections SET display_order = $1 WHERE id = $2',
                [section.display_order, section.id]
            );
        }

        await query('COMMIT');

        res.json({ message: 'Sections reordered successfully' });
    } catch (error) {
        await query('ROLLBACK');
        console.error('Error reordering sections:', error);
        res.status(500).json({ error: 'Failed to reorder sections' });
    }
});

// ============================================
// UPDATE Home Sections (Recreate all based on available categories)
// ============================================
router.post('/reset', async (req, res) => {
    try {
        console.log('🔄 Resetting home sections...');
        
        // 1. Get available categories with product counts
        const categoriesResult = await query(`
            SELECT DISTINCT p.category, COUNT(DISTINCT p.id) as product_count
            FROM products p
            INNER JOIN branch_products bp ON p.id = bp.product_id
            WHERE bp.is_available = true 
            AND bp.branch_id = 1
            AND p.category IS NOT NULL
            AND p.category != ''
            AND (p.is_offer_only = FALSE OR p.is_offer_only IS NULL)
            GROUP BY p.category
            HAVING COUNT(DISTINCT p.id) >= 2
            ORDER BY COUNT(DISTINCT p.id) DESC
        `);
        
        const categories = categoriesResult.rows;
        console.log(`Found ${categories.length} categories with products`);
        
        if (categories.length === 0) {
            return res.status(400).json({ error: 'No categories with products found' });
        }
        
        // 2. Delete old sections
        await query('DELETE FROM home_sections');
        console.log('Deleted old sections');
        
        // 3. Category mapping for names and images
        const categoryMap = {
            'مشروبات': { en: 'Beverages', img: 'https://images.unsplash.com/photo-1437418747212-8d9709afab22?w=1200&h=400&fit=crop' },
            'مشرويات ساخنة': { en: 'Hot Beverages', img: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&h=400&fit=crop' },
            'حلويات': { en: 'Sweets', img: 'https://images.unsplash.com/photo-1514517521153-1be72277b32f?w=1200&h=400&fit=crop' },
            'حلويات ': { en: 'Sweets', img: 'https://images.unsplash.com/photo-1514517521153-1be72277b32f?w=1200&h=400&fit=crop' },
            'كاندي': { en: 'Candy', img: 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=1200&h=400&fit=crop' },
            'شيكولاتة': { en: 'Chocolate', img: 'https://images.unsplash.com/photo-1511381939415-e44015466834?w=1200&h=400&fit=crop' },
            'بسكويتات': { en: 'Biscuits', img: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=1200&h=400&fit=crop' },
            'ألبان': { en: 'Dairy', img: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=1200&h=400&fit=crop' },
            'البان ': { en: 'Dairy Products', img: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=1200&h=400&fit=crop' },
            'Dairy': { en: 'Dairy', img: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=1200&h=400&fit=crop' },
            'جبن': { en: 'Cheese', img: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=1200&h=400&fit=crop' },
            'مجمدات': { en: 'Frozen Foods', img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&h=400&fit=crop' },
            'سناكس': { en: 'Snacks', img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=400&fit=crop' },
            'Snacks': { en: 'Snacks', img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=400&fit=crop' },
            'صحي': { en: 'Healthy Products', img: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200&h=400&fit=crop' },
            'منتجات صحيه': { en: 'Health Products', img: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200&h=400&fit=crop' },
            'تجميل': { en: 'Beauty & Care', img: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&h=400&fit=crop' },
            'Bakery': { en: 'Bakery', img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&h=400&fit=crop' },
            'Vegetables': { en: 'Fresh Vegetables', img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=1200&h=400&fit=crop' },
            'بقالة': { en: 'Groceries', img: 'https://images.unsplash.com/photo-1553531087-1e6fa5ca4804?w=1200&h=400&fit=crop' },
            'مكرونات ': { en: 'Pasta', img: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=1200&h=400&fit=crop' }
        };
        
        // 4. Create new sections
        const createdSections = [];
        let order = 1;
        
        for (const cat of categories) {
            const info = categoryMap[cat.category] || { 
                en: cat.category, 
                img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=400&fit=crop' 
            };
            
            const result = await query(`
                INSERT INTO home_sections (
                    section_name, section_name_ar, banner_image, category,
                    display_order, max_products, is_active
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `, [
                info.en,
                cat.category,
                info.img,
                cat.category,
                order++,
                8,
                true
            ]);
            
            createdSections.push({
                ...result.rows[0],
                product_count: cat.product_count
            });
            
            console.log(`✅ Created: ${cat.category} (${cat.product_count} products)`);
        }
        
        res.json({ 
            message: `Successfully created ${createdSections.length} home sections`,
            sections: createdSections
        });
        
    } catch (error) {
        console.error('Error resetting home sections:', error);
        res.status(500).json({ error: 'Failed to reset home sections', details: error.message });
    }
});

export default router;
