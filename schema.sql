-- Enable UUID extension if we want to use UUIDs, but we'll stick to SERIAL/INTEGER for consistency with existing app unless specified otherwise.
-- However, products use TEXT ids in the current sqlite setup (e.g. '1', '2'). We will keep that for products.

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'customer',
  default_branch_id INTEGER,
  loyalty_points INTEGER DEFAULT 0
);

-- 2. Branches Table
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  coverage_radius_km DECIMAL(5, 2) DEFAULT 5.0,
  is_active BOOLEAN DEFAULT TRUE
);

-- 3. Products Table (Refactored: No price/stock here)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, -- Keeping TEXT to match existing IDs like '1', '2' or UUIDs
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  subcategory TEXT, -- New: Sub-category for better organization
  rating DECIMAL(3, 2) DEFAULT 0,
  reviews INTEGER DEFAULT 0,
  image TEXT,
  is_organic BOOLEAN DEFAULT FALSE,
  is_weighted BOOLEAN DEFAULT FALSE,
  weight TEXT,
  is_new BOOLEAN DEFAULT FALSE,
  barcode TEXT UNIQUE
);

-- 4. Branch Products (Inventory & Pricing)
CREATE TABLE IF NOT EXISTS branch_products (
  branch_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL, -- السعر بعد (السعر الحالي)
  discount_price DECIMAL(10, 2), -- السعر قبل (السعر الأصلي قبل الخصم)
  stock_quantity INTEGER DEFAULT 0, -- عدد القطع المتوفرة
  reserved_quantity INTEGER DEFAULT 0, -- الكمية المحجوزة للطلبات الجارية
  expiry_date DATE, -- تاريخ الصلاحية
  is_available BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (branch_id, product_id),
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 5. Cart Table
CREATE TABLE IF NOT EXISTS cart (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  product_id TEXT,
  quantity INTEGER DEFAULT 1,
  substitution_preference VARCHAR(50) DEFAULT 'call_me',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 6. Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  branch_id INTEGER, -- Track which branch fulfilled the order
  total DECIMAL(10, 2),
  items JSONB, -- Storing items as JSONB is more efficient in PG than TEXT
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending',
  delivery_slot_id INTEGER,
  payment_method VARCHAR(20) DEFAULT 'cod',
  payment_status VARCHAR(20) DEFAULT 'pending',
  payment_transaction_id TEXT,
  shipping_info JSONB, -- Stores name, phone, address, GPS coordinates
  coupon_id INTEGER, -- الكوبون المستخدم
  coupon_code VARCHAR(50), -- كود الكوبون
  coupon_discount DECIMAL(10, 2) DEFAULT 0, -- قيمة الخصم
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- 7. Conversations (Live Chat)
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER,
  customer_name TEXT,
  agent_id INTEGER,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (agent_id) REFERENCES users(id)
);

-- 8. Messages (Live Chat)
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER,
  sender_id INTEGER,
  sender_type TEXT,
  message TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_read BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

-- 9. Delivery Slots Table
CREATE TABLE IF NOT EXISTS delivery_slots (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_orders INTEGER DEFAULT 20,
  current_orders INTEGER DEFAULT 0,
  delivery_fee DECIMAL(10, 2) DEFAULT 15.00,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(branch_id, date, start_time),
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_branch_products_branch ON branch_products(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_products_product ON branch_products(product_id);
CREATE INDEX IF NOT EXISTS idx_branch_products_composite ON branch_products(branch_id, product_id, is_available);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_delivery_slots_date ON delivery_slots(date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date DESC);

-- 10. Delivery Staff (موظفي التوصيل)
CREATE TABLE IF NOT EXISTS delivery_staff (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL, -- ربط بجدول المستخدمين
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone2 TEXT, -- رقم بديل
  is_available BOOLEAN DEFAULT TRUE,
  current_orders INTEGER DEFAULT 0, -- عدد الطلبات الحالية
  max_orders INTEGER DEFAULT 5, -- الحد الأقصى للطلبات
  
  -- إحصائيات الأداء
  total_deliveries INTEGER DEFAULT 0, -- إجمالي التوصيلات
  total_rating_sum DECIMAL(10,2) DEFAULT 0, -- مجموع التقييمات
  total_ratings_count INTEGER DEFAULT 0, -- عدد التقييمات
  average_rating DECIMAL(2,1) DEFAULT 0, -- متوسط التقييم
  average_delivery_time INTEGER DEFAULT 0, -- متوسط وقت التوصيل (بالدقائق)
  on_time_deliveries INTEGER DEFAULT 0, -- التوصيلات في الوقت
  late_deliveries INTEGER DEFAULT 0, -- التوصيلات المتأخرة
  rejected_orders INTEGER DEFAULT 0, -- الطلبات المرفوضة
  expired_orders INTEGER DEFAULT 0, -- الطلبات المنتهية (لم يقبلها)
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 11. Delivery Staff Branches (ربط الديليفري بالفروع)
CREATE TABLE IF NOT EXISTS delivery_staff_branches (
  delivery_staff_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  PRIMARY KEY (delivery_staff_id, branch_id),
  FOREIGN KEY (delivery_staff_id) REFERENCES delivery_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- 12. Order Assignments (تعيين الطلبات لموظفي التوصيل)
CREATE TABLE IF NOT EXISTS order_assignments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  delivery_staff_id INTEGER,
  distributor_id INTEGER, -- موزع الطلبات
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP, -- وقت قبول الديليفري للطلب
  accept_deadline TIMESTAMP, -- الموعد النهائي للقبول (5 دقائق)
  branch_arrived_at TIMESTAMP, -- وقت وصول الديليفري للفرع
  picked_up_at TIMESTAMP, -- وقت استلام الديليفري للطلب
  customer_arrived_at TIMESTAMP, -- وقت الوصول للعميل (انتظار)
  delivered_at TIMESTAMP, -- وقت التوصيل
  rejected_at TIMESTAMP, -- وقت الرفض
  rejection_reason TEXT,
  status TEXT DEFAULT 'pending', -- pending, preparing, ready, assigned, accepted, picked_up, arriving, delivered, rejected, expired
  
  -- إحصائيات الوقت (بالدقائق)
  time_to_branch INTEGER, -- الوقت من القبول للوصول للفرع
  time_to_customer INTEGER, -- الوقت من الفرع للعميل
  total_delivery_time INTEGER, -- إجمالي وقت التوصيل
  
  -- التقييم
  delivery_rating DECIMAL(2,1), -- تقييم التوصيل من العميل (1-5)
  order_rating DECIMAL(2,1), -- تقييم الطلب/المنتجات (1-5)
  speed_rating DECIMAL(2,1), -- تقييم سرعة التوصيل (1-5)
  rating_notes TEXT, -- ملاحظات التقييم
  rated_at TIMESTAMP,
  
  notes TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (delivery_staff_id) REFERENCES delivery_staff(id),
  FOREIGN KEY (distributor_id) REFERENCES users(id)
);

-- 13. Order Preparation Items (عناصر تحضير الطلب - Todo List)
CREATE TABLE IF NOT EXISTS order_preparation_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  is_prepared BOOLEAN DEFAULT FALSE,
  prepared_at TIMESTAMP,
  prepared_by INTEGER, -- موزع الطلبات
  notes TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (prepared_by) REFERENCES users(id)
);

-- Update branches table to add contact info and maps link
ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone2 TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS maps_link TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address TEXT;

-- Update users table to add branch assignment for distributors
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_branch_id INTEGER;

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_delivery_staff_available ON delivery_staff(is_available);
CREATE INDEX IF NOT EXISTS idx_order_assignments_status ON order_assignments(status);
CREATE INDEX IF NOT EXISTS idx_order_assignments_order ON order_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_prep_items_order ON order_preparation_items(order_id);

-- Add new rating columns if they don't exist
ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS order_rating DECIMAL(2,1);
ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS speed_rating DECIMAL(2,1);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
