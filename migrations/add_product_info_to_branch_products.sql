-- Add product information columns to branch_products table
-- This allows storing product info directly without needing JOIN with products table

ALTER TABLE branch_products 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS subcategory TEXT,
ADD COLUMN IF NOT EXISTS image TEXT;

-- Update existing rows with data from products table (if products table exists)
-- UPDATE branch_products bp
-- SET 
--     name = p.name,
--     category = p.category,
--     subcategory = p.subcategory,
--     image = p.image
-- FROM products p
-- WHERE bp.product_id = p.id;
