-- Add sample products with real images for testing
-- This will help fix the banner/image display issue

-- First, let's check and update existing products with placeholder images
UPDATE products 
SET image = 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400'
WHERE image IS NULL OR image = '' OR image LIKE '%placehold%';

-- Add some real product images to existing data
UPDATE products SET image = 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400' WHERE name LIKE '%لبن%' OR name LIKE '%حليب%';
UPDATE products SET image = 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400' WHERE name LIKE '%أرز%' OR name LIKE '%رز%';
UPDATE products SET image = 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400' WHERE name LIKE '%زيت%';
UPDATE products SET image = 'https://images.unsplash.com/photo-1594362388017-64e3043973dd?w=400' WHERE name LIKE '%سكر%';
UPDATE products SET image = 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?w=400' WHERE name LIKE '%شاي%' OR name LIKE '%tea%';
UPDATE products SET image = 'https://images.unsplash.com/photo-1559563458-527698bf5295?w=400' WHERE name LIKE '%عصير%' OR name LIKE '%juice%';
UPDATE products SET image = 'https://images.unsplash.com/photo-1625869016774-3a92be2ae2cd?w=400' WHERE name LIKE '%بسكويت%' OR name LIKE '%شيبسي%';
UPDATE products SET image = 'https://images.unsplash.com/photo-1566454419290-f127fcf82465?w=400' WHERE name LIKE '%معكرونة%' OR name LIKE '%pasta%';
UPDATE products SET image = 'https://images.unsplash.com/photo-1587484436805-000259084a93?w=400' WHERE name LIKE '%صابون%' OR name LIKE '%شامبو%';
UPDATE products SET image = 'https://images.unsplash.com/photo-1584308972272-9e4e7685e80f?w=400' WHERE name LIKE '%جبن%' OR name LIKE '%cheese%';

-- Add default image for remaining products
UPDATE products 
SET image = 'https://images.unsplash.com/photo-1588964895597-cfccd6e2dbf9?w=400'
WHERE image IS NULL OR image = '' OR LENGTH(image) < 10;

-- Update branch_products to ensure all have valid data
UPDATE branch_products 
SET is_available = true 
WHERE stock_quantity > 0;

-- Log the update
INSERT INTO admin_logs (admin_id, action, details, created_at)
SELECT 1, 'UPDATE_PRODUCTS', 'Added default images to all products', NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM admin_logs 
    WHERE action = 'UPDATE_PRODUCTS' 
    AND details = 'Added default images to all products'
    AND created_at > NOW() - INTERVAL '1 hour'
);
