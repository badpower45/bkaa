-- Create draft_products table for imported products before publishing
CREATE TABLE IF NOT EXISTS draft_products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    category VARCHAR(100),
    subcategory VARCHAR(100),
    barcode VARCHAR(50),
    old_price DECIMAL(10, 2),
    price DECIMAL(10, 2),
    discount_percentage INTEGER DEFAULT 0,
    image TEXT,
    branch_id INTEGER,
    stock_quantity INTEGER,
    expiry_date DATE,
    brand_name VARCHAR(100),
    
    -- Status and metadata
    status VARCHAR(20) DEFAULT 'draft', -- draft, validated, rejected
    import_batch_id UUID,
    import_date TIMESTAMP DEFAULT NOW(),
    
    -- Validation errors
    validation_errors JSONB,
    notes TEXT,
    
    -- Who imported
    imported_by INTEGER REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Ensure brand column exists for older installs
ALTER TABLE draft_products ADD COLUMN IF NOT EXISTS brand_name VARCHAR(100);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_draft_products_status ON draft_products(status);
CREATE INDEX IF NOT EXISTS idx_draft_products_batch ON draft_products(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_draft_products_imported_by ON draft_products(imported_by);

-- Drop old function signature before redefining (return type changed)
DROP FUNCTION IF EXISTS publish_draft_product(INTEGER);

-- Function to publish draft product to main products table
CREATE OR REPLACE FUNCTION publish_draft_product(draft_id INTEGER)
RETURNS TABLE(product_id TEXT, success BOOLEAN, message TEXT) AS $$
DECLARE
    v_product_id TEXT;
    v_existing_id TEXT;
    v_brand_id INTEGER;
    v_draft RECORD;
BEGIN
    -- Get draft product
    SELECT * INTO v_draft FROM draft_products WHERE id = draft_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::TEXT, FALSE, 'Draft product not found';
        RETURN;
    END IF;
    
    -- Validate required fields
    IF v_draft.name IS NULL OR v_draft.price IS NULL THEN
        RETURN QUERY SELECT NULL::TEXT, FALSE, 'Missing required fields: name and price';
        RETURN;
    END IF;

    -- Resolve brand from draft if provided
    IF v_draft.brand_name IS NOT NULL AND TRIM(v_draft.brand_name) <> '' THEN
        SELECT id INTO v_brand_id
        FROM brands
        WHERE LOWER(TRIM(name_ar)) = LOWER(TRIM(v_draft.brand_name))
           OR LOWER(TRIM(name_en)) = LOWER(TRIM(v_draft.brand_name))
        LIMIT 1;

        IF v_brand_id IS NULL THEN
            INSERT INTO brands (name_ar, name_en)
            VALUES (v_draft.brand_name, v_draft.brand_name)
            RETURNING id INTO v_brand_id;
        END IF;
    END IF;

    -- Find existing product by barcode or name
    IF v_draft.barcode IS NOT NULL AND TRIM(v_draft.barcode) <> '' THEN
        SELECT id INTO v_existing_id FROM products WHERE barcode = v_draft.barcode LIMIT 1;
    END IF;

    IF v_existing_id IS NULL AND v_draft.name IS NOT NULL AND TRIM(v_draft.name) <> '' THEN
        SELECT id INTO v_existing_id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_draft.name)) LIMIT 1;
    END IF;

    IF v_existing_id IS NOT NULL THEN
        v_product_id := v_existing_id;
        UPDATE products SET
            name = COALESCE(v_draft.name, name),
            category = COALESCE(v_draft.category, category),
            subcategory = COALESCE(v_draft.subcategory, subcategory),
            image = COALESCE(v_draft.image, image),
            barcode = COALESCE(v_draft.barcode, barcode),
            brand_id = COALESCE(v_brand_id, brand_id)
        WHERE id = v_product_id;
    ELSE
        -- Insert into products table
        INSERT INTO products (
            id, name, category, subcategory, image, barcode, brand_id
        ) VALUES (
            COALESCE(NULLIF(TRIM(v_draft.barcode), ''), (SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 FROM products WHERE id ~ '^[0-9]+$')::TEXT),
            v_draft.name,
            COALESCE(v_draft.category, 'Uncategorized'),
            v_draft.subcategory,
            v_draft.image,
            v_draft.barcode,
            v_brand_id
        ) RETURNING id INTO v_product_id;
    END IF;
    
    -- Insert into branch_products if branch info available
    IF v_draft.branch_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM branch_products
            WHERE branch_id = v_draft.branch_id AND product_id = v_product_id
        ) THEN
            UPDATE branch_products SET
                price = COALESCE(v_draft.price, price),
                discount_price = COALESCE(v_draft.old_price, discount_price),
                stock_quantity = COALESCE(v_draft.stock_quantity, stock_quantity),
                expiry_date = COALESCE(v_draft.expiry_date, expiry_date)
            WHERE branch_id = v_draft.branch_id AND product_id = v_product_id;
        ELSE
            INSERT INTO branch_products (
                branch_id, product_id, price, discount_price,
                stock_quantity, expiry_date, is_available
            ) VALUES (
                v_draft.branch_id,
                v_product_id,
                v_draft.price,
                v_draft.old_price,
                COALESCE(v_draft.stock_quantity, 0),
                v_draft.expiry_date,
                true
            );
        END IF;
    END IF;
    
    -- Delete draft product
    DELETE FROM draft_products WHERE id = draft_id;
    
    RETURN QUERY SELECT v_product_id, TRUE, 'Product published successfully';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE draft_products IS 'Temporary storage for imported products before validation and publishing';
COMMENT ON FUNCTION publish_draft_product IS 'Publishes a draft product to main products and branch_products tables';
