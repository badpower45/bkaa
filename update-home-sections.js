import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

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
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false
});

async function updateHomeSections() {
    try {
        console.log('🔄 Starting home sections update...\n');
        
        // جلب الفئات المتاحة فعلياً من المنتجات
        const categoriesResult = await pool.query(`
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
        
        console.log(`✅ Found ${categoriesResult.rows.length} categories with products:\n`);
        categoriesResult.rows.forEach(cat => {
            console.log(`   📦 ${cat.category} (${cat.product_count} products)`);
        });
        
        if (categoriesResult.rows.length === 0) {
            console.log('❌ No categories found with products!');
            await pool.end();
            return;
        }
        
        // حذف الـ sections القديمة
        await pool.query('DELETE FROM home_sections');
        console.log('\n🗑️  Cleared existing sections\n');
        
        // إنشاء sections جديدة بناءً على الفئات المتاحة
        const categoryMap = {
            // مشروبات
            'مشروبات': { 
                en: 'Beverages', 
                img: 'https://images.unsplash.com/photo-1437418747212-8d9709afab22?w=1200&h=400&fit=crop' 
            },
            'مشرويات ساخنة': { 
                en: 'Hot Beverages', 
                img: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&h=400&fit=crop' 
            },
            
            // حلويات
            'حلويات': { 
                en: 'Sweets', 
                img: 'https://images.unsplash.com/photo-1514517521153-1be72277b32f?w=1200&h=400&fit=crop' 
            },
            'حلويات ': { 
                en: 'Sweets', 
                img: 'https://images.unsplash.com/photo-1514517521153-1be72277b32f?w=1200&h=400&fit=crop' 
            },
            'كاندي': { 
                en: 'Candy', 
                img: 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=1200&h=400&fit=crop' 
            },
            'شيكولاتة': { 
                en: 'Chocolate', 
                img: 'https://images.unsplash.com/photo-1511381939415-e44015466834?w=1200&h=400&fit=crop' 
            },
            'بسكويتات': { 
                en: 'Biscuits', 
                img: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=1200&h=400&fit=crop' 
            },
            
            // ألبان
            'ألبان': { 
                en: 'Dairy', 
                img: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=1200&h=400&fit=crop' 
            },
            'البان ': { 
                en: 'Dairy Products', 
                img: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=1200&h=400&fit=crop' 
            },
            'Dairy': { 
                en: 'Dairy', 
                img: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=1200&h=400&fit=crop' 
            },
            'جبن': { 
                en: 'Cheese', 
                img: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=1200&h=400&fit=crop' 
            },
            
            // مجمدات
            'مجمدات': { 
                en: 'Frozen Foods', 
                img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&h=400&fit=crop' 
            },
            
            // سناكس
            'سناكس': { 
                en: 'Snacks', 
                img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=400&fit=crop' 
            },
            'Snacks': { 
                en: 'Snacks', 
                img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=400&fit=crop' 
            },
            
            // منتجات صحية
            'صحي': { 
                en: 'Healthy Products', 
                img: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200&h=400&fit=crop' 
            },
            'منتجات صحيه': { 
                en: 'Health Products', 
                img: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200&h=400&fit=crop' 
            },
            
            // تجميل
            'تجميل': { 
                en: 'Beauty & Care', 
                img: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&h=400&fit=crop' 
            },
            
            // مخبوزات
            'Bakery': { 
                en: 'Bakery', 
                img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&h=400&fit=crop' 
            },
            
            // خضار
            'Vegetables': { 
                en: 'Fresh Vegetables', 
                img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=1200&h=400&fit=crop' 
            },
            
            // بقالة
            'بقالة': { 
                en: 'Groceries', 
                img: 'https://images.unsplash.com/photo-1553531087-1e6fa5ca4804?w=1200&h=400&fit=crop' 
            },
            'مكرونات ': { 
                en: 'Pasta', 
                img: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=1200&h=400&fit=crop' 
            }
        };
        
        let order = 1;
        const sections = [];
        
        // ترتيب مخصص للأقسام
        const priorityOrder = [
            'مشروبات',
            'حلويات', 
            'ألبان',
            'مجمدات',
            'سناكس',
            'جبن',
            'كاندي',
            'شيكولاتة',
            'صحي',
            'تجميل',
            'بسكويتات'
        ];
        
        // أضف الأقسام حسب الأولوية
        for (const priority of priorityOrder) {
            const cat = categoriesResult.rows.find(r => r.category === priority);
            if (cat) {
                const info = categoryMap[cat.category] || { 
                    en: cat.category, 
                    img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=400&fit=crop' 
                };
                
                sections.push({
                    category: cat.category,
                    section_name: info.en,
                    section_name_ar: cat.category,
                    banner_image: info.img,
                    display_order: order++,
                    max_products: 8,
                    product_count: cat.product_count
                });
            }
        }
        
        // أضف باقي الأقسام
        for (const cat of categoriesResult.rows) {
            if (!sections.find(s => s.category === cat.category)) {
                const info = categoryMap[cat.category] || { 
                    en: cat.category, 
                    img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=400&fit=crop' 
                };
                
                sections.push({
                    category: cat.category,
                    section_name: info.en,
                    section_name_ar: cat.category,
                    banner_image: info.img,
                    display_order: order++,
                    max_products: 8,
                    product_count: cat.product_count
                });
            }
        }
        
        console.log(`📋 Creating ${sections.length} home sections:\n`);
        
        // إدراج الأقسام
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
            
            console.log(`   ✅ ${section.display_order}. ${section.section_name_ar} (${section.section_name}) - ${section.product_count} products`);
        }
        
        // التحقق
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

updateHomeSections();
