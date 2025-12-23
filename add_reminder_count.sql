-- إضافة عمود reminder_count لتتبع عدد التذكيرات المرسلة
ALTER TABLE order_assignments 
ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

-- إضافة index لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_order_assignments_pending 
ON order_assignments(status, accept_deadline) 
WHERE status = 'assigned';

COMMENT ON COLUMN order_assignments.reminder_count IS 'عدد التذكيرات المرسلة للموظف';
