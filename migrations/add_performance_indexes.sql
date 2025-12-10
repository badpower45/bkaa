-- إضافة Indexes لتسريع الاستعلامات
-- Performance Optimization Indexes

-- Orders table indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_branch_status ON orders(branch_id, status);

-- Order assignments indexes
CREATE INDEX IF NOT EXISTS idx_order_assignments_order_id ON order_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_assignments_delivery_staff_id ON order_assignments(delivery_staff_id);
CREATE INDEX IF NOT EXISTS idx_order_assignments_status ON order_assignments(status);
CREATE INDEX IF NOT EXISTS idx_order_assignments_staff_status ON order_assignments(delivery_staff_id, status);

-- Delivery staff indexes
CREATE INDEX IF NOT EXISTS idx_delivery_staff_user_id ON delivery_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_staff_is_available ON delivery_staff(is_available);

-- Delivery staff branches indexes
CREATE INDEX IF NOT EXISTS idx_delivery_staff_branches_staff_id ON delivery_staff_branches(delivery_staff_id);
CREATE INDEX IF NOT EXISTS idx_delivery_staff_branches_branch_id ON delivery_staff_branches(branch_id);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- Branch products indexes
CREATE INDEX IF NOT EXISTS idx_branch_products_branch_id ON branch_products(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_products_product_id ON branch_products(product_id);
CREATE INDEX IF NOT EXISTS idx_branch_products_is_available ON branch_products(is_available);

-- Cart indexes
CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id);

-- Favorites indexes
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- Stories indexes
CREATE INDEX IF NOT EXISTS idx_stories_is_active ON stories(is_active);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories(expires_at);

ANALYZE;
