-- Add is_offer_only column to products table
-- This column indicates if a product should only appear in offers (magazine/hot deals)
-- and not in the regular product catalog

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_offer_only BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN products.is_offer_only IS 'If TRUE, product only appears in offers (magazine/hot deals), not in regular catalog';

-- Create index for better performance when filtering
CREATE INDEX IF NOT EXISTS idx_products_offer_only ON products(is_offer_only);
