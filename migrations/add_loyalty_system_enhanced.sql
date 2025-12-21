-- Migration: Enhanced Loyalty System with Conversion & Border Fees
-- Created: 2025-12-21

-- Loyalty Points History Table
CREATE TABLE IF NOT EXISTS loyalty_points_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'earned', 'redeemed', 'converted', 'manual_adjustment', 'expired'
    description TEXT,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_history_user ON loyalty_points_history(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_history_order ON loyalty_points_history(order_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_history_type ON loyalty_points_history(type);
CREATE INDEX IF NOT EXISTS idx_loyalty_history_created ON loyalty_points_history(created_at DESC);

-- Add wallet_balance column to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0;

-- Add loyalty_points_earned to orders if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS border_fee DECIMAL(10, 2) DEFAULT 7;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee DECIMAL(10, 2) DEFAULT 0;

-- Insert sample loyalty transactions
INSERT INTO loyalty_points_history (user_id, points, type, description) VALUES
(1, 10, 'earned', 'نقاط ترحيبية - مكافأة التسجيل'),
(1, 5, 'earned', 'ربح 5 نقاط من طلب بقيمة 175 جنيه')
ON CONFLICT DO NOTHING;

-- Comments
COMMENT ON TABLE loyalty_points_history IS 'سجل تاريخ نقاط الولاء للعملاء';
COMMENT ON COLUMN users.wallet_balance IS 'رصيد المحفظة بالجنيه المصري';
COMMENT ON COLUMN users.loyalty_points IS 'نقاط الولاء (كل 35 جنيه = نقطة واحدة)';
COMMENT ON COLUMN orders.border_fee IS 'رسوم الحدية 7 جنيه';
COMMENT ON COLUMN orders.shipping_fee IS 'رسوم الشحن (مجاني فوق 600 جنيه)';
