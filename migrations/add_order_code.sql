-- Add order_code column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_code VARCHAR(20);

-- Create unique index on order_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_code ON orders(order_code);

-- Generate order codes for existing orders that don't have one
UPDATE orders 
SET order_code = 'ORD-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6))
WHERE order_code IS NULL;

-- Make order_code not null for future inserts (optional - comment out if you want to allow null)
-- ALTER TABLE orders ALTER COLUMN order_code SET NOT NULL;
