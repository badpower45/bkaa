-- ============================================
-- Quick Fix Migration - Database Column Fixes
-- Created: 2025-12-22
-- Purpose: Fix missing columns for immediate deployment
-- ============================================

-- ============================================
-- 1. Fix notifications table (if exists)
-- ============================================

-- Check if notifications table exists
DO $$ 
BEGIN
    -- Add data column if not exists (replacing message/metadata)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        -- Check if 'data' column exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'notifications' AND column_name = 'data') THEN
            ALTER TABLE notifications ADD COLUMN data JSONB;
            COMMENT ON COLUMN notifications.data IS 'Notification data payload';
        END IF;
    END IF;
END $$;

-- ============================================
-- 2. Ensure product_reviews table exists
-- ============================================

CREATE TABLE IF NOT EXISTS product_reviews (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    helpful_count INTEGER DEFAULT 0,
    is_approved BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one review per user per product
    UNIQUE(user_id, product_id)
);

-- Create indexes for reviews (if not exists)
CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON product_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON product_reviews(is_approved);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON product_reviews(created_at DESC);

-- ============================================
-- 3. Ensure review_helpful table exists
-- ============================================

CREATE TABLE IF NOT EXISTS review_helpful (
    id SERIAL PRIMARY KEY,
    review_id INTEGER NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one helpful mark per user per review
    UNIQUE(review_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_helpful_review ON review_helpful(review_id);

-- ============================================
-- 4. Add order cancellation fields
-- ============================================

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;

-- ============================================
-- 5. Add user suspension fields
-- ============================================

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS suspicious_activity BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS suspension_warning_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_warning_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS block_reason TEXT,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS blocked_by INTEGER REFERENCES users(id);

-- Create index for blocked users
CREATE INDEX IF NOT EXISTS idx_users_blocked ON users(is_blocked) WHERE is_blocked = true;

-- ============================================
-- 6. Add product rating fields
-- ============================================

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS reviews_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_rating ON products(rating DESC);

-- ============================================
-- 7. Add reserved_quantity to branch_products
-- ============================================

ALTER TABLE branch_products 
ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER DEFAULT 0;

-- Update existing products to set reserved to 0
UPDATE branch_products SET reserved_quantity = 0 WHERE reserved_quantity IS NULL;

-- ============================================
-- Verification Queries
-- ============================================

-- Check notifications table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'notifications' 
  AND column_name = 'data';

-- Check product_reviews table
SELECT COUNT(*) as reviews_table_exists FROM information_schema.tables 
WHERE table_name = 'product_reviews';

-- Check orders columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN ('cancellation_reason', 'cancelled_at');

-- Check users suspension fields
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('is_blocked', 'suspension_warning_count', 'blocked_by');

-- Check products rating fields
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name IN ('rating', 'reviews_count');

-- ============================================
-- Success Message
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '✅ Quick Fix Migration completed successfully!';
    RAISE NOTICE 'Tables created: product_reviews, review_helpful';
    RAISE NOTICE 'Columns added to: orders, users, products, branch_products, notifications';
END $$;
