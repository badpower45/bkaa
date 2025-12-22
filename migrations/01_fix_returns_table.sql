-- ============================================
-- SUPER SIMPLE FIX - No Tricks, Just Works
-- Copy ALL of this to Supabase SQL Editor and Run
-- ============================================

-- Drop any problematic indexes first
DROP INDEX IF EXISTS idx_returns_created;
DROP INDEX IF EXISTS idx_returns_user;
DROP INDEX IF EXISTS idx_returns_order;
DROP INDEX IF EXISTS idx_returns_status;
DROP INDEX IF EXISTS idx_returns_code;

-- Add columns (these will NOT fail even if columns exist)
ALTER TABLE returns ADD COLUMN IF NOT EXISTS pickup_address TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS preferred_date TIMESTAMP;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Fill NULL values
UPDATE returns SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE returns SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;

-- NOW create indexes (after columns exist)
CREATE INDEX idx_returns_user ON returns(user_id);
CREATE INDEX idx_returns_order ON returns(order_id);
CREATE INDEX idx_returns_status ON returns(status);
CREATE INDEX idx_returns_code ON returns(return_code);
CREATE INDEX idx_returns_created ON returns(created_at DESC);

-- ============================================
-- DONE! ✅
-- ============================================
