-- Fix Brand Products Count Issue
-- Option 1: Add the missing column to brands table
ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS products_count INTEGER DEFAULT 0;

-- Option 2: Update all existing brands with correct count
UPDATE brands b
SET products_count = (
    SELECT COUNT(*) 
    FROM products p 
    WHERE p.brand_id = b.id
);

-- Now you can run your brand assignment queries safely!
