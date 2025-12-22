-- Option A: Disable the trigger temporarily
DROP TRIGGER IF EXISTS update_brand_count_trigger ON products;
DROP FUNCTION IF EXISTS update_brand_products_count();

-- OR Option B: Fix the trigger to handle missing column gracefully
CREATE OR REPLACE FUNCTION update_brand_products_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if products_count column exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'brands' 
        AND column_name = 'products_count'
    ) THEN
        UPDATE brands 
        SET products_count = (
            SELECT COUNT(*) FROM products WHERE brand_id = NEW.brand_id
        )
        WHERE id = NEW.brand_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS update_brand_count_trigger ON products;
CREATE TRIGGER update_brand_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON products
FOR EACH ROW
EXECUTE FUNCTION update_brand_products_count();
