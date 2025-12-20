-- Migration: Add Anti-Fraud Fields to Users Table
-- Created: 2025-12-20
-- Purpose: Track and block suspicious customers

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS block_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_by INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP;

-- Add index for blocked users
CREATE INDEX IF NOT EXISTS idx_users_blocked ON users(is_blocked) WHERE is_blocked = TRUE;

-- Add comment
COMMENT ON COLUMN users.is_blocked IS 'Whether the customer is blocked from placing orders';
COMMENT ON COLUMN users.block_reason IS 'Reason why the customer was blocked';
COMMENT ON COLUMN users.blocked_by IS 'Admin user ID who blocked this customer';
COMMENT ON COLUMN users.blocked_at IS 'Timestamp when customer was blocked';
