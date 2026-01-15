-- جدول إطارات المنتجات
CREATE TABLE IF NOT EXISTS product_frames (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    description TEXT,
    frame_url TEXT NOT NULL,
    preview_url TEXT,
    category VARCHAR(50) DEFAULT 'general',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- إضافة أعمدة الإطارات في جدول products إذا لم تكن موجودة
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'frame_overlay_url'
    ) THEN
        ALTER TABLE products ADD COLUMN frame_overlay_url TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'frame_enabled'
    ) THEN
        ALTER TABLE products ADD COLUMN frame_enabled BOOLEAN DEFAULT false;
    END IF;
END $$;

-- إضافة index للأداء
CREATE INDEX IF NOT EXISTS idx_products_frame_enabled 
ON products(frame_enabled) WHERE frame_enabled = true;

-- إدراج إطارات افتراضية للتجربة
INSERT INTO product_frames (name, name_ar, description, frame_url, category, is_active) VALUES
('Gold Border', 'إطار ذهبي', 'إطار ذهبي فاخر للمنتجات المميزة', '/uploads/frames/gold-border.png', 'premium', true),
('Sale Tag', 'علامة تخفيض', 'علامة حمراء للتخفيضات', '/uploads/frames/sale-tag.png', 'sale', true),
('New Badge', 'شارة جديد', 'شارة زرقاء للمنتجات الجديدة', '/uploads/frames/new-badge.png', 'new', true),
('Organic Seal', 'ختم عضوي', 'ختم أخضر للمنتجات العضوية', '/uploads/frames/organic-seal.png', 'organic', true),
('Best Seller', 'الأكثر مبيعاً', 'علامة الأكثر مبيعاً', '/uploads/frames/bestseller.png', 'general', true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE product_frames IS 'إطارات PNG الشفافة للمنتجات';
COMMENT ON COLUMN products.frame_overlay_url IS 'رابط الإطار المطبق على المنتج';
COMMENT ON COLUMN products.frame_enabled IS 'تفعيل/إيقاف عرض الإطار';
