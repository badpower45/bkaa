import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
    try {
        console.log('=== Applying increment_coupon_usage Migration ===\n');
        
        const sqlFile = path.join(__dirname, '../supabase/migrations/increment_coupon_usage.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');
        
        await query(sql);
        
        console.log('✅ Migration applied successfully!');
        console.log('\nFunction created: increment_coupon_usage(coupon_id_param INTEGER)');
        
        // Test the function
        console.log('\n=== Testing Function ===');
        const testResult = await query('SELECT increment_coupon_usage(1)');
        console.log('✅ Function test successful');
        
        // Check updated coupon
        const couponCheck = await query('SELECT code, used_count FROM coupons WHERE id = 1');
        console.log('\nCoupon after increment:', couponCheck.rows[0]);
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

applyMigration();
