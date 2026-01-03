-- =====================================================
-- Create Admin User
-- =====================================================
-- هذا الـ script يقوم بإنشاء حساب أدمن أو تحديث حساب موجود

-- الباسورد: admin123456
-- الـ hash ده لكلمة المرور admin123456 باستخدام bcrypt
-- غير الإيميل والباسورد حسب رغبتك

-- 1. حذف الأدمن القديم إذا كان موجود (اختياري)
-- DELETE FROM users WHERE email = 'admin@allosh.com';

-- 2. إضافة حساب الأدمن
INSERT INTO users (name, email, password, phone, role, loyalty_points, created_at)
VALUES (
    'Admin Allosh',
    'admin@allosh.com',
    '$2a$08$joA4vptfyM3XHNlBLeCA6e2v2QVr1NK1AepnMWXoUgZlXOotOPauK',  -- Password: admin123456
    '01000000000',
    'admin',
    0,
    NOW()
)
ON CONFLICT (email) 
DO UPDATE SET 
    role = 'admin',
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    password = EXCLUDED.password;

-- 3. التحقق من إنشاء الأدمن
SELECT id, name, email, role, created_at 
FROM users 
WHERE email = 'admin@allosh.com';

-- =====================================================
-- ملاحظات مهمة:
-- =====================================================
-- 1. الباسورد المشفر أعلاه هو لكلمة المرور: admin123456
-- 2. لو عايز تغير الباسورد، استخدم الكود ده في Node.js:
--    const bcrypt = require('bcryptjs');
--    const hash = bcrypt.hashSync('your_password', 8);
--    console.log(hash);
-- 3. بعد تسجيل الدخول، غير الباسورد من لوحة التحكم
-- =====================================================
