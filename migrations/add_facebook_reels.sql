-- Facebook Reels Table (ريلز فيسبوك)
-- هذا الجدول لتخزين روابط الريلز من فيسبوك لعرضها في الموقع

CREATE TABLE IF NOT EXISTS facebook_reels (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    video_url TEXT,
    facebook_url TEXT NOT NULL,
    views_count VARCHAR(50) DEFAULT '0',
    duration VARCHAR(20) DEFAULT '0:30',
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for active reels lookup
CREATE INDEX IF NOT EXISTS idx_facebook_reels_active ON facebook_reels(is_active);
CREATE INDEX IF NOT EXISTS idx_facebook_reels_order ON facebook_reels(display_order);

-- Insert sample data (optional)
INSERT INTO facebook_reels (title, thumbnail_url, facebook_url, views_count, duration, display_order) VALUES
('عروض اليوم على الفواكه الطازجة 🍎', 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?q=80&w=600&auto=format&fit=crop', 'https://www.facebook.com/alloshmarket', '15K', '0:30', 1),
('وصلنا منتجات جديدة 🛒', 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?q=80&w=600&auto=format&fit=crop', 'https://www.facebook.com/alloshmarket', '8.5K', '0:45', 2),
('خصم 50% على منتجات الألبان 🥛', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?q=80&w=600&auto=format&fit=crop', 'https://www.facebook.com/alloshmarket', '22K', '0:20', 3);

-- تعليق: يمكنك تغيير روابط فيسبوك لروابط الريلز الحقيقية من صفحتك
