-- Test Script for Finance & Loyalty System
-- Run this to test the complete implementation

-- 1. Test: Check if coupons table exists and has the right structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'coupons'
ORDER BY ordinal_position;

-- 2. Test: Check if loyalty_redemptions table exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'loyalty_redemptions'
ORDER BY ordinal_position;

-- 3. Test: Check users have loyalty_points column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'loyalty_points';

-- 4. Test: Create a test user with 1500 loyalty points
INSERT INTO users (name, email, password, role, loyalty_points)
VALUES ('Test User', 'test@loyalty.com', 'test123', 'customer', 1500)
ON CONFLICT (email) DO UPDATE 
SET loyalty_points = 1500
RETURNING id, name, loyalty_points;

-- 5. Test: Simulate coupon redemption (manually)
DO $$
DECLARE
    test_user_id INTEGER;
    new_coupon_id INTEGER;
    current_points INTEGER;
BEGIN
    -- Get test user
    SELECT id, loyalty_points INTO test_user_id, current_points
    FROM users WHERE email = 'test@loyalty.com';
    
    RAISE NOTICE 'Test user ID: %, Current points: %', test_user_id, current_points;
    
    -- Check if user has enough points
    IF current_points >= 1000 THEN
        -- Create coupon
        INSERT INTO coupons (
            code, description, discount_type, discount_value,
            min_order_value, usage_limit, per_user_limit,
            valid_until, is_active, created_by
        ) VALUES (
            'TEST_REWARD_' || EXTRACT(EPOCH FROM NOW())::INTEGER,
            'Test Reward Coupon',
            'fixed',
            35.00,
            0,
            1,
            1,
            NOW() + INTERVAL '30 days',
            TRUE,
            test_user_id
        ) RETURNING id INTO new_coupon_id;
        
        -- Deduct points
        UPDATE users 
        SET loyalty_points = loyalty_points - 1000 
        WHERE id = test_user_id;
        
        -- Record redemption
        INSERT INTO loyalty_redemptions (user_id, points_redeemed, coupon_id)
        VALUES (test_user_id, 1000, new_coupon_id);
        
        RAISE NOTICE 'SUCCESS! Coupon created with ID: %', new_coupon_id;
        RAISE NOTICE 'Points deducted. Remaining: %', current_points - 1000;
    ELSE
        RAISE NOTICE 'FAILED: Not enough points. Has: %, Needs: 1000', current_points;
    END IF;
END $$;

-- 6. Verify the test worked
SELECT 
    u.id as user_id,
    u.name,
    u.loyalty_points,
    lr.points_redeemed,
    c.code as coupon_code,
    c.discount_value,
    c.valid_until
FROM users u
LEFT JOIN loyalty_redemptions lr ON u.id = lr.user_id
LEFT JOIN coupons c ON lr.coupon_id = c.id
WHERE u.email = 'test@loyalty.com'
ORDER BY lr.created_at DESC
LIMIT 1;

-- 7. Test: Check if coupon is valid
SELECT 
    code,
    discount_value,
    is_active,
    valid_until > NOW() as is_valid,
    usage_limit - used_count as remaining_uses
FROM coupons
WHERE code LIKE 'TEST_REWARD_%'
ORDER BY created_at DESC
LIMIT 1;

-- 8. Test loyalty points history (if table exists)
SELECT 
    u.name,
    lph.points,
    lph.type,
    lph.description,
    lph.created_at
FROM loyalty_points_history lph
JOIN users u ON lph.user_id = u.id
WHERE u.email = 'test@loyalty.com'
ORDER BY lph.created_at DESC
LIMIT 5;

-- 9. Statistics: Total loyalty points in circulation
SELECT 
    COUNT(*) as total_users,
    SUM(loyalty_points) as total_points,
    AVG(loyalty_points) as avg_points_per_user,
    MAX(loyalty_points) as max_points
FROM users
WHERE loyalty_points > 0;

-- 10. Statistics: Redemptions summary
SELECT 
    COUNT(*) as total_redemptions,
    SUM(points_redeemed) as total_points_redeemed,
    AVG(points_redeemed) as avg_redemption,
    COUNT(DISTINCT user_id) as unique_redeemers
FROM loyalty_redemptions;

-- CLEANUP (optional - uncomment to remove test data)
-- DELETE FROM loyalty_redemptions WHERE user_id IN (SELECT id FROM users WHERE email = 'test@loyalty.com');
-- DELETE FROM coupons WHERE code LIKE 'TEST_REWARD_%';
-- DELETE FROM users WHERE email = 'test@loyalty.com';
