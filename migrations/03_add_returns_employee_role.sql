-- ============================================
-- Add Returns Manager Employee Role
-- ============================================

-- STEP 1: Create employees table if not exists
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) NOT NULL DEFAULT 'cashier',
    branch_id INTEGER,
    is_active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- STEP 2: Update employees table to support returns_manager role
UPDATE employees 
SET permissions = CASE 
    WHEN role = 'admin' THEN '{"manage_products":true,"manage_orders":true,"manage_users":true,"manage_inventory":true,"manage_returns":true,"view_analytics":true}'::jsonb
    WHEN role = 'cashier' THEN '{"process_orders":true,"view_products":true,"manage_returns":false}'::jsonb
    WHEN role = 'inventory' THEN '{"manage_inventory":true,"manage_products":true,"view_orders":true,"manage_returns":false}'::jsonb
    ELSE permissions
END
WHERE role IN ('admin', 'cashier', 'inventory');

-- STEP 3: Insert sample returns manager employee
INSERT INTO employees (
    name,
    email,
    phone,
    role,
    branch_id,
    is_active,
    permissions,
    created_at
) VALUES (
    'مدير المرتجعات',
    'returns@allosh.com',
    '01000000005',
    'returns_manager',
    1,
    true,
    '{"manage_returns":true,"view_orders":true,"process_refunds":true}'::jsonb,
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- STEP 4: Add comment
COMMENT ON COLUMN employees.permissions IS 'JSON object containing employee permissions: manage_products, manage_orders, manage_users, manage_inventory, manage_returns, view_analytics, process_orders, view_products, process_refunds';

-- ============================================
-- ALL DONE! ✅
-- ============================================
