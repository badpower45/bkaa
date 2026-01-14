-- ✅ فحص الـ function الحالية في قاعدة البيانات

-- 1. شوف الـ function موجودة ولا لأ
SELECT 
    proname AS function_name,
    pg_get_function_arguments(oid) AS arguments,
    prosrc AS source_code
FROM pg_proc 
WHERE proname = 'publish_draft_product';

-- 2. شوف السطر المهم في الكود (السطر اللي فيه المشكلة)
SELECT 
    CASE 
        WHEN prosrc LIKE '%WHERE id::text = draft_id%' THEN '✅ الـ function مظبوطة - فيها id::text'
        WHEN prosrc LIKE '%WHERE id = draft_id%' THEN '❌ الـ function لسه قديمة - محتاجة تحديث'
        ELSE '❓ مش عارف حالة الـ function'
    END AS status
FROM pg_proc 
WHERE proname = 'publish_draft_product'
LIMIT 1;
