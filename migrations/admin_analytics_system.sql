-- =====================================================
-- Admin & Analytics System - Database Schema Updates
-- =====================================================

-- 1. تحديثات جدول users لتحليلات العملاء
-- =====================================================

-- إضافة عمود customer_rating
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS customer_rating VARCHAR(20) DEFAULT 'new';

COMMENT ON COLUMN users.customer_rating IS 'تقييم العميل: excellent, good, problematic, banned, new';

-- إضافة indexes للأداء
CREATE INDEX IF NOT EXISTS idx_users_customer_rating ON users(customer_rating);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);


-- 2. تحديثات جدول categories للبانرات التفاعلية
-- =====================================================

-- إضافة أعمدة البانر التفاعلي
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS banner_type VARCHAR(20) DEFAULT 'display';

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS banner_action_url TEXT;

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS banner_button_text VARCHAR(100) DEFAULT 'تسوق الآن';

COMMENT ON COLUMN categories.banner_type IS 'نوع البانر: display (عرض فقط) أو action (بانر تفاعلي مع زر)';
COMMENT ON COLUMN categories.banner_action_url IS 'رابط الزر عند الضغط (للبانرات التفاعلية فقط)';
COMMENT ON COLUMN categories.banner_button_text IS 'نص الزر الظاهر في البانر';


-- 3. View لتحليلات العملاء (Customer Analytics)
-- =====================================================

CREATE OR REPLACE VIEW customer_analytics AS
SELECT 
    u.id,
    u.name,
    u.email,
    u.phone,
    u.created_at as registration_date,
    
    -- إحصائيات الطلبات
    COUNT(o.id) as total_orders,
    COUNT(CASE WHEN o.status IN ('cancelled', 'rejected') THEN 1 END) as rejected_orders,
    COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) as completed_orders,
    COUNT(CASE WHEN o.status IN ('pending', 'confirmed', 'preparing', 'out_for_delivery') THEN 1 END) as active_orders,
    
    -- إحصائيات مالية
    COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total ELSE 0 END), 0) as total_spent,
    COALESCE(AVG(CASE WHEN o.status = 'delivered' THEN o.total END), 0) as average_order_value,
    COALESCE(MAX(CASE WHEN o.status = 'delivered' THEN o.total END), 0) as highest_order_value,
    
    -- تواريخ
    MAX(o.created_at) as last_order_date,
    MIN(o.created_at) as first_order_date,
    
    -- تقييم العميل التلقائي
    CASE 
        -- عميل محظور (أكثر من 15 طلب مرفوض أو ملغي)
        WHEN COUNT(CASE WHEN o.status IN ('cancelled', 'rejected') THEN 1 END) > 15 THEN 'banned'
        
        -- عميل مشاغب (أكثر من 8 طلبات مرفوضة)
        WHEN COUNT(CASE WHEN o.status IN ('cancelled', 'rejected') THEN 1 END) > 8 THEN 'problematic'
        
        -- عميل ممتاز (أكثر من 50 طلب مكتمل وأقل من 3% مرفوض)
        WHEN COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) > 50 
             AND (COUNT(CASE WHEN o.status IN ('cancelled', 'rejected') THEN 1 END)::FLOAT / NULLIF(COUNT(o.id), 0) < 0.03)
        THEN 'excellent'
        
        -- عميل جيد (أكثر من 10 طلبات ونسبة رفض أقل من 15%)
        WHEN COUNT(o.id) > 10 
             AND (COUNT(CASE WHEN o.status IN ('cancelled', 'rejected') THEN 1 END)::FLOAT / NULLIF(COUNT(o.id), 0) < 0.15)
        THEN 'good'
        
        -- عميل جديد (أقل من 5 طلبات)
        WHEN COUNT(o.id) < 5 THEN 'new'
        
        -- افتراضي
        ELSE 'good'
    END as customer_rating,
    
    -- نسب مئوية
    ROUND(
        ((COUNT(CASE WHEN o.status IN ('cancelled', 'rejected') THEN 1 END)::FLOAT / NULLIF(COUNT(o.id), 0)) * 100)::NUMERIC,
        2
    ) as rejection_rate,
    
    ROUND(
        ((COUNT(CASE WHEN o.status = 'delivered' THEN 1 END)::FLOAT / NULLIF(COUNT(o.id), 0)) * 100)::NUMERIC,
        2
    ) as completion_rate

FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.role = 'customer' OR u.role IS NULL
GROUP BY u.id, u.name, u.email, u.phone, u.created_at
ORDER BY total_orders DESC;

COMMENT ON VIEW customer_analytics IS 'عرض شامل لتحليلات سلوك العملاء وتصنيفهم التلقائي';


-- 4. Function لتحديث تقييم العميل تلقائياً
-- =====================================================

CREATE OR REPLACE FUNCTION update_customer_rating()
RETURNS TRIGGER AS $$
BEGIN
    -- تحديث تقييم العميل بناءً على أحدث بياناته
    UPDATE users
    SET customer_rating = (
        SELECT customer_rating 
        FROM customer_analytics 
        WHERE customer_analytics.id = NEW.user_id
        LIMIT 1
    )
    WHERE id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_customer_rating() IS 'دالة تحدث تقييم العميل تلقائياً عند تغيير حالة الطلب';


-- 5. Trigger لتحديث التقييم عند تغيير حالة الطلب
-- =====================================================

DROP TRIGGER IF EXISTS trigger_update_customer_rating ON orders;

CREATE TRIGGER trigger_update_customer_rating
AFTER INSERT OR UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION update_customer_rating();

COMMENT ON TRIGGER trigger_update_customer_rating ON orders IS 'يقوم بتحديث تقييم العميل تلقائياً عند إضافة أو تعديل طلب';


-- 6. جدول لتتبع الإشعارات (Push Notifications Log)
-- =====================================================

CREATE TABLE IF NOT EXISTS push_notifications (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT,
    action_url TEXT,
    notification_type VARCHAR(50), -- 'new_reel', 'new_offer', 'new_product', 'order_status', 'new_coupon', 'custom'
    target_segment VARCHAR(50) DEFAULT 'all', -- 'all', 'customers', 'vip', 'specific_users'
    target_user_ids INTEGER[], -- قائمة معرفات المستخدمين المحددين
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_sent INTEGER DEFAULT 0,
    total_opened INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    metadata JSONB -- بيانات إضافية (product_id, reel_id, etc)
);

COMMENT ON TABLE push_notifications IS 'سجل الإشعارات المرسلة للمستخدمين';

CREATE INDEX IF NOT EXISTS idx_push_notifications_sent_at ON push_notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_notifications_type ON push_notifications(notification_type);


-- 7. جدول اشتراكات الإشعارات (Push Subscriptions)
-- =====================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_token TEXT NOT NULL UNIQUE,
    platform VARCHAR(20) NOT NULL, -- 'web', 'ios', 'android'
    is_active BOOLEAN DEFAULT true,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB -- browser, os, app_version, etc
);

COMMENT ON TABLE push_subscriptions IS 'اشتراكات المستخدمين للإشعارات الفورية';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active) WHERE is_active = true;


-- 8. جدول تفاعلات البانرات (Banner Analytics)
-- =====================================================

CREATE TABLE IF NOT EXISTS banner_clicks (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    banner_type VARCHAR(20), -- 'display' or 'action'
    action_url TEXT,
    session_id VARCHAR(255), -- للمستخدمين الضيوف
    user_agent TEXT,
    ip_address INET
);

COMMENT ON TABLE banner_clicks IS 'تتبع نقرات المستخدمين على البانرات التفاعلية';

CREATE INDEX IF NOT EXISTS idx_banner_clicks_category ON banner_clicks(category_id);
CREATE INDEX IF NOT EXISTS idx_banner_clicks_user ON banner_clicks(user_id);
CREATE INDEX IF NOT EXISTS idx_banner_clicks_date ON banner_clicks(clicked_at DESC);


-- 9. View لإحصائيات البانرات
-- =====================================================

CREATE OR REPLACE VIEW banner_analytics AS
SELECT 
    c.id as category_id,
    c.name,
    c.name_ar,
    c.banner_type,
    c.banner_action_url,
    COUNT(bc.id) as total_clicks,
    COUNT(DISTINCT bc.user_id) as unique_users,
    COUNT(DISTINCT bc.session_id) as unique_sessions,
    MIN(bc.clicked_at) as first_click,
    MAX(bc.clicked_at) as last_click,
    ROUND(
        (COUNT(bc.id)::FLOAT / NULLIF(
            EXTRACT(DAYS FROM (MAX(bc.clicked_at) - MIN(bc.clicked_at)))::FLOAT,
            0
        ))::NUMERIC,
        2
    ) as avg_clicks_per_day
FROM categories c
LEFT JOIN banner_clicks bc ON c.id = bc.category_id
WHERE c.banner_type = 'action' -- فقط البانرات التفاعلية
GROUP BY c.id, c.name, c.name_ar, c.banner_type, c.banner_action_url;

COMMENT ON VIEW banner_analytics IS 'إحصائيات أداء البانرات التفاعلية';


-- 10. Stored Procedure لإرسال إشعار
-- =====================================================

CREATE OR REPLACE FUNCTION send_push_notification(
    p_title VARCHAR(255),
    p_body TEXT,
    p_type VARCHAR(50),
    p_image_url TEXT DEFAULT NULL,
    p_action_url TEXT DEFAULT NULL,
    p_target_segment VARCHAR(50) DEFAULT 'all',
    p_target_user_ids INTEGER[] DEFAULT NULL,
    p_created_by INTEGER DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_notification_id INTEGER;
    v_total_sent INTEGER;
BEGIN
    -- حساب عدد المستخدمين المستهدفين
    IF p_target_segment = 'all' THEN
        SELECT COUNT(*) INTO v_total_sent 
        FROM push_subscriptions 
        WHERE is_active = true;
    ELSIF p_target_user_ids IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_sent 
        FROM push_subscriptions 
        WHERE user_id = ANY(p_target_user_ids) AND is_active = true;
    ELSE
        v_total_sent := 0;
    END IF;
    
    -- إدراج سجل الإشعار
    INSERT INTO push_notifications (
        title, body, image_url, action_url, notification_type,
        target_segment, target_user_ids, total_sent, created_by, metadata
    )
    VALUES (
        p_title, p_body, p_image_url, p_action_url, p_type,
        p_target_segment, p_target_user_ids, v_total_sent, p_created_by, p_metadata
    )
    RETURNING id INTO v_notification_id;
    
    -- هنا يمكن إضافة كود لإرسال الإشعار الفعلي عبر OneSignal/FCM
    -- يتم تنفيذه في Backend باستخدام API خارجي
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION send_push_notification IS 'إرسال إشعار فوري وحفظ سجله في قاعدة البيانات';


-- 11. Data Migration - تحديث البيانات الموجودة
-- =====================================================

-- تحديث تقييمات العملاء الحاليين بناءً على سجلهم
UPDATE users u
SET customer_rating = ca.customer_rating
FROM customer_analytics ca
WHERE u.id = ca.id;


-- 12. Sample Data للاختبار
-- =====================================================

-- عميل ممتاز (للاختبار)
-- INSERT INTO users (name, email, phone, role, customer_rating) 
-- VALUES ('فاطمة علي', 'fatima@test.com', '01123456789', 'customer', 'excellent');

-- عميل مشاغب (للاختبار)
-- INSERT INTO users (name, email, phone, role, customer_rating)
-- VALUES ('محمود حسن', 'mahmoud@test.com', '01234567890', 'customer', 'problematic');


-- 13. API Queries - استعلامات جاهزة للـ Backend
-- =====================================================

-- الحصول على تحليلات جميع العملاء
-- SELECT * FROM customer_analytics ORDER BY total_spent DESC;

-- الحصول على العملاء المشاغبين فقط
-- SELECT * FROM customer_analytics WHERE customer_rating = 'problematic' ORDER BY rejected_orders DESC;

-- الحصول على أفضل 10 عملاء
-- SELECT * FROM customer_analytics WHERE customer_rating = 'excellent' ORDER BY total_spent DESC LIMIT 10;

-- البحث عن عميل معين
-- SELECT * FROM customer_analytics WHERE name ILIKE '%أحمد%' OR email ILIKE '%ahmed%' OR phone LIKE '%012%';

-- إحصائيات البانرات
-- SELECT * FROM banner_analytics ORDER BY total_clicks DESC;

-- آخر 50 إشعار مرسل
-- SELECT * FROM push_notifications ORDER BY sent_at DESC LIMIT 50;


-- =====================================================
-- تم الانتهاء من إعداد قاعدة البيانات! ✅
-- =====================================================
