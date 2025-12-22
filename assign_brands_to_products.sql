-- Assign Brands to Products
-- This will link some products to existing brands based on their names/categories

-- First, let's see what brands we have
SELECT id, name_ar, name_en FROM brands ORDER BY id;

-- Example: Assign Pepsi products to Pepsi brand (assuming brand exists)
UPDATE products
SET brand_id = (SELECT id FROM brands WHERE name_en ILIKE '%Pepsi%' LIMIT 1)
WHERE (name ILIKE '%pepsi%' OR name ILIKE '%بيبسي%')
AND brand_id IS NULL
AND EXISTS (SELECT 1 FROM brands WHERE name_en ILIKE '%Pepsi%');

-- Example: Assign Coca-Cola products to Coca-Cola brand
UPDATE products
SET brand_id = (SELECT id FROM brands WHERE name_en ILIKE '%Coca%' LIMIT 1)
WHERE (name ILIKE '%coca%' OR name ILIKE '%كوكا%')
AND brand_id IS NULL
AND EXISTS (SELECT 1 FROM brands WHERE name_en ILIKE '%Coca%');

-- Example: Assign Chipsy products to Chipsy brand
UPDATE products
SET brand_id = (SELECT id FROM brands WHERE name_en ILIKE '%Chipsy%' OR name_ar ILIKE '%شيبسي%' LIMIT 1)
WHERE (name ILIKE '%chipsy%' OR name ILIKE '%شيبسي%')
AND brand_id IS NULL
AND EXISTS (SELECT 1 FROM brands WHERE name_en ILIKE '%Chipsy%' OR name_ar ILIKE '%شيبسي%');

-- Example: Assign Juhayna products to Juhayna brand
UPDATE products
SET brand_id = (SELECT id FROM brands WHERE name_en ILIKE '%Juhayna%' OR name_ar ILIKE '%جهينة%' LIMIT 1)
WHERE (name ILIKE '%juhayna%' OR name ILIKE '%جهينة%')
AND brand_id IS NULL
AND EXISTS (SELECT 1 FROM brands WHERE name_en ILIKE '%Juhayna%' OR name_ar ILIKE '%جهينة%');

-- Example: Assign Nestlé products to Nestlé brand
UPDATE products
SET brand_id = (SELECT id FROM brands WHERE name_en ILIKE '%Nestle%' OR name_ar ILIKE '%نستله%' LIMIT 1)
WHERE (name ILIKE '%nestle%' OR name ILIKE '%نستله%')
AND brand_id IS NULL
AND EXISTS (SELECT 1 FROM brands WHERE name_en ILIKE '%Nestle%' OR name_ar ILIKE '%نستله%');

-- Check results
SELECT 
    b.name_ar,
    b.name_en,
    COUNT(p.id) as product_count
FROM brands b
LEFT JOIN products p ON p.brand_id = b.id
GROUP BY b.id, b.name_ar, b.name_en
ORDER BY product_count DESC;

-- Show some products with their brands
SELECT 
    p.id,
    p.name,
    p.brand_id,
    b.name_ar as brand_name
FROM products p
LEFT JOIN brands b ON p.brand_id = b.id
WHERE p.brand_id IS NOT NULL
LIMIT 20;
