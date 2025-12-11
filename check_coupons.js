import { query } from './database.js';

async function checkCoupons() {
    try {
        // Check coupons table schema
        const schema = await query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'coupons' 
            ORDER BY ordinal_position
        `);
        
        console.log('=== COUPONS TABLE SCHEMA ===');
        console.table(schema.rows);
        
        // Get sample coupons
        const data = await query('SELECT * FROM coupons LIMIT 5');
        console.log('\n=== SAMPLE COUPONS ===');
        console.table(data.rows);
        
        // Check if there are any active coupons
        const active = await query(`
            SELECT code, discount_type, discount_value, min_order_value, 
                   valid_from, valid_until, is_active, used_count, usage_limit
            FROM coupons 
            WHERE is_active = TRUE
            ORDER BY created_at DESC
            LIMIT 10
        `);
        console.log('\n=== ACTIVE COUPONS ===');
        console.table(active.rows);
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkCoupons();
