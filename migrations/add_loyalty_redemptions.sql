-- Migration: Add Loyalty Redemptions Tracking Table
-- Created: 2025-12-20
-- Purpose: Track when users redeem loyalty points for coupons

-- Create loyalty redemptions table
CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  points_redeemed INTEGER NOT NULL,
  coupon_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_user ON loyalty_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_date ON loyalty_redemptions(created_at DESC);

-- Add a comment
COMMENT ON TABLE loyalty_redemptions IS 'Tracks when users redeem loyalty points for discount coupons';
