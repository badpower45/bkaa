-- Migration: Add shipping_info column to orders table
-- This column stores customer delivery details including GPS coordinates

-- Add shipping_info column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='shipping_info') THEN
        ALTER TABLE orders ADD COLUMN shipping_info JSONB;
    END IF;
END $$;

-- shipping_info JSON structure example:
-- {
--   "firstName": "أحمد",
--   "lastName": "محمد",
--   "phone": "01xxxxxxxxx",
--   "address": "اسم الشارع، رقم المبنى...",
--   "coordinates": {
--     "lat": 30.12345,
--     "lng": 31.12345
--   }
-- }

-- You can query coordinates like:
-- SELECT id, shipping_info->'coordinates'->>'lat' as lat, shipping_info->'coordinates'->>'lng' as lng FROM orders;

-- Generate Google Maps link:
-- SELECT id, 'https://maps.google.com/?q=' || (shipping_info->'coordinates'->>'lat') || ',' || (shipping_info->'coordinates'->>'lng') as map_link FROM orders WHERE shipping_info->'coordinates' IS NOT NULL;
