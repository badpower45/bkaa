import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const normalizeConnectionString = (raw) => {
    if (!raw) return raw;
    let normalized = raw;
    if (!normalized.includes('sslmode=')) {
        const separator = normalized.includes('?') ? '&' : '?';
        normalized = `${normalized}${separator}sslmode=no-verify`;
    }
    if (normalized.includes(':6543') && !normalized.includes('prepared_statements=')) {
        normalized = `${normalized}&prepared_statements=false`;
    }
    return normalized;
};

const pool = new Pool({
    connectionString: normalizeConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false }
});

async function seedHomeSections() {
    try {
        console.log('🌱 Starting home sections seeding...\n');
        
        // Get distinct categories
        const categoriesResult = await pool.query(`
            SELECT DISTINCT p.category, COUNT(*) as product_count
            FROM products p
            INNER JOIN branch_products bp ON p.id = bp.product_id
            WHERE bp.is_available = true 
            AND p.category IS NOT NULL
            AND p.category != ''
            GROUP BY p.category
            ORDER BY COUNT(*) DESC
            LIMIT 10
        `);
        
        console.log(`✅ Found ${categoriesResult.rows.length} categories:`);
        categoriesResult.rows.forEach(cat => {
            console.log(`   - ${cat.category} (${cat.product_count} products)`);
        });
        
        if (categoriesResult.rows.length === 0) {
            console.log('❌ No categories found!');
            await pool.end();
            return;
        }
        
        // Clear existing sections
        await pool.query('DELETE FROM home_sections');
        console.log('\n🗑️  Cleared existing sections\n');
        
        // Create sections based on top categories
        const categories = categoriesResult.rows;
        const sections = [];
        
        // Map Arabic category names to English names and images
        const categoryMap = {
            'فواكه': { en: 'Fresh Fruits', img: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1200&h=400&fit=crop' },
            'خضروات': { en: 'Fresh Vegetables', img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=1200&h=400&fit=crop' },
            'ألبان': { en: 'Dairy Products', img: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=1200&h=400&fit=crop' },
            'لحوم': { en: 'Fresh Meat', img: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=1200&h=400&fit=crop' },
            'مخبوزات': { en: 'Bakery', img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&h=400&fit=crop' },
            'مشروبات': { en: 'Beverages', img: 'https://images.unsplash.com/photo-1437418747212-8d9709afab22?w=1200&h=400&fit=crop' },
        };
        
        let order = 1;
        for (const cat of categories.slice(0, 6)) {
            const categoryInfo = categoryMap[cat.category] || { 
                en: cat.category, 
                img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=400&fit=crop' 
            };
            
            sections.push({
                section_name: categoryInfo.en,
                section_name_ar: cat.category,
                banner_image: categoryInfo.img,
                category: cat.category,
                display_order: order++,
                max_products: 8
            });
        }
        
        // Insert sections
        for (const section of sections) {
            await pool.query(`
                INSERT INTO home_sections (
                    section_name, section_name_ar, banner_image, category,
                    display_order, max_products, is_active
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                section.section_name,
                section.section_name_ar,
                section.banner_image,
                section.category,
                section.display_order,
                section.max_products,
                true
            ]);
            
            console.log(`✅ Created: ${section.section_name_ar} (${section.category})`);
        }
        
        // Verify
        const result = await pool.query('SELECT COUNT(*) FROM home_sections WHERE is_active = true');
        console.log(`\n🎉 Success! Created ${result.rows[0].count} active home sections\n`);
        
        await pool.end();
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error(err);
        await pool.end();
        process.exit(1);
    }
}

seedHomeSections();
