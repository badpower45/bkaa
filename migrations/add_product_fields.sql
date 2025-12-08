-- Migration: Add subcategory to products and expiry_date to branch_products
-- Run this on existing database to add new columns

-- Add subcategory column to products table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='products' AND column_name='subcategory') THEN
        ALTER TABLE products ADD COLUMN subcategory TEXT;
    END IF;
END $$;

-- Add expiry_date column to branch_products table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='branch_products' AND column_name='expiry_date') THEN
        ALTER TABLE branch_products ADD COLUMN expiry_date DATE;
    END IF;
END $$;

-- Create index for faster subcategory queries
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory);

-- Create index for expiry date queries (useful for reporting near-expiry products)
CREATE INDEX IF NOT EXISTS idx_branch_products_expiry ON branch_products(expiry_date);

COMMENT ON COLUMN products.subcategory IS 'التصنيف الفرعي للمنتج';
COMMENT ON COLUMN branch_products.expiry_date IS 'تاريخ صلاحية المنتج في هذا الفرع';
COMMENT ON COLUMN branch_products.discount_price IS 'السعر قبل الخصم (السعر الأصلي)';
COMMENT ON COLUMN branch_products.price IS 'السعر بعد الخصم (السعر الحالي)';
