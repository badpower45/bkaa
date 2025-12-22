-- ============================================
-- FINAL SIMPLE MIGRATION - No DO Blocks
-- Copy and paste ALL of this in Supabase SQL Editor
-- ============================================

-- PART 1: Fix Returns Table
ALTER TABLE returns ADD COLUMN IF NOT EXISTS pickup_address TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS preferred_date TIMESTAMP;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update NULL timestamps
UPDATE returns SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE returns SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;

-- PART 2: Create New Tables
CREATE TABLE IF NOT EXISTS push_notifications (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    target_users VARCHAR(50),
    user_ids TEXT,
    data TEXT,
    priority VARCHAR(20) DEFAULT 'normal',
    action_url VARCHAR(500),
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cta_banners (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(500),
    button_text VARCHAR(100) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    action_value VARCHAR(500) NOT NULL,
    image_url VARCHAR(500),
    background_color VARCHAR(20) DEFAULT '#F97316',
    text_color VARCHAR(20) DEFAULT '#FFFFFF',
    position VARCHAR(50) DEFAULT 'home_middle',
    priority INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cta_clicks (
    id SERIAL PRIMARY KEY,
    cta_id INTEGER,
    user_id INTEGER,
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PART 3: Update Users and Orders Tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_id INTEGER;

-- PART 4: Create ALL Indexes
CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
CREATE INDEX IF NOT EXISTS idx_returns_code ON returns(return_code);
CREATE INDEX IF NOT EXISTS idx_returns_created ON returns(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_notifications_created ON push_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cta_banners_position ON cta_banners(position);
CREATE INDEX IF NOT EXISTS idx_cta_banners_active ON cta_banners(is_active);
CREATE INDEX IF NOT EXISTS idx_cta_banners_dates ON cta_banners(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_cta_clicks_cta ON cta_clicks(cta_id);
CREATE INDEX IF NOT EXISTS idx_cta_clicks_user ON cta_clicks(user_id);

CREATE INDEX IF NOT EXISTS idx_users_fcm_token ON users(fcm_token);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);

-- PART 5: Insert Sample CTA Banners
INSERT INTO cta_banners (
    title, subtitle, button_text, action_type, action_value, 
    position, priority
) VALUES
(
    'عروض حصرية اليوم! 🎉',
    'خصومات تصل إلى 50% على منتجات مختارة',
    'تسوق الآن',
    'page',
    '/hot-deals',
    'home_top',
    10
),
(
    'انضم لبرنامج الولاء',
    'اربح نقاط مع كل عملية شراء وحولها لأموال',
    'اعرف المزيد',
    'page',
    '/loyalty',
    'home_middle',
    5
),
(
    'شحن مجاني! 🚚',
    'على الطلبات فوق 600 جنيه',
    'ابدأ التسوق',
    'page',
    '/products',
    'cart',
    8
)
ON CONFLICT DO NOTHING;

-- ============================================
-- ALL DONE! Migration Complete ✅
-- ============================================
