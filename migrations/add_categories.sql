-- Categories Table (التصنيفات مع الصور)
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    name_ar VARCHAR(100),
    image TEXT, -- رابط صورة التصنيف
    banner_image TEXT, -- رابط صورة بانر التصنيف
    banner_title TEXT, -- عنوان البانر
    banner_subtitle TEXT, -- نص فرعي للبانر
    banner_type VARCHAR(20) DEFAULT 'display', -- display أو action
    banner_action_url TEXT, -- رابط زر البانر
    banner_button_text TEXT, -- نص زر البانر
    icon VARCHAR(10), -- Emoji icon
    bg_color VARCHAR(50) DEFAULT 'bg-orange-50', -- Tailwind background color class
    description TEXT,
    parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, -- للتصنيفات الفرعية
    display_order INTEGER DEFAULT 0, -- ترتيب العرض
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for categories
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(display_order);

-- Insert default categories from existing products
INSERT INTO categories (name, name_ar, icon, bg_color, display_order)
SELECT DISTINCT 
    category as name,
    category as name_ar,
    CASE 
        WHEN category ILIKE '%cheese%' THEN '🧀'
        WHEN category ILIKE '%milk%' OR category ILIKE '%ألبان%' THEN '🥛'
        WHEN category ILIKE '%drink%' OR category ILIKE '%مشروبات%' THEN '🥤'
        WHEN category ILIKE '%chocolate%' OR category ILIKE '%شوكولا%' THEN '🍫'
        WHEN category ILIKE '%candy%' OR category ILIKE '%حلوى%' THEN '🍬'
        WHEN category ILIKE '%snack%' OR category ILIKE '%سناكس%' THEN '🍟'
        WHEN category ILIKE '%fruit%' OR category ILIKE '%فواكه%' THEN '🍎'
        WHEN category ILIKE '%vegetable%' OR category ILIKE '%خضار%' THEN '🥬'
        WHEN category ILIKE '%meat%' OR category ILIKE '%لحوم%' THEN '🥩'
        WHEN category ILIKE '%bakery%' OR category ILIKE '%مخبوزات%' OR category ILIKE '%بيكري%' THEN '🍞'
        WHEN category ILIKE '%frozen%' OR category ILIKE '%مجمد%' THEN '🧊'
        WHEN category ILIKE '%oil%' OR category ILIKE '%زيوت%' THEN '🫒'
        WHEN category ILIKE '%clean%' OR category ILIKE '%منظفات%' THEN '🧹'
        WHEN category ILIKE '%cosmetic%' OR category ILIKE '%تجميل%' THEN '💄'
        WHEN category ILIKE '%canned%' OR category ILIKE '%معلبات%' THEN '🥫'
        WHEN category ILIKE '%legume%' OR category ILIKE '%بقوليات%' THEN '🫘'
        WHEN category ILIKE '%healthy%' OR category ILIKE '%صحي%' THEN '🥗'
        WHEN category ILIKE '%date%' OR category ILIKE '%تمر%' THEN '🌴'
        ELSE '🛒'
    END as icon,
    CASE (ROW_NUMBER() OVER (ORDER BY category))::int % 10
        WHEN 0 THEN 'bg-orange-50'
        WHEN 1 THEN 'bg-blue-50'
        WHEN 2 THEN 'bg-green-50'
        WHEN 3 THEN 'bg-red-50'
        WHEN 4 THEN 'bg-purple-50'
        WHEN 5 THEN 'bg-yellow-50'
        WHEN 6 THEN 'bg-pink-50'
        WHEN 7 THEN 'bg-indigo-50'
        WHEN 8 THEN 'bg-teal-50'
        ELSE 'bg-gray-50'
    END as bg_color,
    ROW_NUMBER() OVER (ORDER BY category) as display_order
FROM products 
WHERE category IS NOT NULL AND category != ''
ON CONFLICT (name) DO NOTHING;
