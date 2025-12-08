-- Favorites Table (المنتجات المفضلة)
CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_product ON favorites(product_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_product ON favorites(user_id, product_id);

-- Stories Table (القصص/الستوريز)
CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    branch_id INTEGER,
    title TEXT NOT NULL,
    media_url TEXT NOT NULL,
    media_type VARCHAR(10) DEFAULT 'image', -- 'image' or 'video'
    duration INTEGER DEFAULT 5, -- Duration in seconds
    link_url TEXT,
    link_text TEXT,
    views_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0, -- Higher priority = shown first
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

-- Index for active stories lookup
CREATE INDEX IF NOT EXISTS idx_stories_active ON stories(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_priority ON stories(priority DESC);
CREATE INDEX IF NOT EXISTS idx_stories_branch ON stories(branch_id);
