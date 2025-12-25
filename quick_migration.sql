-- Quick migration to add is_offer_only column
-- Run this manually in Supabase SQL Editor if migration script fails

-- Add column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_offer_only BOOLEAN DEFAULT FALSE;

-- Update existing products to ensure they're not offer-only
UPDATE products 
SET is_offer_only = FALSE 
WHERE is_offer_only IS NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_products_offer_only ON products(is_offer_only);

-- Verify
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name = 'is_offer_only';
