-- ============================================
-- 🚚 نظام رسوم التوصيل حسب المحافظة
-- ============================================
-- تاريخ: 2026-01-07
-- الهدف: إضافة رسوم توصيل مختلفة لكل محافظة
-- ============================================

-- 1️⃣ إنشاء جدول رسوم التوصيل حسب المحافظة
CREATE TABLE IF NOT EXISTS governorate_delivery_fees (
    id SERIAL PRIMARY KEY,
    governorate VARCHAR(100) NOT NULL UNIQUE,
    governorate_en VARCHAR(100),
    delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 20.00,
    min_order DECIMAL(10,2) DEFAULT 0,
    free_delivery_threshold DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2️⃣ إضافة index للأداء
CREATE INDEX IF NOT EXISTS idx_governorate_delivery_fees_governorate 
ON governorate_delivery_fees(governorate);

CREATE INDEX IF NOT EXISTS idx_governorate_delivery_fees_active 
ON governorate_delivery_fees(is_active);

-- 3️⃣ إضافة البيانات الأساسية
-- بورسعيد = 25 جنيه
-- بور فؤاد = 30 جنيه
-- باقي المحافظات = 20 جنيه (افتراضي)

INSERT INTO governorate_delivery_fees (governorate, governorate_en, delivery_fee, min_order, free_delivery_threshold) 
VALUES 
    ('بورسعيد', 'Port Said', 25.00, 0, 600.00),
    ('بور فؤاد', 'Port Fouad', 30.00, 0, 600.00)
ON CONFLICT (governorate) DO UPDATE 
SET 
    delivery_fee = EXCLUDED.delivery_fee,
    governorate_en = EXCLUDED.governorate_en,
    updated_at = CURRENT_TIMESTAMP;

-- 4️⃣ إضافة محافظات أخرى (اختياري)
INSERT INTO governorate_delivery_fees (governorate, governorate_en, delivery_fee, min_order, free_delivery_threshold) 
VALUES 
    ('القاهرة', 'Cairo', 20.00, 0, 600.00),
    ('الجيزة', 'Giza', 20.00, 0, 600.00),
    ('الإسكندرية', 'Alexandria', 25.00, 0, 600.00),
    ('الدقهلية', 'Dakahlia', 20.00, 0, 600.00),
    ('المنصورة', 'Mansoura', 20.00, 0, 600.00),
    ('الشرقية', 'Sharqia', 20.00, 0, 600.00),
    ('الغربية', 'Gharbia', 20.00, 0, 600.00),
    ('البحيرة', 'Beheira', 25.00, 0, 600.00),
    ('كفر الشيخ', 'Kafr El Sheikh', 25.00, 0, 600.00),
    ('دمياط', 'Damietta', 25.00, 0, 600.00),
    ('السويس', 'Suez', 30.00, 0, 600.00),
    ('الإسماعيلية', 'Ismailia', 25.00, 0, 600.00)
ON CONFLICT (governorate) DO NOTHING;

-- 5️⃣ Function للحصول على رسوم التوصيل حسب المحافظة
CREATE OR REPLACE FUNCTION get_delivery_fee_by_governorate(
    p_governorate TEXT,
    p_subtotal DECIMAL DEFAULT 0
) RETURNS TABLE(
    delivery_fee DECIMAL,
    free_delivery BOOLEAN,
    min_order DECIMAL,
    message TEXT
) AS $$
DECLARE
    v_gov_fee RECORD;
    v_final_fee DECIMAL;
    v_is_free BOOLEAN;
    v_msg TEXT;
BEGIN
    -- البحث عن رسوم المحافظة
    SELECT 
        gdf.delivery_fee,
        gdf.min_order,
        gdf.free_delivery_threshold
    INTO v_gov_fee
    FROM governorate_delivery_fees gdf
    WHERE gdf.governorate = p_governorate 
       OR gdf.governorate_en = p_governorate
       AND gdf.is_active = TRUE
    LIMIT 1;
    
    -- إذا لم توجد المحافظة، استخدم القيم الافتراضية
    IF NOT FOUND THEN
        v_final_fee := 20.00;
        v_is_free := p_subtotal >= 600;
        v_msg := 'رسوم التوصيل الافتراضية';
    ELSE
        -- التحقق من التوصيل المجاني
        IF v_gov_fee.free_delivery_threshold IS NOT NULL 
           AND p_subtotal >= v_gov_fee.free_delivery_threshold THEN
            v_final_fee := 0;
            v_is_free := TRUE;
            v_msg := format('الشحن مجاني للطلبات فوق %.0f جنيه', v_gov_fee.free_delivery_threshold);
        ELSE
            v_final_fee := v_gov_fee.delivery_fee;
            v_is_free := FALSE;
            v_msg := format('رسوم التوصيل %.0f جنيه', v_final_fee);
        END IF;
    END IF;
    
    RETURN QUERY SELECT 
        v_final_fee,
        v_is_free,
        COALESCE(v_gov_fee.min_order, 0::DECIMAL),
        v_msg;
END;
$$ LANGUAGE plpgsql;

-- 6️⃣ View لعرض رسوم التوصيل لكل المحافظات
CREATE OR REPLACE VIEW governorate_delivery_fees_view AS
SELECT 
    governorate AS المحافظة,
    governorate_en AS "Governorate",
    delivery_fee AS "رسوم التوصيل",
    min_order AS "الحد الأدنى للطلب",
    free_delivery_threshold AS "التوصيل المجاني فوق",
    CASE 
        WHEN is_active THEN 'نشط'
        ELSE 'غير نشط'
    END AS الحالة
FROM governorate_delivery_fees
WHERE is_active = TRUE
ORDER BY delivery_fee ASC, governorate ASC;

-- ============================================
-- 📊 أمثلة استخدام
-- ============================================

-- الحصول على رسوم التوصيل لبورسعيد
-- SELECT * FROM get_delivery_fee_by_governorate('بورسعيد', 500);

-- الحصول على رسوم التوصيل لبور فؤاد
-- SELECT * FROM get_delivery_fee_by_governorate('بور فؤاد', 700);

-- عرض جميع رسوم التوصيل
-- SELECT * FROM governorate_delivery_fees_view;

-- تحديث رسوم محافظة معينة
-- UPDATE governorate_delivery_fees 
-- SET delivery_fee = 35.00 
-- WHERE governorate = 'بور فؤاد';

COMMENT ON TABLE governorate_delivery_fees IS 'رسوم التوصيل حسب المحافظة';
COMMENT ON FUNCTION get_delivery_fee_by_governorate IS 'حساب رسوم التوصيل بناءً على المحافظة وقيمة الطلب';
