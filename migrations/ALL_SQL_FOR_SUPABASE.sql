-- ============================================
-- أكواد SQL الكاملة لـ Supabase
-- نسخ ولصق في SQL Editor في Supabase
-- ============================================

-- 1. جدول الفيفوريت (المنتجات المفضلة)
-- ============================================
CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_product ON favorites(product_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_product ON favorites(user_id, product_id);


-- 2. جدول الستوريز
-- ============================================
CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    branch_id INTEGER,
    title TEXT NOT NULL,
    media_url TEXT NOT NULL,
    media_type VARCHAR(10) DEFAULT 'image',
    duration INTEGER DEFAULT 5,
    link_url TEXT,
    link_text TEXT,
    views_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stories_active ON stories(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_priority ON stories(priority DESC);


-- 3. جدول التصنيفات (Categories)
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    name_ar TEXT NOT NULL,
    image TEXT,
    icon TEXT,
    bg_color VARCHAR(50) DEFAULT 'bg-orange-50',
    description TEXT,
    parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(display_order);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);


-- 4. جدول ريلز فيسبوك (Facebook Reels)
-- ============================================
CREATE TABLE IF NOT EXISTS facebook_reels (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    video_url TEXT,
    facebook_url TEXT NOT NULL,
    views_count VARCHAR(50) DEFAULT '0',
    duration VARCHAR(20) DEFAULT '0:30',
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_facebook_reels_active ON facebook_reels(is_active);
CREATE INDEX IF NOT EXISTS idx_facebook_reels_order ON facebook_reels(display_order);


-- ============================================
-- تم الانتهاء! 
-- الآن يمكنك استخدام:
-- - صفحة إدارة التصنيفات: /admin/categories
-- - صفحة إدارة ريلز فيسبوك: /admin/facebook-reels
-- ============================================


-- 5. إضافة حقل موقع الرف للمنتجات
-- ============================================
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(100);

COMMENT ON COLUMN products.shelf_location IS 'موقع المنتج في الرف - مثال: صف 3 - رف A';


-- 6. جدول عروض البراندات (Brand Offers)
-- ============================================
CREATE TABLE IF NOT EXISTS brand_offers (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    title_ar TEXT NOT NULL,
    subtitle TEXT,
    subtitle_ar TEXT,
    discount_text TEXT,
    discount_text_ar TEXT,
    
    -- الألوان والتصميم
    background_type VARCHAR(20) DEFAULT 'gradient',
    background_value TEXT DEFAULT 'linear-gradient(135deg, #8B4513 0%, #5D3A1A 50%, #3D2610 100%)',
    text_color VARCHAR(50) DEFAULT '#FEF3C7',
    badge_color VARCHAR(50) DEFAULT '#EF4444',
    badge_text_color VARCHAR(50) DEFAULT '#FFFFFF',
    
    -- الصور
    image_url TEXT,
    brand_logo_url TEXT,
    
    -- الربط بمنتج أو براند
    linked_product_id INTEGER,
    linked_brand_id INTEGER,
    link_type VARCHAR(20) DEFAULT 'product',
    custom_link TEXT,
    
    -- الحالة والترتيب
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    starts_at TIMESTAMP,
    expires_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_brand_offers_active ON brand_offers(is_active);
CREATE INDEX IF NOT EXISTS idx_brand_offers_order ON brand_offers(display_order);
CREATE INDEX IF NOT EXISTS idx_brand_offers_dates ON brand_offers(starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_brand_offers_product ON brand_offers(linked_product_id);
CREATE INDEX IF NOT EXISTS idx_brand_offers_brand ON brand_offers(linked_brand_id);

-- إدخال بيانات تجريبية
INSERT INTO brand_offers (title, title_ar, subtitle, subtitle_ar, discount_text, discount_text_ar, background_value, text_color, image_url, link_type, display_order, is_active) VALUES
('Galaxy Chocolate', 'شوكولاتة جالاكسي', 'Exclusive offers on all Galaxy products', 'عروض حصرية على كل منتجات جالاكسي', 'Up to 30% OFF', 'خصم يصل إلى 30%', 'linear-gradient(135deg, #8B4513 0%, #5D3A1A 50%, #3D2610 100%)', '#FEF3C7', 'https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=400&h=300&fit=crop', 'brand', 1, true),
('Cadbury Dairy Milk', 'كادبوري ديري ميلك', 'Buy 2 Get 1 Free', 'اشتري 2 واحصل على 1 مجاناً', '2+1 Offer', 'عرض 2+1', 'linear-gradient(135deg, #4B0082 0%, #6B238E 50%, #8B008B 100%)', '#E9D5FF', 'https://images.unsplash.com/photo-1587132137056-bfbf0166836e?w=400&h=300&fit=crop', 'brand', 2, true),
('Pepsi Drinks', 'مشروبات بيبسي', 'Ramadan offers on all Pepsi drinks', 'عروض رمضان على كل مشروبات بيبسي', '25% OFF', 'خصم 25%', 'linear-gradient(135deg, #001F5C 0%, #003087 50%, #0056B3 100%)', '#BFDBFE', 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=300&fit=crop', 'brand', 3, true),
('Nestlé Products', 'منتجات نستله', 'Wide selection at special prices', 'تشكيلة واسعة بأسعار مميزة', '20% OFF', 'خصم 20%', 'linear-gradient(135deg, #C41E3A 0%, #A51C30 50%, #8B0000 100%)', '#FECACA', 'https://images.unsplash.com/photo-1563262924-641a8b3d397f?w=400&h=300&fit=crop', 'brand', 4, true),
('Lay''s Chips', 'شيبس ليز', 'All flavors at special prices', 'كل النكهات بأسعار خاصة', '15% OFF', 'خصم 15%', 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)', '#78350F', 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&h=300&fit=crop', 'brand', 5, true),
('Nescafé Coffee', 'قهوة نسكافيه', 'Start your day with a special offer', 'ابدأ يومك بعرض مميز', '35% OFF', 'خصم 35%', 'linear-gradient(135deg, #3E2723 0%, #4E342E 50%, #5D4037 100%)', '#FEF3C7', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=300&fit=crop', 'brand', 6, true);
