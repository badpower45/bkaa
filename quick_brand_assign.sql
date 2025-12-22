-- Quick Brand Assignment
-- Simple way to assign first 10 brands to random products for testing

-- Method 1: Assign first available brand to 5 products (for quick testing)
WITH first_brand AS (
    SELECT id FROM brands ORDER BY id LIMIT 1
),
random_products AS (
    SELECT id FROM products WHERE brand_id IS NULL ORDER BY RANDOM() LIMIT 5
)
UPDATE products
SET brand_id = (SELECT id FROM first_brand)
WHERE id IN (SELECT id FROM random_products);

-- Method 2: Distribute brands evenly across products
WITH brand_assignment AS (
    SELECT 
        p.id as product_id,
        b.id as brand_id,
        ROW_NUMBER() OVER (PARTITION BY b.id ORDER BY p.id) as rn
    FROM products p
    CROSS JOIN brands b
    WHERE p.brand_id IS NULL
),
ranked_assignment AS (
    SELECT 
        product_id,
        brand_id,
        ROW_NUMBER() OVER (ORDER BY product_id) as product_rank,
        (SELECT COUNT(*) FROM brands) as brand_count
    FROM (SELECT DISTINCT product_id FROM brand_assignment) p
    CROSS JOIN brands b
)
UPDATE products p
SET brand_id = (
    SELECT b.id
    FROM brands b
    ORDER BY b.id
    LIMIT 1 
    OFFSET ((SELECT COUNT(*) FROM products p2 WHERE p2.id < p.id AND p2.brand_id IS NULL) % (SELECT COUNT(*) FROM brands))
)
WHERE brand_id IS NULL
AND EXISTS (SELECT 1 FROM brands)
LIMIT 20; -- Limit to 20 products for testing

-- Verify
SELECT 
    'Total Products' as metric,
    COUNT(*) as count
FROM products
UNION ALL
SELECT 
    'Products with Brand',
    COUNT(*)
FROM products
WHERE brand_id IS NOT NULL
UNION ALL
SELECT 
    'Products without Brand',
    COUNT(*)
FROM products
WHERE brand_id IS NULL;
