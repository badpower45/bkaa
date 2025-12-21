-- =====================================================
-- Google Maps Coordinates System - Database Migration
-- =====================================================

-- Add Google Maps Link and Coordinates columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS google_maps_link TEXT;

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_latitude DECIMAL(10, 8);

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_longitude DECIMAL(11, 8);

COMMENT ON COLUMN orders.google_maps_link IS 'رابط جوجل مابس للعنوان (يدخله العميل)';
COMMENT ON COLUMN orders.delivery_latitude IS 'خط العرض المستخرج من رابط جوجل مابس';
COMMENT ON COLUMN orders.delivery_longitude IS 'خط الطول المستخرج من رابط جوجل مابس';

-- Create index for location-based queries
CREATE INDEX IF NOT EXISTS idx_orders_delivery_coordinates 
ON orders(delivery_latitude, delivery_longitude) 
WHERE delivery_latitude IS NOT NULL AND delivery_longitude IS NOT NULL;

-- =====================================================
-- ✅ Migration Complete!
-- =====================================================
