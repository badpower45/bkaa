-- 📊 تقرير شامل عن حالة البراندات للمنتجات

-- ============================================
-- 1️⃣ إحصائيات عامة
-- ============================================

-- عدد المنتجات الكلي
SELECT 
    COUNT(*) as total_products,
    COUNT(brand_id) as products_with_brand,
    COUNT(*) - COUNT(brand_id) as products_without_brand,
    ROUND(COUNT(brand_id)::NUMERIC / COUNT(*)::NUMERIC * 100, 2) as percentage_with_brand
FROM products;

-- ============================================
-- 2️⃣ البراندات المتاحة
-- ============================================

SELECT 
    id,
    name_ar,
    name_en,
    products_count,
    CASE 
        WHEN products_count = 0 THEN '🔴 لا يوجد منتجات'
        WHEN products_count < 10 THEN '🟡 منتجات قليلة'
        ELSE '🟢 منتجات كثيرة'
    END as status
FROM brands
ORDER BY products_count DESC, name_ar;

-- ============================================
-- 3️⃣ المنتجات بدون براند (أول 100)
-- ============================================

SELECT 
    p.id,
    p.name,
    p.category,
    p.subcategory,
    bp.price,
    bp.stock_quantity
FROM products p
LEFT JOIN branch_products bp ON p.id = bp.product_id
WHERE p.brand_id IS NULL
ORDER BY p.name
LIMIT 100;

-- ============================================
-- 4️⃣ اقتراحات لتعيين براندات تلقائياً
-- ============================================

-- منتجات تحتوي على كلمات براندات في أسمائها
SELECT 
    p.id,
    p.name,
    b.id as suggested_brand_id,
    b.name_ar as suggested_brand_name,
    'يحتوي على: ' || b.name_ar as reason
FROM products p
CROSS JOIN brands b
WHERE p.brand_id IS NULL
  AND (
    p.name ILIKE '%' || b.name_ar || '%'
    OR p.name ILIKE '%' || b.name_en || '%'
  )
ORDER BY p.name
LIMIT 50;

-- ============================================
-- 5️⃣ تطبيق الاقتراحات (uncomment لتنفيذ)
-- ============================================

-- تعيين تلقائي للمنتجات التي تحتوي على اسم البراند
/*
UPDATE products p
SET brand_id = b.id
FROM brands b
WHERE p.brand_id IS NULL
  AND (
    p.name ILIKE '%' || b.name_ar || '%'
    OR p.name ILIKE '%' || b.name_en || '%'
  );
*/

-- ============================================
-- 6️⃣ تحديث عداد المنتجات في جدول البراندات
-- ============================================

UPDATE brands b
SET products_count = (
    SELECT COUNT(*) 
    FROM products p 
    WHERE p.brand_id = b.id
),
updated_at = NOW();

-- ============================================
-- 7️⃣ التحقق من النتائج
-- ============================================

SELECT 
    COALESCE(b.name_ar, '⚪️ بدون براند') as brand_name,
    COUNT(p.id) as products_count,
    ROUND(AVG(bp.price), 2) as avg_price,
    SUM(bp.stock_quantity) as total_stock
FROM products p
LEFT JOIN brands b ON p.brand_id = b.id
LEFT JOIN branch_products bp ON p.id = bp.product_id
GROUP BY b.name_ar
ORDER BY products_count DESC;
