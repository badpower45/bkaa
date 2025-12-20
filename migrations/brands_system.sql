-- ====================================
-- نظام البراندات الديناميكي
-- Dynamic Brand System Migration
-- ====================================

-- 1. إنشاء جدول البراندات
CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  slogan_ar TEXT,
  slogan_en TEXT,
  logo_url TEXT,
  banner_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#F57C00', -- كود اللون السداسي (Hex Code)
  secondary_color VARCHAR(7) DEFAULT '#FF9800',
  description_ar TEXT,
  description_en TEXT,
  rating DECIMAL(2, 1) DEFAULT 0.0,
  is_featured BOOLEAN DEFAULT FALSE,
  products_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. إضافة عمود brand_id في جدول المنتجات
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id INTEGER;

-- 3. إضافة Foreign Key للربط بين المنتجات والبراندات
ALTER TABLE products ADD CONSTRAINT fk_products_brand 
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;

-- 4. إنشاء Indexes لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_brands_featured ON brands(is_featured);
CREATE INDEX IF NOT EXISTS idx_brands_name_en ON brands(name_en);
CREATE INDEX IF NOT EXISTS idx_brands_name_ar ON brands(name_ar);

-- 5. إنشاء Trigger لتحديث عدد المنتجات في البراند تلقائياً
CREATE OR REPLACE FUNCTION update_brand_products_count()
RETURNS TRIGGER AS $$
BEGIN
  -- تحديث عدد المنتجات للبراند القديم (في حالة التعديل أو الحذف)
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.brand_id IS NOT NULL) THEN
    UPDATE brands 
    SET products_count = (
      SELECT COUNT(*) FROM products WHERE brand_id = OLD.brand_id
    )
    WHERE id = OLD.brand_id;
  END IF;
  
  -- تحديث عدد المنتجات للبراند الجديد (في حالة الإضافة أو التعديل)
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.brand_id IS NOT NULL) THEN
    UPDATE brands 
    SET products_count = (
      SELECT COUNT(*) FROM products WHERE brand_id = NEW.brand_id
    )
    WHERE id = NEW.brand_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_brand_products_count
AFTER INSERT OR UPDATE OR DELETE ON products
FOR EACH ROW
EXECUTE FUNCTION update_brand_products_count();

-- 6. إنشاء Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_brands_updated_at
BEFORE UPDATE ON brands
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 7. إضافة بيانات براندات تجريبية (اختياري)
INSERT INTO brands (name_ar, name_en, slogan_ar, slogan_en, primary_color, secondary_color, is_featured, logo_url, banner_url) VALUES
  ('بيبسي', 'Pepsi', 'عيش اللحظة', 'Live for Now', '#004B93', '#C9002B', true, 
   'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Pepsi_logo_2014.svg/800px-Pepsi_logo_2014.svg.png',
   'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=1200'),
  
  ('كوكاكولا', 'Coca-Cola', 'افتح فرحة', 'Open Happiness', '#F40009', '#FFFFFF', true,
   'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Coca-Cola_logo.svg/800px-Coca-Cola_logo.svg.png',
   'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=1200'),
  
  ('نستله', 'Nestlé', 'طعام جيد، حياة جيدة', 'Good Food, Good Life', '#7B7979', '#FFFFFF', true,
   'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Nestl%C3%A9.svg/800px-Nestl%C3%A9.svg.png',
   'https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=1200'),
  
  ('نسكافيه', 'Nescafé', 'كل شيء يبدأ مع نسكافيه', 'It all starts with a Nescafé', '#D32F2F', '#000000', true,
   'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Nestl%C3%A9.svg/800px-Nestl%C3%A9.svg.png',
   'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200'),
  
  ('شيبسي', 'Chipsy', 'طعم لا يُقاوم', 'Irresistible Taste', '#FF6B00', '#FFD700', false,
   'https://ui-avatars.com/api/?name=Chipsy&size=128&background=FF6B00&color=fff',
   'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=1200'),
  
  ('جهينة', 'Juhayna', 'طبيعي وطازج', 'Natural & Fresh', '#0072CE', '#FFFFFF', true,
   'https://ui-avatars.com/api/?name=Juhayna&size=128&background=0072CE&color=fff',
   'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=1200')
ON CONFLICT DO NOTHING;

-- 8. تحديث المنتجات الموجودة لربطها بالبراندات (اختياري - بناءً على أسماء المنتجات)
-- يمكن تشغيل هذا يدوياً أو تعديله حسب الحاجة
-- UPDATE products SET brand_id = 1 WHERE name ILIKE '%pepsi%' OR name ILIKE '%بيبسي%';
-- UPDATE products SET brand_id = 2 WHERE name ILIKE '%coca%' OR name ILIKE '%كوكا%';
-- UPDATE products SET brand_id = 3 WHERE name ILIKE '%nestle%' OR name ILIKE '%نستله%';
-- UPDATE products SET brand_id = 4 WHERE name ILIKE '%nescafe%' OR name ILIKE '%نسكافيه%';
-- UPDATE products SET brand_id = 5 WHERE name ILIKE '%chipsy%' OR name ILIKE '%شيبسي%';
-- UPDATE products SET brand_id = 6 WHERE name ILIKE '%juhayna%' OR name ILIKE '%جهينة%';

