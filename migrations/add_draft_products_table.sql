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

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_draft_products_status ON draft_products(status);
CREATE INDEX IF NOT EXISTS idx_draft_products_batch ON draft_products(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_draft_products_imported_by ON draft_products(imported_by);

-- Function to publish draft product to main products table
CREATE OR REPLACE FUNCTION publish_draft_product(draft_id INTEGER)
RETURNS TABLE(product_id INTEGER, success BOOLEAN, message TEXT) AS $$
DECLARE
    v_product_id INTEGER;
    v_draft RECORD;
BEGIN
    -- Get draft product
    SELECT * INTO v_draft FROM draft_products WHERE id = draft_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::INTEGER, FALSE, 'Draft product not found';
        RETURN;
    END IF;
    
    -- Validate required fields
    IF v_draft.name IS NULL OR v_draft.price IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, FALSE, 'Missing required fields: name and price';
        RETURN;
    END IF;
    
    -- Insert into products table
    INSERT INTO products (
        name, category, subcategory, image, barcode,
        discount_percentage, is_active, created_at, updated_at
    ) VALUES (
        v_draft.name,
        COALESCE(v_draft.category, 'Uncategorized'),
        v_draft.subcategory,
        v_draft.image,
        v_draft.barcode,
        COALESCE(v_draft.discount_percentage, 0),
        true,
        NOW(),
        NOW()
    ) RETURNING id INTO v_product_id;
    
    -- Insert into branch_products if branch info available
    IF v_draft.branch_id IS NOT NULL THEN
        INSERT INTO branch_products (
            branch_id, product_id, price, stock_quantity,
            expiry_date, is_available, created_at, updated_at
        ) VALUES (
            v_draft.branch_id,
            v_product_id,
            v_draft.price,
            COALESCE(v_draft.stock_quantity, 0),
            v_draft.expiry_date,
            true,
            NOW(),
            NOW()
        );
    END IF;
    
    -- Delete draft product
    DELETE FROM draft_products WHERE id = draft_id;
    
    RETURN QUERY SELECT v_product_id, TRUE, 'Product published successfully';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE draft_products IS 'Temporary storage for imported products before validation and publishing';
COMMENT ON FUNCTION publish_draft_product IS 'Publishes a draft product to main products and branch_products tables';
