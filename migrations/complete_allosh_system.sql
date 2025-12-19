-- ============================================
-- تعديلات قاعدة البيانات الشاملة - علوش ماركت
-- Migration File - نسخ ولصق في Supabase SQL Editor
-- ============================================

-- 1. جدول البرادات/البراندات الكامل (Refrigerators/Brands)
-- ============================================
CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    slogan_ar TEXT,
    slogan_en TEXT,
    description_ar TEXT,
    description_en TEXT,
    
    -- التقييم
    rating DECIMAL(2,1) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    reviews_count INTEGER DEFAULT 0,
    
    -- الصور والألوان
    logo_url TEXT,
    banner_url TEXT,
    primary_color VARCHAR(20) DEFAULT '#F97316',
    secondary_color VARCHAR(20) DEFAULT '#FB923C',
    
    -- الموقع (Google Maps)
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    google_maps_link TEXT,
    address TEXT,
    
    -- العرض الحالي
    current_offer_id INTEGER REFERENCES brand_offers(id) ON DELETE SET NULL,
    current_offer_text TEXT,
    offer_valid_until TIMESTAMP,
    
    -- الحالة
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_brands_active ON brands(is_active);
CREATE INDEX IF NOT EXISTS idx_brands_featured ON brands(is_featured);
CREATE INDEX IF NOT EXISTS idx_brands_order ON brands(display_order);

-- ربط المنتجات بالبراندات
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);

-- تحديث جدول brand_offers للربط مع البراندات
ALTER TABLE brand_offers ADD COLUMN IF NOT EXISTS brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE;


-- 2. نظام نقاط الولاء الكامل (Loyalty Points System)
-- ============================================

-- جدول معاملات النقاط
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    points INTEGER NOT NULL,
    transaction_type VARCHAR(20) NOT NULL, -- 'earn', 'redeem', 'expire', 'refund'
    description TEXT,
    balance_before INTEGER DEFAULT 0,
    balance_after INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user ON loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order ON loyalty_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type ON loyalty_transactions(transaction_type);

-- جدول مكافآت النقاط (المنتجات القابلة للشراء بالنقاط)
CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    description TEXT,
    description_ar TEXT,
    image_url TEXT,
    
    -- النقاط المطلوبة
    points_required INTEGER NOT NULL,
    discount_value DECIMAL(10, 2) NOT NULL, -- القيمة بالجنيه
    
    -- الكمية المتاحة
    stock_quantity INTEGER DEFAULT 0,
    max_redemptions_per_user INTEGER DEFAULT 1,
    
    -- الحالة
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_active ON loyalty_rewards(is_active);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_points ON loyalty_rewards(points_required);

-- جدول استخدام المكافآت
CREATE TABLE IF NOT EXISTS loyalty_redemptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_id INTEGER NOT NULL REFERENCES loyalty_rewards(id) ON DELETE CASCADE,
    promo_code VARCHAR(50) UNIQUE NOT NULL,
    points_spent INTEGER NOT NULL,
    discount_value DECIMAL(10, 2) NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_user ON loyalty_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_code ON loyalty_redemptions(promo_code);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_used ON loyalty_redemptions(is_used);


-- 3. نظام الإشعارات (Notifications System)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'order', 'offer', 'reel', 'story', 'system'
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    image_url TEXT,
    link_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    is_sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);


-- 4. نظام المرتجعات (Returns System)
-- ============================================
CREATE TABLE IF NOT EXISTS returns (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    return_code VARCHAR(50) UNIQUE NOT NULL,
    
    -- تفاصيل الإرجاع
    items JSONB NOT NULL, -- قائمة المنتجات المرتجعة
    return_reason TEXT NOT NULL,
    return_notes TEXT,
    
    -- المبالغ
    total_amount DECIMAL(10, 2) NOT NULL,
    refund_amount DECIMAL(10, 2) NOT NULL,
    points_to_deduct INTEGER DEFAULT 0,
    
    -- الحالة
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'completed'
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- تفاصيل الاسترجاع
    refund_method VARCHAR(20), -- 'cash', 'wallet', 'original_payment'
    refund_transaction_id TEXT,
    refunded_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_code ON returns(return_code);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);


-- 5. نظام البلوكات (Blocked Users System)
-- ============================================
CREATE TABLE IF NOT EXISTS blocked_users (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unblocked_at TIMESTAMP,
    unblocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(user_id, is_active)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_user ON blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_active ON blocked_users(is_active);


-- 6. تحديثات جدول المستخدمين (Customer Analytics)
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS completed_orders INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cancelled_orders INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejected_orders INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_spent DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS average_order_value DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_order_date TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;

-- 7. تحديثات جدول الطلبات
-- ============================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee DECIMAL(10, 2) DEFAULT 7.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10, 2) DEFAULT 15.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0;

-- 8. جدول فواتير التوصيل (Delivery Invoices)
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_invoices (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    invoice_code VARCHAR(50) UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    items JSONB NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    delivery_fee DECIMAL(10, 2) NOT NULL,
    service_fee DECIMAL(10, 2) DEFAULT 7.00,
    discount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    notes TEXT,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    printed_at TIMESTAMP,
    printed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_invoices_order ON delivery_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_invoices_code ON delivery_invoices(invoice_code);

-- 9. تحديثات أقسام الصفحة الرئيسية
-- ============================================
CREATE TABLE IF NOT EXISTS home_sections (
    id SERIAL PRIMARY KEY,
    section_name TEXT NOT NULL,
    section_name_ar TEXT NOT NULL,
    section_type VARCHAR(20) NOT NULL, -- 'banner', 'products', 'categories', 'custom'
    
    -- بيانات البانر
    banner_image TEXT,
    banner_title TEXT,
    banner_subtitle TEXT,
    button_text TEXT,
    button_url TEXT,
    is_clickable BOOLEAN DEFAULT FALSE,
    
    -- الربط
    category_id INTEGER,
    product_ids TEXT[], -- مصفوفة من معرفات المنتجات
    
    -- الحالة والترتيب
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_home_sections_active ON home_sections(is_active);
CREATE INDEX IF NOT EXISTS idx_home_sections_order ON home_sections(display_order);

-- 10. جدول المراجعات/التقييمات (Reviews)
-- ============================================
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT,
    comment TEXT,
    images TEXT[], -- مصفوفة روابط الصور
    
    -- الحالة
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    
    -- التفاعل
    helpful_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(product_id, user_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(is_approved);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating DESC);

-- ============================================
-- إدخال بيانات تجريبية للبراندات
-- ============================================

INSERT INTO brands (id, name_ar, name_en, slogan_ar, slogan_en, rating, logo_url, primary_color, secondary_color, is_featured, display_order) VALUES
('pepsi', 'بيبسي', 'Pepsi', 'طعم لا يُنسى', 'Taste You Can''t Forget', 4.5, 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=200', '#001F5C', '#0056B3', true, 1),
('coca-cola', 'كوكاكولا', 'Coca-Cola', 'افتح السعادة', 'Open Happiness', 4.7, 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=200', '#C41E3A', '#F40009', true, 2),
('juhayna', 'جهينة', 'Juhayna', 'طبيعي 100%', '100% Natural', 4.3, 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=200', '#00A651', '#00843D', true, 3),
('nestle', 'نستله', 'Nestlé', 'جيد للغذاء، جيد للحياة', 'Good Food, Good Life', 4.6, 'https://images.unsplash.com/photo-1563262924-641a8b3d397f?w=200', '#C41E3A', '#8B0000', true, 4),
('galaxy', 'جالاكسي', 'Galaxy', 'شوكولاتة بنكهة الحرير', 'Silk Chocolate', 4.4, 'https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=200', '#8B4513', '#5D3A1A', true, 5),
('lays', 'ليز', 'Lay''s', 'لا تستطيع أن تأكل واحدة فقط', 'Betcha Can''t Eat Just One', 4.2, 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=200', '#FFD700', '#FFA500', false, 6);

-- ============================================
-- إدخال بيانات تجريبية للمكافآت
-- ============================================

INSERT INTO loyalty_rewards (name, name_ar, description_ar, points_required, discount_value, stock_quantity, is_active) VALUES
('خصم 35 جنيه', 'خصم 35 جنيه', 'احصل على خصم 35 جنيه على طلبك القادم', 1000, 35.00, 100, true),
('خصم 75 جنيه', 'خصم 75 جنيه', 'احصل على خصم 75 جنيه على طلبك القادم', 2000, 75.00, 50, true),
('خصم 150 جنيه', 'خصم 150 جنيه', 'احصل على خصم 150 جنيه على طلبك القادم', 4000, 150.00, 25, true),
('توصيل مجاني', 'توصيل مجاني', 'احصل على توصيل مجاني على طلبك القادم', 500, 15.00, 200, true);

-- ============================================
-- تم الانتهاء من جميع التعديلات! ✅
-- ============================================
