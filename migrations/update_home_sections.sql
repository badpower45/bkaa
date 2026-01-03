-- =====================================================
-- تحديث Home Sections بناءً على الفئات الفعلية المتاحة
-- =====================================================
-- 🎯 هذا السكريبت سيحذف جميع الـ sections القديمة ويضيف sections جديدة
--    مربوطة بالفئات اللي فعلاً عندها منتجات متاحة

-- 1️⃣ حذف جميع الـ sections القديمة
DELETE FROM home_sections;

-- 2️⃣ إضافة sections جديدة بناءً على الفئات المتاحة

-- مشروبات (13 منتج)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Beverages',
    'مشروبات',
    'https://images.unsplash.com/photo-1437418747212-8d9709afab22?w=1200&h=400&fit=crop',
    'مشروبات',
    1,
    8,
    true
);

-- حلويات (11 منتج)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Sweets',
    'حلويات',
    'https://images.unsplash.com/photo-1514517521153-1be72277b32f?w=1200&h=400&fit=crop',
    'حلويات',
    2,
    8,
    true
);

-- مجمدات (10 منتجات)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Frozen Foods',
    'مجمدات',
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&h=400&fit=crop',
    'مجمدات',
    3,
    8,
    true
);

-- ألبان (9 منتجات)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Dairy',
    'ألبان',
    'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=1200&h=400&fit=crop',
    'ألبان',
    4,
    8,
    true
);

-- جبن (8 منتجات)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Cheese',
    'جبن',
    'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=1200&h=400&fit=crop',
    'جبن',
    5,
    8,
    true
);

-- تجميل (8 منتجات)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Beauty & Care',
    'تجميل',
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&h=400&fit=crop',
    'تجميل',
    6,
    8,
    true
);

-- كاندي (7 منتجات)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Candy',
    'كاندي',
    'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=1200&h=400&fit=crop',
    'كاندي',
    7,
    8,
    true
);

-- منتجات صحية (6 منتجات)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Healthy Products',
    'صحي',
    'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200&h=400&fit=crop',
    'صحي',
    8,
    8,
    true
);

-- سناكس (4 منتجات)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Snacks',
    'سناكس',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=400&fit=crop',
    'سناكس',
    9,
    8,
    true
);

-- شيكولاتة (4 منتجات)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Chocolate',
    'شيكولاتة',
    'https://images.unsplash.com/photo-1511381939415-e44015466834?w=1200&h=400&fit=crop',
    'شيكولاتة',
    10,
    8,
    true
);

-- بسكويتات (4 منتجات)
INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
VALUES (
    'Biscuits',
    'بسكويتات',
    'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=1200&h=400&fit=crop',
    'بسكويتات',
    11,
    8,
    true
);

-- 3️⃣ التحقق من النتيجة
SELECT 
    id, 
    section_name, 
    section_name_ar, 
    category, 
    display_order,
    max_products,
    is_active,
    (
        SELECT COUNT(DISTINCT p.id) 
        FROM products p 
        INNER JOIN branch_products bp ON p.id = bp.product_id
        WHERE bp.is_available = true 
        AND bp.branch_id = 1
        AND (p.category = home_sections.category OR p.category LIKE '%' || home_sections.category || '%')
        AND (p.is_offer_only = FALSE OR p.is_offer_only IS NULL)
    ) as products_count
FROM home_sections 
WHERE is_active = true
ORDER BY display_order;

-- =====================================================
-- ملاحظات:
-- =====================================================
-- ✅ تم إضافة 11 قسم رئيسي من الأقسام اللي عندها منتجات فعلية
-- ✅ كل section مربوط بـ category موجود في المنتجات
-- ✅ تم ترتيب الأقسام حسب عدد المنتجات (الأكثر منتجات أولاً)
-- ✅ كل section يعرض حتى 8 منتجات
-- 
-- 📝 لو عايز تضيف أو تعدل section:
-- INSERT INTO home_sections (section_name, section_name_ar, banner_image, category, display_order, max_products, is_active)
-- VALUES ('Section Name', 'اسم القسم', 'image_url', 'category_name', 12, 8, true);
-- =====================================================
