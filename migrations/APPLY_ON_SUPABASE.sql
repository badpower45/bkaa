-- ============================================
-- تطبيق على Supabase SQL Editor
-- نسخ الكود كامل ولصقه في SQL Editor
-- ============================================

-- 1️⃣ إصلاح صور المنتجات - إضافة صور حقيقية
UPDATE products 
SET image = 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400'
WHERE image IS NULL OR image = '' OR image LIKE '%placehold%' OR image LIKE '%data:image%';

-- تحديث صور حسب نوع المنتج
UPDATE products SET image = 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400' 
WHERE (name LIKE '%لبن%' OR name LIKE '%حليب%' OR name LIKE '%milk%') 
AND (image IS NULL OR image = '' OR image LIKE '%placehold%');

UPDATE products SET image = 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400' 
WHERE (name LIKE '%أرز%' OR name LIKE '%رز%' OR name LIKE '%rice%')
AND (image IS NULL OR image = '' OR image LIKE '%placehold%');

UPDATE products SET image = 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400' 
WHERE name LIKE '%زيت%' OR name LIKE '%oil%'
AND (image IS NULL OR image = '' OR image LIKE '%placehold%');

UPDATE products SET image = 'https://images.unsplash.com/photo-1594362388017-64e3043973dd?w=400' 
WHERE name LIKE '%سكر%' OR name LIKE '%sugar%'
AND (image IS NULL OR image = '' OR image LIKE '%placehold%');

UPDATE products SET image = 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?w=400' 
WHERE (name LIKE '%شاي%' OR name LIKE '%tea%')
AND (image IS NULL OR image = '' OR image LIKE '%placehold%');

UPDATE products SET image = 'https://images.unsplash.com/photo-1559563458-527698bf5295?w=400' 
WHERE (name LIKE '%عصير%' OR name LIKE '%juice%')
AND (image IS NULL OR image = '' OR image LIKE '%placehold%');

UPDATE products SET image = 'https://images.unsplash.com/photo-1625869016774-3a92be2ae2cd?w=400' 
WHERE (name LIKE '%بسكويت%' OR name LIKE '%شيبسي%' OR name LIKE '%snack%')
AND (image IS NULL OR image = '' OR image LIKE '%placehold%');

UPDATE products SET image = 'https://images.unsplash.com/photo-1566454419290-f127fcf82465?w=400' 
WHERE (name LIKE '%معكرونة%' OR name LIKE '%pasta%')
AND (image IS NULL OR image = '' OR image LIKE '%placehold%');

UPDATE products SET image = 'https://images.unsplash.com/photo-1587484436805-000259084a93?w=400' 
WHERE (name LIKE '%صابون%' OR name LIKE '%شامبو%' OR name LIKE '%soap%' OR name LIKE '%shampoo%')
AND (image IS NULL OR image = '' OR image LIKE '%placehold%');

UPDATE products SET image = 'https://images.unsplash.com/photo-1584308972272-9e4e7685e80f?w=400' 
WHERE (name LIKE '%جبن%' OR name LIKE '%cheese%')
AND (image IS NULL OR image = '' OR image LIKE '%placehold%');

-- صورة افتراضية لباقي المنتجات
UPDATE products 
SET image = 'https://images.unsplash.com/photo-1588964895597-cfccd6e2dbf9?w=400'
WHERE image IS NULL OR image = '' OR LENGTH(image) < 10 OR image LIKE '%placehold%';

-- 2️⃣ تحديث حالة المنتجات في الفروع
UPDATE branch_products 
SET is_available = true 
WHERE stock_quantity > 0;

-- 3️⃣ التأكد من وجود أسعار صحيحة
UPDATE branch_products 
SET price = COALESCE(price, 0)
WHERE price IS NULL;

UPDATE branch_products 
SET discount_price = COALESCE(discount_price, price)
WHERE discount_price IS NULL OR discount_price = 0;

-- 4️⃣ إضافة log للتعديلات (اختياري)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_logs') THEN
        INSERT INTO admin_logs (admin_id, action, details, created_at)
        VALUES (1, 'UPDATE_PRODUCTS', 'Fixed product images and availability', NOW())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- ✅ عرض النتيجة للتأكد
SELECT 
    COUNT(*) as total_products,
    COUNT(CASE WHEN image IS NOT NULL AND image != '' THEN 1 END) as products_with_images,
    COUNT(CASE WHEN image LIKE '%unsplash%' THEN 1 END) as products_with_real_images
FROM products;

SELECT 
    COUNT(*) as total_branch_products,
    COUNT(CASE WHEN is_available = true THEN 1 END) as available_products,
    COUNT(CASE WHEN stock_quantity > 0 THEN 1 END) as products_in_stock
FROM branch_products;
