-- Migration: Admin Enhanced System (Notifications, CTA, Analytics)
-- Created: 2025-12-21

-- Push Notifications Table
CREATE TABLE IF NOT EXISTS push_notifications (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    target_users VARCHAR(50), -- 'all', 'active', 'inactive', 'specific'
    user_ids TEXT, -- JSON array of user IDs if specific
    data TEXT, -- JSON additional data
    priority VARCHAR(20) DEFAULT 'normal', -- 'high', 'normal', 'low'
    action_url VARCHAR(500),
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CTA Banners Table
CREATE TABLE IF NOT EXISTS cta_banners (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(500),
    button_text VARCHAR(100) NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'link', 'product', 'category', 'brand', 'page'
    action_value VARCHAR(500) NOT NULL,
    image_url VARCHAR(500),
    background_color VARCHAR(20) DEFAULT '#F97316',
    text_color VARCHAR(20) DEFAULT '#FFFFFF',
    position VARCHAR(50) DEFAULT 'home_middle', -- 'home_top', 'home_middle', 'home_bottom', 'cart', 'checkout'
    priority INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CTA Clicks Tracking
CREATE TABLE IF NOT EXISTS cta_clicks (
    id SERIAL PRIMARY KEY,
    cta_id INTEGER REFERENCES cta_banners(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Returns Table (create if not exists)
CREATE TABLE IF NOT EXISTS returns (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    return_code VARCHAR(50) UNIQUE NOT NULL,
    items TEXT NOT NULL,
    return_reason TEXT NOT NULL,
    return_notes TEXT,
    total_amount DECIMAL(10, 2) NOT NULL,
    refund_amount DECIMAL(10, 2) NOT NULL,
    points_to_deduct INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    pickup_address TEXT,
    preferred_date TIMESTAMP,
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add FCM token column to users for push notifications (only if users table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'fcm_token') THEN
            ALTER TABLE users ADD COLUMN fcm_token VARCHAR(500);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login') THEN
            ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
        END IF;
    END IF;
END $$;

-- Add return_id to orders (only if orders table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'return_id') THEN
            ALTER TABLE orders ADD COLUMN return_id INTEGER;
        END IF;
    END IF;
END $$;

-- Add columns to returns table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'pickup_address') THEN
        ALTER TABLE returns ADD COLUMN pickup_address TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'preferred_date') THEN
        ALTER TABLE returns ADD COLUMN preferred_date TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'admin_notes') THEN
        ALTER TABLE returns ADD COLUMN admin_notes TEXT;
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_push_notifications_created ON push_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cta_banners_position ON cta_banners(position);
CREATE INDEX IF NOT EXISTS idx_cta_banners_active ON cta_banners(is_active);
CREATE INDEX IF NOT EXISTS idx_cta_banners_dates ON cta_banners(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_cta_clicks_cta ON cta_clicks(cta_id);
CREATE INDEX IF NOT EXISTS idx_cta_clicks_user ON cta_clicks(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
CREATE INDEX IF NOT EXISTS idx_returns_code ON returns(return_code);

-- Indexes for users table (only if columns exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'fcm_token') THEN
        CREATE INDEX IF NOT EXISTS idx_users_fcm_token ON users(fcm_token);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login') THEN
        CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);
    END IF;
END $$;

-- Sample Data (only insert if user id=1 exists, otherwise use NULL)
DO $$
BEGIN
    INSERT INTO cta_banners (
        title, subtitle, button_text, action_type, action_value, 
        position, priority, created_by
    ) VALUES
    (
        'عروض حصرية اليوم! 🎉',
        'خصومات تصل إلى 50% على منتجات مختارة',
        'تسوق الآن',
        'page',
        '/hot-deals',
        'home_top',
        10,
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM users WHERE id = 1) THEN 1 ELSE NULL END)
    ),
    (
        'انضم لبرنامج الولاء',
        'اربح نقاط مع كل عملية شراء وحولها لأموال',
        'اعرف المزيد',
        'page',
        '/loyalty',
        'home_middle',
        5,
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM users WHERE id = 1) THEN 1 ELSE NULL END)
    ),
    (
        'شحن مجاني! 🚚',
        'على الطلبات فوق 600 جنيه',
        'ابدأ التسوق',
        'page',
        '/products',
        'cart',
        8,
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM users WHERE id = 1) THEN 1 ELSE NULL END)
    )
    ON CONFLICT DO NOTHING;
END $$;

-- Comments
COMMENT ON TABLE returns IS 'طلبات المرتجعات من العملاء';
COMMENT ON TABLE push_notifications IS 'سجل الإشعارات المرسلة للعملاء';
COMMENT ON TABLE cta_banners IS 'بانرات الدعوة للعمل (Call-to-Action)';
COMMENT ON TABLE cta_clicks IS 'تتبع نقرات الـ CTA';
COMMENT ON COLUMN users.fcm_token IS 'Firebase Cloud Messaging Token للإشعارات';
COMMENT ON COLUMN users.last_login IS 'آخر تسجيل دخول';
