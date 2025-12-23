-- ============================================
-- Migration: Loyalty Points Barcode System
-- Created: 2025-12-23
-- Purpose: One-time use barcodes for loyalty points redemption
-- ============================================

-- ============================================
-- 1. Create loyalty_barcodes table
-- ============================================

CREATE TABLE IF NOT EXISTS loyalty_barcodes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    barcode VARCHAR(50) NOT NULL UNIQUE,
    points_value INTEGER NOT NULL,
    monetary_value DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'used', 'cancelled', 'expired')),
    
    -- Usage tracking
    used_at TIMESTAMP,
    used_by_user_id INTEGER REFERENCES users(id),
    order_id INTEGER REFERENCES orders(id),
    
    -- Expiry
    expires_at TIMESTAMP NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (points_value > 0),
    CHECK (monetary_value > 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_barcodes_user ON loyalty_barcodes(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_barcodes_barcode ON loyalty_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_loyalty_barcodes_status ON loyalty_barcodes(status);
CREATE INDEX IF NOT EXISTS idx_loyalty_barcodes_expires ON loyalty_barcodes(expires_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_barcodes_used_by ON loyalty_barcodes(used_by_user_id);

-- ============================================
-- 2. Add barcode_id to loyalty_transactions
-- ============================================

ALTER TABLE loyalty_transactions
ADD COLUMN IF NOT EXISTS barcode_id INTEGER REFERENCES loyalty_barcodes(id);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_barcode ON loyalty_transactions(barcode_id);

-- ============================================
-- 3. Add order_id to loyalty_transactions (if not exists)
-- ============================================

ALTER TABLE loyalty_transactions
ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order ON loyalty_transactions(order_id);

-- ============================================
-- Verification Queries
-- ============================================

-- Check loyalty_barcodes table
SELECT COUNT(*) as barcodes_table_exists 
FROM information_schema.tables 
WHERE table_name = 'loyalty_barcodes';

-- Check columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'loyalty_barcodes'
ORDER BY ordinal_position;

-- Check indexes
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'loyalty_barcodes';

-- ============================================
-- Sample Data (for testing)
-- ============================================

-- Uncomment to insert test barcode (optional)
-- INSERT INTO loyalty_barcodes (
--     user_id, barcode, points_value, monetary_value, status, expires_at
-- ) VALUES (
--     1, 'LPTEST123456', 100, 100.00, 'active', NOW() + INTERVAL '30 days'
-- );

COMMENT ON TABLE loyalty_barcodes IS 'One-time use barcodes for loyalty points redemption';
COMMENT ON COLUMN loyalty_barcodes.barcode IS 'Unique barcode identifier';
COMMENT ON COLUMN loyalty_barcodes.monetary_value IS 'Monetary value in EGP (1 point = 1 EGP)';
COMMENT ON COLUMN loyalty_barcodes.used_by_user_id IS 'User who used the barcode (can be different from owner)';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Loyalty Barcode System Migration completed successfully!';
    RAISE NOTICE 'Table created: loyalty_barcodes';
    RAISE NOTICE 'Columns added to: loyalty_transactions';
    RAISE NOTICE 'System ready for barcode redemption!';
END $$;
