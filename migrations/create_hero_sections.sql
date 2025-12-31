-- Migration: Create Hero Sections Table
-- Description: Create table for managing hero sections on homepage with images and buttons

-- Create hero_sections table
CREATE TABLE IF NOT EXISTS hero_sections (
    id SERIAL PRIMARY KEY,
    title_en VARCHAR(200),
    title_ar VARCHAR(200),
    subtitle_en TEXT,
    subtitle_ar TEXT,
    description_en TEXT,
    description_ar TEXT,
    
    -- Image management (supports URL or cloud upload)
    image_url TEXT NOT NULL,
    mobile_image_url TEXT, -- Optional separate image for mobile
    image_alt_en VARCHAR(200),
    image_alt_ar VARCHAR(200),
    
    -- Button 1
    button1_text_en VARCHAR(100),
    button1_text_ar VARCHAR(100),
    button1_link VARCHAR(500),
    button1_color VARCHAR(50) DEFAULT '#FF6B6B', -- Hex color code
    button1_enabled BOOLEAN DEFAULT false,
    
    -- Button 2 (optional)
    button2_text_en VARCHAR(100),
    button2_text_ar VARCHAR(100),
    button2_link VARCHAR(500),
    button2_color VARCHAR(50) DEFAULT '#4ECDC4',
    button2_enabled BOOLEAN DEFAULT false,
    
    -- Display settings
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    show_on_mobile BOOLEAN DEFAULT true,
    show_on_desktop BOOLEAN DEFAULT true,
    
    -- Background and styling
    background_color VARCHAR(50) DEFAULT '#FFFFFF',
    text_color VARCHAR(50) DEFAULT '#000000',
    overlay_opacity DECIMAL(3, 2) DEFAULT 0.0, -- 0.0 to 1.0
    
    -- Animation settings
    animation_type VARCHAR(50) DEFAULT 'fade', -- fade, slide, zoom, none
    animation_duration INTEGER DEFAULT 5000, -- milliseconds
    
    -- Tracking
    click_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_hero_sections_active ON hero_sections(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_hero_sections_order ON hero_sections(display_order);

-- Create trigger to update updated_at automatically
CREATE OR REPLACE FUNCTION update_hero_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hero_sections_updated_at_trigger
    BEFORE UPDATE ON hero_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_hero_sections_updated_at();

-- Insert sample hero section
INSERT INTO hero_sections (
    title_en, title_ar,
    subtitle_en, subtitle_ar,
    description_en, description_ar,
    image_url,
    button1_text_en, button1_text_ar, button1_link, button1_enabled,
    button2_text_en, button2_text_ar, button2_link, button2_enabled,
    display_order, is_active
) VALUES (
    'Fresh Organic Products',
    'منتجات طازجة وعضوية',
    'Delivered to Your Doorstep',
    'نوصلها لباب بيتك',
    'Get the freshest organic products with same-day delivery',
    'احصل على أطزج المنتجات العضوية مع التوصيل في نفس اليوم',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200',
    'Shop Now',
    'تسوق الآن',
    '/products',
    true,
    'View Offers',
    'عرض العروض',
    '/offers',
    true,
    1,
    true
);

COMMENT ON TABLE hero_sections IS 'Stores hero banner sections displayed on homepage';
COMMENT ON COLUMN hero_sections.image_url IS 'Main image URL (can be cloudinary link or external URL)';
COMMENT ON COLUMN hero_sections.mobile_image_url IS 'Optional separate image optimized for mobile devices';
COMMENT ON COLUMN hero_sections.button1_link IS 'Internal route (e.g., /products) or external URL';
COMMENT ON COLUMN hero_sections.overlay_opacity IS 'Opacity of dark overlay on image (0.0 = transparent, 1.0 = opaque)';
