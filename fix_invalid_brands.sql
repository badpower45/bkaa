-- Fix Invalid Brand IDs Script
-- Run this SQL directly in your Supabase SQL Editor

-- Step 1: Check products with invalid brand_id
SELECT 
    p.id, 
    p.name, 
    p.brand_id,
    p.category
FROM products p
WHERE p.brand_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM brands b WHERE b.id = p.brand_id
)
ORDER BY p.brand_id;

-- Step 2: View valid brands
SELECT id, name_ar, name_en FROM brands ORDER BY id;

-- Step 3: Clean up invalid brand_id (SET TO NULL)
UPDATE products
SET brand_id = NULL
WHERE brand_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM brands b WHERE b.id = products.brand_id
);

-- Step 4: Verify cleanup
SELECT 
    COUNT(*) as invalid_brand_count
FROM products p
WHERE p.brand_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM brands b WHERE b.id = p.brand_id
);
-- Should return 0

-- Step 5: Summary - Products with brands
SELECT 
    COUNT(*) as total_products,
    COUNT(brand_id) as products_with_brand,
    COUNT(*) - COUNT(brand_id) as products_without_brand
FROM products;
