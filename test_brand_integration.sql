-- Test Brand Integration
-- Run these queries to verify brands are working correctly

-- 1. Check how many brands exist
SELECT COUNT(*) as total_brands FROM brands;

-- 2. List all brands
SELECT id, name_ar, name_en FROM brands ORDER BY id;

-- 3. Check products with brands
SELECT 
    p.id,
    p.name,
    p.brand_id,
    b.name_ar as brand_name,
    b.name_en as brand_name_en
FROM products p
LEFT JOIN brands b ON p.brand_id = b.id
WHERE p.brand_id IS NOT NULL
LIMIT 10;

-- 4. Count products by brand
SELECT 
    b.id,
    b.name_ar,
    COUNT(p.id) as product_count
FROM brands b
LEFT JOIN products p ON p.brand_id = b.id
GROUP BY b.id, b.name_ar
ORDER BY product_count DESC;

-- 5. Test the exact query used in GET /products
SELECT DISTINCT ON (p.id) 
    p.id, 
    p.name, 
    p.category, 
    p.brand_id, 
    b.name_ar as brand_name, 
    b.name_en as brand_name_en
FROM products p
LEFT JOIN branch_products bp ON p.id = bp.product_id
LEFT JOIN brands b ON p.brand_id = b.id
WHERE p.brand_id IS NOT NULL
ORDER BY p.id
LIMIT 5;

-- 6. Products without brands
SELECT COUNT(*) as products_without_brand
FROM products
WHERE brand_id IS NULL;

-- 7. Verify no orphaned brand_id (should return 0)
SELECT COUNT(*) as invalid_brand_refs
FROM products p
WHERE p.brand_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM brands b WHERE b.id = p.brand_id
);
