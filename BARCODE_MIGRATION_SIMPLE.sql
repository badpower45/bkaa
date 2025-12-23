-- Simple SQL to copy/paste into Supabase SQL Editor
-- Run this to create the barcode system tables

-- Create loyalty_barcodes table
CREATE TABLE IF NOT EXISTS loyalty_barcodes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    barcode VARCHAR(50) NOT NULL UNIQUE,
    points_value INTEGER NOT NULL,
    monetary_value DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'used', 'cancelled', 'expired')),
    used_at TIMESTAMP,
    used_by_user_id INTEGER REFERENCES users(id),
    order_id INTEGER REFERENCES orders(id),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (points_value > 0),
    CHECK (monetary_value > 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_barcodes_user ON loyalty_barcodes(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_barcodes_barcode ON loyalty_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_loyalty_barcodes_status ON loyalty_barcodes(status);
CREATE INDEX IF NOT EXISTS idx_loyalty_barcodes_expires ON loyalty_barcodes(expires_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_barcodes_used_by ON loyalty_barcodes(used_by_user_id);

-- Add columns to loyalty_transactions
ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS barcode_id INTEGER REFERENCES loyalty_barcodes(id);
ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_barcode ON loyalty_transactions(barcode_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order ON loyalty_transactions(order_id);

-- Verify
SELECT 'loyalty_barcodes table created!' as status;
