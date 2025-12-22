-- ============================================
-- Advanced Inventory Management System
-- Based on Perpetual Inventory + FIFO Method
-- ============================================

-- STEP 1: Create inventory_locations table (for multiple warehouses/branches)
CREATE TABLE IF NOT EXISTS inventory_locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- STEP 2: Create inventory_batches table (FIFO tracking)
CREATE TABLE IF NOT EXISTS inventory_batches (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL,
    location_id INTEGER NOT NULL,
    batch_number VARCHAR(100) NOT NULL UNIQUE,
    quantity_received INTEGER NOT NULL,
    quantity_remaining INTEGER NOT NULL,
    unit_cost DECIMAL(10,2) NOT NULL,
    supplier_id INTEGER,
    manufacturing_date DATE,
    expiry_date DATE,
    received_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_location FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE CASCADE
);

-- STEP 3: Create inventory_transactions table (audit trail)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL,
    batch_id INTEGER,
    location_id INTEGER NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN'
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10,2),
    reference_type VARCHAR(50), -- 'ORDER', 'RETURN', 'PURCHASE', 'ADJUSTMENT'
    reference_id INTEGER,
    notes TEXT,
    performed_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_trans FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_batch_trans FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL,
    CONSTRAINT fk_location_trans FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE CASCADE
);

-- STEP 4: Create inventory_alerts table (low stock, expiry warnings)
CREATE TABLE IF NOT EXISTS inventory_alerts (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL,
    location_id INTEGER,
    alert_type VARCHAR(50) NOT NULL, -- 'LOW_STOCK', 'OUT_OF_STOCK', 'EXPIRING_SOON', 'EXPIRED'
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    message TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_alert FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_location_alert FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE CASCADE
);

-- STEP 5: Add inventory fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 10;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_quantity INTEGER DEFAULT 50;
ALTER TABLE products ADD COLUMN IF NOT EXISTS safety_stock INTEGER DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 7;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_perishable BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_batches BOOLEAN DEFAULT false;

-- STEP 6: Create inventory_summary view (real-time stock levels)
CREATE OR REPLACE VIEW inventory_summary AS
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.barcode,
    ib.location_id,
    il.name as location_name,
    SUM(ib.quantity_remaining) as total_quantity,
    MIN(ib.expiry_date) as nearest_expiry,
    COUNT(ib.id) as batch_count,
    AVG(ib.unit_cost) as avg_cost,
    p.reorder_point,
    p.safety_stock,
    CASE 
        WHEN SUM(ib.quantity_remaining) = 0 THEN 'OUT_OF_STOCK'
        WHEN SUM(ib.quantity_remaining) <= p.reorder_point THEN 'LOW_STOCK'
        WHEN SUM(ib.quantity_remaining) <= p.safety_stock THEN 'CRITICAL'
        ELSE 'ADEQUATE'
    END as stock_status
FROM products p
LEFT JOIN inventory_batches ib ON p.id = ib.product_id
LEFT JOIN inventory_locations il ON ib.location_id = il.id
WHERE ib.quantity_remaining > 0 OR ib.id IS NULL
GROUP BY p.id, p.name, p.barcode, ib.location_id, il.name, p.reorder_point, p.safety_stock;

-- STEP 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product ON inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_location ON inventory_batches(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry ON inventory_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_remaining ON inventory_batches(quantity_remaining);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference ON inventory_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_product ON inventory_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_resolved ON inventory_alerts(is_resolved);

-- STEP 8: Insert default location (main warehouse)
INSERT INTO inventory_locations (name, name_ar, address, is_active) 
VALUES ('Main Warehouse', 'المخزن الرئيسي', 'Cairo, Egypt', true)
ON CONFLICT DO NOTHING;

-- STEP 9: Create function to process inventory OUT (FIFO)
CREATE OR REPLACE FUNCTION process_inventory_out(
    p_product_id TEXT,
    p_location_id INTEGER,
    p_quantity INTEGER,
    p_reference_type VARCHAR,
    p_reference_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    remaining_qty INTEGER := p_quantity;
    batch_record RECORD;
    deducted_qty INTEGER;
BEGIN
    -- Get batches in FIFO order (oldest first)
    FOR batch_record IN 
        SELECT * FROM inventory_batches 
        WHERE product_id = p_product_id 
        AND location_id = p_location_id 
        AND quantity_remaining > 0
        ORDER BY received_date ASC
    LOOP
        IF remaining_qty <= 0 THEN
            EXIT;
        END IF;
        
        -- Calculate how much to deduct from this batch
        deducted_qty := LEAST(batch_record.quantity_remaining, remaining_qty);
        
        -- Update batch quantity
        UPDATE inventory_batches 
        SET quantity_remaining = quantity_remaining - deducted_qty,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = batch_record.id;
        
        -- Record transaction
        INSERT INTO inventory_transactions (
            product_id, batch_id, location_id, transaction_type,
            quantity, unit_cost, reference_type, reference_id
        ) VALUES (
            p_product_id, batch_record.id, p_location_id, 'OUT',
            -deducted_qty, batch_record.unit_cost, p_reference_type, p_reference_id
        );
        
        remaining_qty := remaining_qty - deducted_qty;
    END LOOP;
    
    -- Check if we fulfilled the request
    IF remaining_qty > 0 THEN
        RAISE EXCEPTION 'Insufficient inventory. Missing % units', remaining_qty;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- STEP 10: Create function to check and create alerts
CREATE OR REPLACE FUNCTION check_inventory_alerts() RETURNS VOID AS $$
DECLARE
    product_record RECORD;
BEGIN
    -- Clear old resolved alerts (older than 30 days)
    DELETE FROM inventory_alerts 
    WHERE is_resolved = true 
    AND resolved_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    -- Check for low stock and expiring items
    FOR product_record IN 
        SELECT * FROM inventory_summary
    LOOP
        -- Low stock alert
        IF product_record.stock_status IN ('LOW_STOCK', 'CRITICAL', 'OUT_OF_STOCK') THEN
            INSERT INTO inventory_alerts (product_id, location_id, alert_type, severity, message)
            SELECT 
                product_record.product_id,
                product_record.location_id,
                'LOW_STOCK',
                CASE 
                    WHEN product_record.stock_status = 'OUT_OF_STOCK' THEN 'critical'
                    WHEN product_record.stock_status = 'CRITICAL' THEN 'high'
                    ELSE 'medium'
                END,
                format('منتج %s في %s - الكمية: %s', 
                    product_record.product_name,
                    product_record.location_name,
                    product_record.total_quantity
                )
            WHERE NOT EXISTS (
                SELECT 1 FROM inventory_alerts 
                WHERE product_id = product_record.product_id 
                AND location_id = product_record.location_id
                AND alert_type = 'LOW_STOCK'
                AND is_resolved = false
            );
        END IF;
        
        -- Expiring soon alert (within 7 days)
        IF product_record.nearest_expiry IS NOT NULL 
        AND product_record.nearest_expiry <= CURRENT_DATE + INTERVAL '7 days' THEN
            INSERT INTO inventory_alerts (product_id, location_id, alert_type, severity, message)
            SELECT 
                product_record.product_id,
                product_record.location_id,
                CASE 
                    WHEN product_record.nearest_expiry < CURRENT_DATE THEN 'EXPIRED'
                    ELSE 'EXPIRING_SOON'
                END,
                'high',
                format('منتج %s ينتهي في %s', 
                    product_record.product_name,
                    product_record.nearest_expiry
                )
            WHERE NOT EXISTS (
                SELECT 1 FROM inventory_alerts 
                WHERE product_id = product_record.product_id 
                AND location_id = product_record.location_id
                AND alert_type IN ('EXPIRING_SOON', 'EXPIRED')
                AND is_resolved = false
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- STEP 11: Create trigger to update product stock automatically
CREATE OR REPLACE FUNCTION update_product_stock() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE products p
        SET stock = (
            SELECT COALESCE(SUM(quantity_remaining), 0)
            FROM inventory_batches
            WHERE product_id = NEW.product_id
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.product_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_product_stock
AFTER INSERT OR UPDATE ON inventory_batches
FOR EACH ROW
EXECUTE FUNCTION update_product_stock();

-- STEP 12: Add comments for documentation
COMMENT ON TABLE inventory_batches IS 'Tracks inventory in batches using FIFO method for accurate cost calculation';
COMMENT ON TABLE inventory_transactions IS 'Complete audit trail of all inventory movements';
COMMENT ON TABLE inventory_alerts IS 'Automated alerts for low stock, expiring products, and other inventory issues';
COMMENT ON FUNCTION process_inventory_out IS 'Deducts inventory using FIFO method (oldest stock first)';
COMMENT ON FUNCTION check_inventory_alerts IS 'Checks and creates alerts for low stock and expiring items';

-- ============================================
-- ALL DONE! ✅ Advanced Inventory System Ready
-- ============================================
