-- جداول Pop-ups والبانرات (Popups & Category Banners)

-- جدول popups للإعلانات التي تظهر عند فتح الموقع
CREATE TABLE IF NOT EXISTS popups (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    title_ar VARCHAR(255),
    description TEXT,
    description_ar TEXT,
    image_url TEXT NOT NULL,
    link_url TEXT, -- رابط اختياري عند الضغط على الـ popup
    button_text VARCHAR(100), -- نص الزر (اختياري)
    button_text_ar VARCHAR(100),
    start_date TIMESTAMP, -- تاريخ بداية العرض
    end_date TIMESTAMP, -- تاريخ نهاية العرض
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- ترتيب الأولوية (الأعلى يظهر أولاً)
    show_on_homepage BOOLEAN DEFAULT true, -- يظهر في الصفحة الرئيسية
    show_on_products BOOLEAN DEFAULT false, -- يظهر في صفحة المنتجات
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- جدول category_banners للبانرات الخاصة بكل تصنيف
CREATE TABLE IF NOT EXISTS category_banners (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    category_name VARCHAR(255), -- اسم التصنيف (نسخة احتياطية)
    category_name_ar VARCHAR(255),
    image_url TEXT NOT NULL, -- صورة البانر
    mobile_image_url TEXT, -- صورة مخصصة للموبايل (اختياري)
    link_url TEXT, -- رابط اختياري
    title VARCHAR(255), -- عنوان البانر
    title_ar VARCHAR(255),
    subtitle TEXT, -- نص فرعي
    subtitle_ar TEXT,
    background_color VARCHAR(50) DEFAULT '#f3f4f6', -- لون الخلفية
    text_color VARCHAR(50) DEFAULT '#1f2937', -- لون النص
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- ترتيب عرض البانرات
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes للبحث السريع
CREATE INDEX IF NOT EXISTS idx_popups_active ON popups(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_popups_priority ON popups(priority DESC);
CREATE INDEX IF NOT EXISTS idx_category_banners_category ON category_banners(category_id);
CREATE INDEX IF NOT EXISTS idx_category_banners_active ON category_banners(is_active);

-- Comments
COMMENT ON TABLE popups IS 'الإعلانات المنبثقة التي تظهر عند فتح الموقع';
COMMENT ON TABLE category_banners IS 'البانرات الخاصة بكل تصنيف من تصنيفات المنتجات';
COMMENT ON COLUMN popups.priority IS 'كلما كانت القيمة أعلى، يظهر أولاً';
COMMENT ON COLUMN category_banners.priority IS 'ترتيب عرض البانرات عند وجود أكثر من بانر لنفس التصنيف';
