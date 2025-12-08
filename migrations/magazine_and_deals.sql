-- Magazine Offers Table
-- هذا الجدول لحفظ عروض المجلة الأسبوعية

CREATE TABLE IF NOT EXISTS magazine_offers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    price DECIMAL(10, 2) NOT NULL,
    old_price DECIMAL(10, 2),
    unit VARCHAR(50) DEFAULT 'كجم',
    discount_percentage INTEGER,
    image VARCHAR(500),
    category VARCHAR(100) DEFAULT 'جميع العروض',
    bg_color VARCHAR(100) DEFAULT 'from-orange-500 to-orange-600',
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    start_date TIMESTAMP DEFAULT NOW(),
    end_date TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Hot Deals Table
-- هذا الجدول للعروض الساخنة مع countdown

CREATE TABLE IF NOT EXISTS hot_deals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    price DECIMAL(10, 2) NOT NULL,
    old_price DECIMAL(10, 2) NOT NULL,
    discount_percentage INTEGER NOT NULL,
    image VARCHAR(500),
    sold_percentage INTEGER DEFAULT 0,
    total_quantity INTEGER DEFAULT 100,
    sold_quantity INTEGER DEFAULT 0,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    start_time TIMESTAMP DEFAULT NOW(),
    end_time TIMESTAMP NOT NULL,
    is_flash_deal BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Product Reviews Table
-- هذا الجدول لتقييمات المنتجات

CREATE TABLE IF NOT EXISTS product_reviews (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_verified_purchase BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_magazine_offers_category ON magazine_offers(category);
CREATE INDEX IF NOT EXISTS idx_magazine_offers_active ON magazine_offers(is_active);
CREATE INDEX IF NOT EXISTS idx_magazine_offers_dates ON magazine_offers(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_hot_deals_active ON hot_deals(is_active);
CREATE INDEX IF NOT EXISTS idx_hot_deals_end_time ON hot_deals(end_time);
CREATE INDEX IF NOT EXISTS idx_hot_deals_flash ON hot_deals(is_flash_deal);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_rating ON product_reviews(rating);

-- Insert sample magazine offers
INSERT INTO magazine_offers (name, price, old_price, unit, discount_percentage, image, category, bg_color) VALUES
('ليمون طازج', 99, 114, 'كجم', 13, 'https://images.unsplash.com/photo-1590502593747-42a996133562?w=300&h=300&fit=crop', 'طازج', 'from-pink-500 to-pink-600'),
('طماطم', 27, 35, 'كجم', 24, 'https://images.unsplash.com/photo-1546470427-227a0e3f8e6e?w=300&h=300&fit=crop', 'طازج', 'from-red-500 to-red-600'),
('كوسة', 16, 22, 'كجم', 26, 'https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?w=300&h=300&fit=crop', 'طازج', 'from-green-600 to-green-700'),
('لحم بقري طازج', 449, 529, 'كجم', 15, 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=300&h=300&fit=crop', 'لحوم', 'from-red-600 to-red-700'),
('لحم مفروم', 389, 463, 'كجم', 16, 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=300&h=300&fit=crop', 'لحوم', 'from-red-700 to-red-800'),
('لحم كندوز', 324, 432, 'كجم', 25, 'https://images.unsplash.com/photo-1588347818036-79a20c64ab7b?w=300&h=300&fit=crop', 'لحوم', 'from-pink-600 to-pink-700'),
('حليب طازج', 48, 55, 'لتر', 13, 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300&h=300&fit=crop', 'ألبان', 'from-blue-500 to-blue-600'),
('جبنة بيضاء', 85, 100, 'كجم', 15, 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=300&h=300&fit=crop', 'ألبان', 'from-yellow-500 to-yellow-600')
ON CONFLICT DO NOTHING;

-- Insert sample hot deals
INSERT INTO hot_deals (name, price, old_price, discount_percentage, image, sold_percentage, end_time, is_flash_deal) VALUES
('زيت عباد الشمس', 89.99, 179.99, 50, 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=400&fit=crop', 85, NOW() + INTERVAL '3 hours', true),
('أرز بسمتي هندي - 5 كجم', 120, 180, 33, 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop', 65, NOW() + INTERVAL '24 hours', false),
('سكر أبيض - 2 كجم', 35, 50, 30, 'https://images.unsplash.com/photo-1582005450386-52b25f82d9bb?w=400&h=400&fit=crop', 72, NOW() + INTERVAL '24 hours', false),
('معكرونة إيطالية - عبوة 6', 45, 70, 35, 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=400&fit=crop', 58, NOW() + INTERVAL '24 hours', false),
('زيت زيتون بكر - 1 لتر', 150, 220, 32, 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=400&fit=crop', 45, NOW() + INTERVAL '24 hours', false),
('عسل نحل طبيعي - 500 جم', 85, 130, 35, 'https://images.unsplash.com/photo-1587049352846-4a222e784254?w=400&h=400&fit=crop', 92, NOW() + INTERVAL '24 hours', false)
ON CONFLICT DO NOTHING;
