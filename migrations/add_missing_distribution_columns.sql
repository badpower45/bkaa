-- Migration: Add missing columns to distribution tables
-- Required for full order preparation and delivery flow

-- 1. Add missing columns to order_assignments
DO $$ 
BEGIN
    -- Accept deadline for delivery staff (5 min timeout)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='accept_deadline') THEN
        ALTER TABLE order_assignments ADD COLUMN accept_deadline TIMESTAMP;
    END IF;
    
    -- Time when delivery accepted the order
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='accepted_at') THEN
        ALTER TABLE order_assignments ADD COLUMN accepted_at TIMESTAMP;
    END IF;
    
    -- Time when delivery arrived at branch
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='branch_arrived_at') THEN
        ALTER TABLE order_assignments ADD COLUMN branch_arrived_at TIMESTAMP;
    END IF;
    
    -- Time when delivery arrived at customer
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='customer_arrived_at') THEN
        ALTER TABLE order_assignments ADD COLUMN customer_arrived_at TIMESTAMP;
    END IF;
    
    -- Time to branch in minutes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='time_to_branch') THEN
        ALTER TABLE order_assignments ADD COLUMN time_to_branch INTEGER;
    END IF;
    
    -- Time to customer in minutes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='time_to_customer') THEN
        ALTER TABLE order_assignments ADD COLUMN time_to_customer INTEGER;
    END IF;
    
    -- Total delivery time
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='total_delivery_time') THEN
        ALTER TABLE order_assignments ADD COLUMN total_delivery_time INTEGER;
    END IF;
    
    -- Ratings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='delivery_rating') THEN
        ALTER TABLE order_assignments ADD COLUMN delivery_rating DECIMAL(2,1);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='order_rating') THEN
        ALTER TABLE order_assignments ADD COLUMN order_rating DECIMAL(2,1);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='speed_rating') THEN
        ALTER TABLE order_assignments ADD COLUMN speed_rating DECIMAL(2,1);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='rating_notes') THEN
        ALTER TABLE order_assignments ADD COLUMN rating_notes TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_assignments' AND column_name='rated_at') THEN
        ALTER TABLE order_assignments ADD COLUMN rated_at TIMESTAMP;
    END IF;
END $$;

-- 2. Add missing columns to delivery_staff (performance stats)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_staff' AND column_name='total_deliveries') THEN
        ALTER TABLE delivery_staff ADD COLUMN total_deliveries INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_staff' AND column_name='total_rating_sum') THEN
        ALTER TABLE delivery_staff ADD COLUMN total_rating_sum DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_staff' AND column_name='total_ratings_count') THEN
        ALTER TABLE delivery_staff ADD COLUMN total_ratings_count INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_staff' AND column_name='average_rating') THEN
        ALTER TABLE delivery_staff ADD COLUMN average_rating DECIMAL(2,1) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_staff' AND column_name='average_delivery_time') THEN
        ALTER TABLE delivery_staff ADD COLUMN average_delivery_time INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_staff' AND column_name='on_time_deliveries') THEN
        ALTER TABLE delivery_staff ADD COLUMN on_time_deliveries INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_staff' AND column_name='late_deliveries') THEN
        ALTER TABLE delivery_staff ADD COLUMN late_deliveries INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_staff' AND column_name='rejected_orders') THEN
        ALTER TABLE delivery_staff ADD COLUMN rejected_orders INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='delivery_staff' AND column_name='expired_orders') THEN
        ALTER TABLE delivery_staff ADD COLUMN expired_orders INTEGER DEFAULT 0;
    END IF;
END $$;

-- 3. Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'order_assignments' 
ORDER BY ordinal_position;
