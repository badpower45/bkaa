-- ============================================
-- FRESH START - Drop and Recreate Everything
-- ============================================

-- STEP 1: Drop All Old Indexes
DROP INDEX IF EXISTS idx_push_notifications_created;
DROP INDEX IF EXISTS idx_cta_banners_position;
DROP INDEX IF EXISTS idx_cta_banners_active;
DROP INDEX IF EXISTS idx_cta_banners_dates;
DROP INDEX IF EXISTS idx_cta_clicks_cta;
DROP INDEX IF EXISTS idx_cta_clicks_user;
DROP INDEX IF EXISTS idx_users_fcm_token;
DROP INDEX IF EXISTS idx_users_last_login;

-- STEP 2: Drop Old Tables (if they exist in bad state)
DROP TABLE IF EXISTS cta_clicks;
DROP TABLE IF EXISTS cta_banners;
DROP TABLE IF EXISTS push_notifications;

-- STEP 3: Create Fresh Tables
CREATE TABLE push_notifications (
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

CREATE TABLE cta_banners (
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

CREATE TABLE cta_clicks (
    id SERIAL PRIMARY KEY,
    cta_id INTEGER,
    user_id INTEGER,
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- STEP 4: Update Users and Orders
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_id INTEGER;

-- STEP 5: Create All Indexes
CREATE INDEX idx_push_notifications_created ON push_notifications(created_at DESC);
CREATE INDEX idx_cta_banners_position ON cta_banners(position);
CREATE INDEX idx_cta_banners_active ON cta_banners(is_active);
CREATE INDEX idx_cta_banners_dates ON cta_banners(start_date, end_date);
CREATE INDEX idx_cta_clicks_cta ON cta_clicks(cta_id);
CREATE INDEX idx_cta_clicks_user ON cta_clicks(user_id);
CREATE INDEX idx_users_fcm_token ON users(fcm_token);
CREATE INDEX idx_users_last_login ON users(last_login DESC);

-- STEP 4: Insert Sample Data
INSERT INTO cta_banners (
    title, subtitle, button_text, action_type, action_value, position, priority
) VALUES
('عروض حصرية اليوم! 🎉', 'خصومات تصل إلى 50% على منتجات مختارة', 'تسوق الآن', 'page', '/hot-deals', 'home_top', 10),
('انضم لبرنامج الولاء', 'اربح نقاط مع كل عملية شراء وحولها لأموال', 'اعرف المزيد', 'page', '/loyalty', 'home_middle', 5),
('شحن مجاني! 🚚', 'على الطلبات فوق 600 جنيه', 'ابدأ التسوق', 'page', '/products', 'cart', 8)
ON CONFLICT DO NOTHING;

-- ============================================
-- ALL D6NE! ✅
-- ============================================
