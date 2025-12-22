-- ============================================
-- CRITICAL FIX: Returns Table Columns
-- Copy and paste this ENTIRE file in Supabase SQL Editor
-- ============================================

-- Step 1: Add columns if missing (SAFE - won't fail if already exists)
ALTER TABLE returns ADD COLUMN IF NOT EXISTS pickup_address TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS preferred_date TIMESTAMP;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Step 2: Update NULL values for timestamps
UPDATE returns SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE returns SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;

-- Step 3: Create indexes (SAFE - won't fail if already exists)
CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
CREATE INDEX IF NOT EXISTS idx_returns_code ON returns(return_code);
CREATE INDEX IF NOT EXISTS idx_returns_created ON returns(created_at DESC);

-- ============================================
-- DONE! ✅ Now run: 02_add_admin_enhanced_clean.sql
-- ============================================
