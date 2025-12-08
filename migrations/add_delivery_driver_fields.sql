-- Migration: Add delivery driver page fields
-- الحقول الجديدة لصفحة الديليفري

-- إضافة حقول جديدة لجدول order_assignments
-- ملاحظة: تأكد من تشغيل schema.sql أولاً لإنشاء الجدول
ALTER TABLE order_assignments
ADD COLUMN IF NOT EXISTS arriving_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- لا نحتاج تحديث constraint لأن الـ status هو TEXT وليس ENUM
-- الحالات المتاحة: pending, preparing, ready, assigned, picked_up, arriving, delivered, rejected
