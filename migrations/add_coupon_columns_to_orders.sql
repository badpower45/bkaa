-- إضافة أعمدة الكوبون لجدول orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(10, 2) DEFAULT 0;

-- تحديث القيم القديمة
UPDATE orders SET coupon_discount = 0 WHERE coupon_discount IS NULL;
