-- =====================================================
-- اللمسات النهائية - تطبيق كامل للـ Migrations
-- تاريخ: 20 ديسمبر 2025
-- =====================================================

BEGIN;

-- =====================================================
-- 1. نظام إحداثيات جوجل مابس
-- =====================================================

-- Add Google Maps Link and Coordinates columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS google_maps_link TEXT;

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_latitude DECIMAL(10, 8);

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_longitude DECIMAL(11, 8);

COMMENT ON COLUMN orders.google_maps_link IS 'رابط جوجل مابس للعنوان (يدخله العميل)';
COMMENT ON COLUMN orders.delivery_latitude IS 'خط العرض المستخرج من رابط جوجل مابس';
COMMENT ON COLUMN orders.delivery_longitude IS 'خط الطول المستخرج من رابط جوجل مابس';

-- Create index for location-based queries
CREATE INDEX IF NOT EXISTS idx_orders_delivery_coordinates 
ON orders(delivery_latitude, delivery_longitude) 
WHERE delivery_latitude IS NOT NULL AND delivery_longitude IS NOT NULL;


-- =====================================================
-- 2. مجلة العروض - Magazine Pages System
-- =====================================================

-- Create magazine_pages table
CREATE TABLE IF NOT EXISTS magazine_pages (
    id SERIAL PRIMARY KEY,
    page_number INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    title VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    display_order INTEGER DEFAULT 0,
    
    -- Optional: Link to specific category/product
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    product_id TEXT,  -- TEXT to match products.id type (no FK constraint)
    
    -- Optional: Call-to-action button
    cta_text VARCHAR(100),
    cta_url TEXT,
    
    UNIQUE(page_number)
);

COMMENT ON TABLE magazine_pages IS 'صفحات مجلة العروض - كل صفحة عبارة عن صورة عرض احترافية';
COMMENT ON COLUMN magazine_pages.page_number IS 'رقم الصفحة في المجلة';
COMMENT ON COLUMN magazine_pages.image_url IS 'رابط صورة الصفحة (يفضل دقة عالية)';
COMMENT ON COLUMN magazine_pages.display_order IS 'ترتيب العرض (أقل رقم يظهر أولاً)';
COMMENT ON COLUMN magazine_pages.cta_text IS 'نص زر الدعوة للعمل (مثل: تسوق الآن)';
COMMENT ON COLUMN magazine_pages.cta_url IS 'رابط زر الدعوة للعمل';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_magazine_pages_active ON magazine_pages(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_magazine_pages_order ON magazine_pages(display_order, page_number);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_magazine_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_magazine_updated_at ON magazine_pages;
CREATE TRIGGER trigger_magazine_updated_at
BEFORE UPDATE ON magazine_pages
FOR EACH ROW
EXECUTE FUNCTION update_magazine_updated_at();

-- Sample Data - Magazine Pages (Replace with actual offer images)
INSERT INTO magazine_pages (page_number, image_url, title, description, display_order, cta_text, cta_url) VALUES
(1, 'https://images.unsplash.com/photo-1534723328310-e82dad3ee43f?w=1200&h=1800&fit=crop', 'عروض الأسبوع', 'خصومات تصل إلى 50% على جميع المنتجات', 1, 'تسوق الآن', '/products'),
(2, 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=1800&fit=crop', 'عروض الخضار والفواكه', 'طازج يومياً بأفضل الأسعار', 2, 'شاهد العروض', '/categories'),
(3, 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=1200&h=1800&fit=crop', 'منتجات الألبان', 'جودة عالية وأسعار منافسة', 3, 'تصفح المنتجات', '/products'),
(4, 'https://images.unsplash.com/photo-1506617420156-8e4536971650?w=1200&h=1800&fit=crop', 'المخبوزات الطازجة', 'كل يوم عروض جديدة', 4, 'اطلب الآن', '/deals'),
(5, 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1200&h=1800&fit=crop', 'وجبات جاهزة', 'اختصر وقتك مع وجباتنا اللذيذة', 5, 'اكتشف المزيد', '/hot-deals'),
(6, 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=1200&h=1800&fit=crop', 'العروض الحصرية', 'عروض محدودة - لا تفوتها!', 6, 'احصل عليها', '/magazine')
ON CONFLICT (page_number) DO NOTHING;

-- View to get active magazine pages
CREATE OR REPLACE VIEW active_magazine_pages AS
SELECT 
    id,
    page_number,
    image_url,
    title,
    description,
    display_order,
    cta_text,
    cta_url,
    category_id,
    product_id
FROM magazine_pages
WHERE is_active = true
ORDER BY display_order ASC, page_number ASC;

COMMENT ON VIEW active_magazine_pages IS 'صفحات المجلة النشطة مرتبة حسب الترتيب';


-- =====================================================
-- Verification Queries
-- =====================================================

-- Check if all columns were added successfully
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'google_maps_link'
    ) THEN
        RAISE NOTICE '✅ Google Maps columns added to orders table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'magazine_pages'
    ) THEN
        RAISE NOTICE '✅ Magazine pages table created';
    END IF;
END $$;

COMMIT;

-- =====================================================
-- ✅ All Migrations Applied Successfully!
-- =====================================================

-- Display summary
SELECT 
    'Orders Table' as entity,
    COUNT(*) FILTER (WHERE column_name IN ('google_maps_link', 'delivery_latitude', 'delivery_longitude')) as new_columns
FROM information_schema.columns
WHERE table_name = 'orders'
UNION ALL
SELECT 
    'Magazine Pages' as entity,
    COUNT(*) as records
FROM magazine_pages;
