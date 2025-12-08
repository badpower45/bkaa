import { query } from './database.js';
import pool from './database.js';

async function checkOrders() {
    try {
        console.log('📦 Checking orders in database...\n');
        
        const { rows } = await query('SELECT id, user_id, order_code, status, total, date FROM orders ORDER BY date DESC LIMIT 10');
        
        if (rows.length === 0) {
            console.log('❌ No orders found in database!');
        } else {
            console.log('📦 Recent Orders:');
            console.log('─'.repeat(80));
            rows.forEach(r => {
                console.log(`  ID: ${r.id}`);
                console.log(`  Code: ${r.order_code || '⚠️ NO CODE'}`);
                console.log(`  Status: ${r.status}`);
                console.log(`  Total: ${r.total} EGP`);
                console.log(`  Date: ${r.date}`);
                console.log('─'.repeat(80));
            });
            console.log(`\n📊 Total orders shown: ${rows.length}`);
            
            // Count orders with/without codes
            const withCode = rows.filter(r => r.order_code).length;
            const withoutCode = rows.filter(r => !r.order_code).length;
            console.log(`✅ Orders with code: ${withCode}`);
            console.log(`❌ Orders without code: ${withoutCode}`);
        }
        
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await pool.end();
    }
}

checkOrders();
