-- إضافة حقل موقع الرف للمنتجات
-- Add shelf_location column to products table

-- Run this in Supabase SQL Editor

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(100);

-- Add comment for documentation
COMMENT ON COLUMN products.shelf_location IS 'موقع المنتج في الرف - مثال: صف 3 - رف A';

-- Example update for existing products (optional)
-- UPDATE products SET shelf_location = 'صف 1 - رف A' WHERE category = 'ألبان';
-- UPDATE products SET shelf_location = 'صف 2 - رف B' WHERE category = 'مشروبات';
