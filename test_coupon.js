import { query } from './database.js';

async function testCoupon() {
    try {
        // First, let's get a test user token
        console.log('=== Testing Coupon Validation ===\n');
        
        // Get a test user
        const userResult = await query('SELECT id, email FROM users WHERE role = $1 LIMIT 1', ['customer']);
        
        if (userResult.rows.length === 0) {
            console.log('No customer users found. Creating a test user...');
            const createUser = await query(`
                INSERT INTO users (email, password_hash, name, role) 
                VALUES ('test@example.com', 'dummy_hash', 'Test User', 'customer')
                RETURNING id, email
            `);
            console.log('Created test user:', createUser.rows[0]);
        } else {
            console.log('Using existing user:', userResult.rows[0]);
        }
        
        // Test coupon validation directly in database
        console.log('\n=== Testing WELCOME10 Coupon ===');
        const testCode = 'WELCOME10';
        const testSubtotal = 150; // جنيه
        
        const couponResult = await query(
            'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND is_active = TRUE',
            [testCode]
        );
        
        if (couponResult.rows.length > 0) {
            const coupon = couponResult.rows[0];
            console.log('\n✅ Coupon found:');
            console.log({
                code: coupon.code,
                discount_type: coupon.discount_type,
                discount_value: coupon.discount_value,
                min_order_value: coupon.min_order_value,
                is_active: coupon.is_active
            });
            
            // Calculate discount
            let discountAmount = 0;
            if (coupon.discount_type === 'percentage') {
                discountAmount = (testSubtotal * parseFloat(coupon.discount_value)) / 100;
                if (coupon.max_discount && discountAmount > parseFloat(coupon.max_discount)) {
                    discountAmount = parseFloat(coupon.max_discount);
                }
            } else if (coupon.discount_type === 'fixed') {
                discountAmount = parseFloat(coupon.discount_value);
                if (discountAmount > testSubtotal) {
                    discountAmount = testSubtotal;
                }
            }
            
            console.log(`\n💰 Discount Calculation:`);
            console.log(`  Subtotal: ${testSubtotal} جنيه`);
            console.log(`  Discount: ${discountAmount} جنيه`);
            console.log(`  Final: ${testSubtotal - discountAmount} جنيه`);
            
            // Check validation conditions
            console.log(`\n🔍 Validation Checks:`);
            console.log(`  Min order value: ${coupon.min_order_value} جنيه (${testSubtotal >= parseFloat(coupon.min_order_value || 0) ? '✅ PASS' : '❌ FAIL'})`);
            console.log(`  Usage limit: ${coupon.usage_limit || 'unlimited'} (Used: ${coupon.used_count})`);
            console.log(`  Per user limit: ${coupon.per_user_limit || 'unlimited'}`);
            
        } else {
            console.log('❌ Coupon not found or not active');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

testCoupon();
