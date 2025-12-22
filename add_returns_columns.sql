-- إضافة أعمدة جديدة لجدول returns

-- 1. original_total: التوتال الأصلي للطلب قبل الإرجاع
-- 2. new_total: التوتال الجديد بعد خصم المنتجات المرتجعة

-- التحقق من وجود الجدول
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'returns' AND table_schema = 'public';

-- إضافة الأعمدة إذا لم تكن موجودة
DO $$ 
BEGIN
    -- Add original_total column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'returns' AND column_name = 'original_total'
    ) THEN
        ALTER TABLE returns ADD COLUMN original_total DECIMAL(10, 2);
        COMMENT ON COLUMN returns.original_total IS 'التوتال الأصلي للطلب قبل الإرجاع';
        RAISE NOTICE 'Added column: original_total';
    ELSE
        RAISE NOTICE 'Column original_total already exists';
    END IF;

    -- Add new_total column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'returns' AND column_name = 'new_total'
    ) THEN
        ALTER TABLE returns ADD COLUMN new_total DECIMAL(10, 2);
        COMMENT ON COLUMN returns.new_total IS 'التوتال الجديد بعد خصم المنتجات المرتجعة';
        RAISE NOTICE 'Added column: new_total';
    ELSE
        RAISE NOTICE 'Column new_total already exists';
    END IF;
END $$;

-- تحديث البيانات الموجودة (إذا كانت القيم NULL)
-- نفترض أن total_amount = original_total و refund_amount = الفرق
UPDATE returns 
SET 
    original_total = COALESCE(original_total, total_amount),
    new_total = COALESCE(new_total, total_amount - refund_amount)
WHERE original_total IS NULL OR new_total IS NULL;

-- التحقق من النتائج
SELECT 
    id,
    return_code,
    total_amount,
    original_total,
    new_total,
    refund_amount,
    points_to_deduct,
    status
FROM returns
ORDER BY created_at DESC
LIMIT 10;

-- إحصائيات
SELECT 
    status,
    COUNT(*) as count,
    SUM(refund_amount) as total_refunded,
    SUM(points_to_deduct) as total_points_deducted,
    AVG(refund_amount) as avg_refund
FROM returns
GROUP BY status
ORDER BY count DESC;

-- عرض هيكل الجدول المحدث
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'returns'
ORDER BY ordinal_position;
