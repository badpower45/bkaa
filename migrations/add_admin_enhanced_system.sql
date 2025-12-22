-- ============================================
-- Migration: Admin Enhanced System
-- نظام الإدارة المحسّن (إشعارات، بانرات، تحليلات)
-- Created: 2025-12-22
-- ============================================

-- ============================================
-- STEP 1: Create New Tables
-- ============================================

-- 1. Push Notifications Table
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
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. CTA Banners Table
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
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. CTA Clicks Tracking
CREATE TABLE IF NOT EXISTS cta_clicks (
    id SERIAL PRIMARY KEY,
    cta_id INTEGER REFERENCES cta_banners(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- STEP 2: Update Existing Tables
-- ============================================

-- Add columns to users table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'fcm_token') THEN
        ALTER TABLE users ADD COLUMN fcm_token VARCHAR(500);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login') THEN
        ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
    END IF;
END $$;

-- Add columns to orders table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'return_id') THEN
        ALTER TABLE orders ADD COLUMN return_id INTEGER;
    END IF;
END $$;

-- Update returns table (add missing columns)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'returns') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'pickup_address') THEN
            ALTER TABLE returns ADD COLUMN pickup_address TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'preferred_date') THEN
            ALTER TABLE returns ADD COLUMN preferred_date TIMESTAMP;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'admin_notes') THEN
            ALTER TABLE returns ADD COLUMN admin_notes TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'created_at') THEN
            ALTER TABLE returns ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'updated_at') THEN
            ALTER TABLE returns ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
    END IF;
END $$;

-- ============================================
-- STEP 3: Create Indexes
-- ============================================

-- Push notifications indexes
CREATE INDEX IF NOT EXISTS idx_push_notifications_created ON push_notifications(created_at DESC);

-- CTA banners indexes
CREATE INDEX IF NOT EXISTS idx_cta_banners_position ON cta_banners(position);
CREATE INDEX IF NOT EXISTS idx_cta_banners_active ON cta_banners(is_active);
CREATE INDEX IF NOT EXISTS idx_cta_banners_dates ON cta_banners(start_date, end_date);

-- CTA clicks indexes
CREATE INDEX IF NOT EXISTS idx_cta_clicks_cta ON cta_clicks(cta_id);
CREATE INDEX IF NOT EXISTS idx_cta_clicks_user ON cta_clicks(user_id);

-- Users indexes (if columns exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'fcm_token') THEN
        CREATE INDEX IF NOT EXISTS idx_users_fcm_token ON users(fcm_token);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login') THEN
        CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);
    END IF;
END $$;

-- Returns indexes (if table and columns exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'returns') THEN
        CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id);
        CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
        CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
        CREATE INDEX IF NOT EXISTS idx_returns_code ON returns(return_code);
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'returns' AND column_name = 'created_at') THEN
            CREATE INDEX IF NOT EXISTS idx_returns_created ON returns(created_at DESC);
        END IF;
    END IF;
END $$;

-- ============================================
-- STEP 4: Insert Sample Data
-- ============================================

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

-- ============================================
-- Migration Completed Successfully! ✅
-- ============================================
