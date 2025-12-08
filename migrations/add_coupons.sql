-- جدول الكوبونات
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL, -- كود الكوبون
  description TEXT, -- وصف الكوبون بالعربي
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')), -- نوع الخصم: نسبة مئوية أو مبلغ ثابت
  discount_value DECIMAL(10, 2) NOT NULL, -- قيمة الخصم (نسبة أو مبلغ)
  min_order_value DECIMAL(10, 2) DEFAULT 0, -- الحد الأدنى للطلب لتطبيق الكوبون
  max_discount DECIMAL(10, 2), -- الحد الأقصى للخصم (للنسب المئوية فقط)

  -- إعدادات الاستخدام
  usage_limit INTEGER, -- NULL = لا نهائي، رقم = عدد محدود، 1 = استخدام واحد فقط
  used_count INTEGER DEFAULT 0, -- عدد مرات الاستخدام الفعلي
  per_user_limit INTEGER DEFAULT 1, -- عدد المرات لكل مستخدم (1 = مرة واحدة، NULL = لا نهائي)

  -- صلاحية الكوبون
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- تاريخ بداية الصلاحية
  valid_until TIMESTAMP, -- تاريخ انتهاء الصلاحية (NULL = لا ينتهي)

  -- حالة الكوبون
  is_active BOOLEAN DEFAULT TRUE, -- هل الكوبون نشط

  -- معلومات إضافية
  created_by INTEGER, -- الأدمن الذي أنشأ الكوبون
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- جدول تتبع استخدام الكوبونات
CREATE TABLE IF NOT EXISTS coupon_usage (
  id SERIAL PRIMARY KEY,
  coupon_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  discount_amount DECIMAL(10, 2) NOT NULL, -- المبلغ الفعلي للخصم
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Indexes للأداء
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_valid ON coupons(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon ON coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user ON coupon_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_order ON coupon_usage(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_usage_unique ON coupon_usage(coupon_id, order_id);

-- إضافة عمود الكوبون في جدول الطلبات
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES coupons(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(10, 2) DEFAULT 0;

-- أمثلة على كوبونات افتراضية
INSERT INTO coupons (code, description, discount_type, discount_value, min_order_value, max_discount, usage_limit, per_user_limit, valid_until, is_active)
VALUES
  -- كوبون خصم 10% بدون حد أقصى، استخدام لا نهائي
  ('WELCOME10', 'خصم 10% للعملاء الجدد', 'percentage', 10.00, 100.00, NULL, NULL, 1, NULL, TRUE),

  -- كوبون خصم 50 جنيه، محدود 100 استخدام
  ('SAVE50', 'وفر 50 جنيه على طلبك', 'fixed', 50.00, 200.00, NULL, 100, 1, '2025-12-31 23:59:59', TRUE),

  -- كوبون خصم 15% بحد أقصى 100 جنيه، استخدام واحد فقط
  ('FIRST15', 'خصم 15% على أول طلب', 'percentage', 15.00, 150.00, 100.00, 1, 1, '2025-12-31 23:59:59', TRUE),

  -- كوبون خصم 20 جنيه، لا نهائي
  ('SAVE20', 'خصم 20 جنيه', 'fixed', 20.00, 100.00, NULL, NULL, NULL, NULL, TRUE)
ON CONFLICT (code) DO NOTHING;
