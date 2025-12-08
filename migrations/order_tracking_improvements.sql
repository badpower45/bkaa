-- =============================================
-- تحسينات تتبع الطلبات والسائقين
-- =============================================

-- إضافة أعمدة GPS للسائق
ALTER TABLE delivery_staff ADD COLUMN IF NOT EXISTS last_lat DECIMAL(10, 8);
ALTER TABLE delivery_staff ADD COLUMN IF NOT EXISTS last_lng DECIMAL(11, 8);
ALTER TABLE delivery_staff ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMP;

-- إضافة الوقت المتوقع للتوصيل في order_assignments
ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS expected_delivery_time INTEGER; -- بالدقائق
ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT FALSE;
ALTER TABLE order_assignments ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0; -- دقائق التأخير

-- جدول تاريخ مواقع السائق (اختياري - للتتبع التفصيلي)
CREATE TABLE IF NOT EXISTS driver_location_history (
    id SERIAL PRIMARY KEY,
    delivery_staff_id INTEGER NOT NULL,
    order_id INTEGER,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (delivery_staff_id) REFERENCES delivery_staff(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- جدول إشعارات الطلبات
CREATE TABLE IF NOT EXISTS order_notifications (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    user_id INTEGER, -- العميل أو السائق
    type VARCHAR(50) NOT NULL, -- new_order, status_update, driver_assigned, etc.
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB, -- بيانات إضافية
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- إضافة وقت متوقع للتوصيل في delivery_slots
ALTER TABLE delivery_slots ADD COLUMN IF NOT EXISTS estimated_delivery_minutes INTEGER DEFAULT 30;

-- Indexes للأداء
CREATE INDEX IF NOT EXISTS idx_driver_location_history_staff ON driver_location_history(delivery_staff_id);
CREATE INDEX IF NOT EXISTS idx_driver_location_history_order ON driver_location_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notifications_user ON order_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_order_notifications_order ON order_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_staff_location ON delivery_staff(last_lat, last_lng);
