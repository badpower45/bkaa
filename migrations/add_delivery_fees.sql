-- إضافة جدول رسوم التوصيل الديناميكية
CREATE TABLE IF NOT EXISTS delivery_fees (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  min_order DECIMAL(10, 2) DEFAULT 0, -- الحد الأدنى للطلب
  base_fee DECIMAL(10, 2) DEFAULT 20, -- رسوم التوصيل الأساسية
  free_delivery_threshold DECIMAL(10, 2), -- الحد الأدنى للتوصيل المجاني (null = لا يوجد)
  per_km_fee DECIMAL(10, 2) DEFAULT 0, -- رسوم إضافية لكل كيلومتر
  max_distance_km DECIMAL(5, 2) DEFAULT 10, -- أقصى مسافة للتوصيل
  peak_hours_multiplier DECIMAL(3, 2) DEFAULT 1.0, -- مضاعف ساعات الذروة
  peak_hours_start TIME, -- بداية ساعات الذروة
  peak_hours_end TIME, -- نهاية ساعات الذروة
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- إضافة index للأداء
CREATE INDEX IF NOT EXISTS idx_delivery_fees_branch ON delivery_fees(branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_fees_active ON delivery_fees(is_active);

-- إضافة بيانات افتراضية
INSERT INTO delivery_fees (branch_id, min_order, base_fee, free_delivery_threshold, per_km_fee, max_distance_km, peak_hours_start, peak_hours_end, peak_hours_multiplier)
SELECT
    id as branch_id,
    50.00 as min_order, -- حد أدنى 50 جنيه
    20.00 as base_fee, -- رسوم توصيل 20 جنيه
    200.00 as free_delivery_threshold, -- توصيل مجاني فوق 200 جنيه
    2.00 as per_km_fee, -- 2 جنيه لكل كم إضافي
    10.00 as max_distance_km, -- أقصى مسافة 10 كم
    '18:00:00' as peak_hours_start, -- ساعات الذروة من 6 مساءً
    '21:00:00' as peak_hours_end, -- إلى 9 مساءً
    1.5 as peak_hours_multiplier -- رسوم إضافية 50% في ساعات الذروة
FROM branches
WHERE id NOT IN (SELECT DISTINCT branch_id FROM delivery_fees WHERE branch_id IS NOT NULL);

-- إضافة حقل minimum_order في جدول branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS minimum_order DECIMAL(10, 2) DEFAULT 50.00;
