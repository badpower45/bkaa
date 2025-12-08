-- Stories Table for Allosh Market
-- Run this in Supabase SQL Editor

-- Create stories table
CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    media_url TEXT NOT NULL,
    media_type VARCHAR(20) DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
    duration INTEGER DEFAULT 5, -- Duration in seconds
    link_url TEXT,
    link_text VARCHAR(100),
    views_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Higher = shows first
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create story_views table to track who viewed what
CREATE TABLE IF NOT EXISTS story_views (
    id SERIAL PRIMARY KEY,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    viewer_ip VARCHAR(45), -- For anonymous tracking
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(story_id, user_id),
    UNIQUE(story_id, viewer_ip)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_stories_active ON stories(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_branch ON stories(branch_id);
CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views(story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_user ON story_views(user_id);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_stories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS stories_updated_at_trigger ON stories;
CREATE TRIGGER stories_updated_at_trigger
    BEFORE UPDATE ON stories
    FOR EACH ROW
    EXECUTE FUNCTION update_stories_updated_at();

-- Function to increment views
CREATE OR REPLACE FUNCTION increment_story_views(story_id_param INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE stories SET views_count = views_count + 1 WHERE id = story_id_param;
END;
$$ LANGUAGE plpgsql;

-- Insert sample stories for Allosh Market
INSERT INTO stories (title, media_url, media_type, duration, link_url, link_text, expires_at, priority) VALUES
('عروض اليوم الحصرية! 🔥', 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800', 'image', 5, '/deals', 'شاهد العروض', NOW() + INTERVAL '7 days', 10),
('منتجات طازجة يومياً 🥬', 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800', 'image', 5, '/products?category=vegetables', 'تسوق الآن', NOW() + INTERVAL '7 days', 9),
('خصم 50% على الألبان 🥛', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=800', 'image', 5, '/products?category=dairy', 'اشترِ الآن', NOW() + INTERVAL '3 days', 8),
('فواكه موسمية طازجة 🍎', 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=800', 'image', 5, '/products?category=fruits', 'تسوق الفواكه', NOW() + INTERVAL '5 days', 7),
('مشروبات منعشة للصيف 🧊', 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=800', 'image', 5, '/products?category=beverages', 'اكتشف المزيد', NOW() + INTERVAL '7 days', 6);

-- Grant permissions (if using RLS)
-- ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Stories are viewable by everyone" ON stories FOR SELECT USING (is_active = true AND expires_at > NOW());
-- CREATE POLICY "Stories are insertable by admin" ON stories FOR INSERT WITH CHECK (auth.role() = 'admin');

SELECT 'Stories table created successfully!' as message;
