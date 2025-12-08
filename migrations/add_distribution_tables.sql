-- Migration: Add delivery and distribution tables
-- Run this on existing database to add new tables and columns

-- 1. Delivery Staff Table (موظفي التوصيل)
CREATE TABLE IF NOT EXISTS delivery_staff (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone2 TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  current_orders INTEGER DEFAULT 0,
  max_orders INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. Delivery Staff Branches (ربط الديليفري بالفروع)
CREATE TABLE IF NOT EXISTS delivery_staff_branches (
  delivery_staff_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  PRIMARY KEY (delivery_staff_id, branch_id),
  FOREIGN KEY (delivery_staff_id) REFERENCES delivery_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- 3. Order Assignments (تعيين الطلبات)
CREATE TABLE IF NOT EXISTS order_assignments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE,
  delivery_staff_id INTEGER,
  distributor_id INTEGER,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  picked_up_at TIMESTAMP,
  delivered_at TIMESTAMP,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (delivery_staff_id) REFERENCES delivery_staff(id),
  FOREIGN KEY (distributor_id) REFERENCES users(id)
);

-- 4. Order Preparation Items (قائمة التحضير)
CREATE TABLE IF NOT EXISTS order_preparation_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  is_prepared BOOLEAN DEFAULT FALSE,
  prepared_at TIMESTAMP,
  prepared_by INTEGER,
  notes TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (prepared_by) REFERENCES users(id)
);

-- 5. Add columns to branches table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='phone') THEN
        ALTER TABLE branches ADD COLUMN phone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='phone2') THEN
        ALTER TABLE branches ADD COLUMN phone2 TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='maps_link') THEN
        ALTER TABLE branches ADD COLUMN maps_link TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='address') THEN
        ALTER TABLE branches ADD COLUMN address TEXT;
    END IF;
END $$;

-- 6. Add assigned_branch_id to users table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='assigned_branch_id') THEN
        ALTER TABLE users ADD COLUMN assigned_branch_id INTEGER;
    END IF;
END $$;

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_delivery_staff_available ON delivery_staff(is_available);
CREATE INDEX IF NOT EXISTS idx_order_assignments_status ON order_assignments(status);
CREATE INDEX IF NOT EXISTS idx_order_assignments_order ON order_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_prep_items_order ON order_preparation_items(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_staff_branches_staff ON delivery_staff_branches(delivery_staff_id);
CREATE INDEX IF NOT EXISTS idx_delivery_staff_branches_branch ON delivery_staff_branches(branch_id);
