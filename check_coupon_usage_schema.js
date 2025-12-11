import { query } from './database.js';

async function checkSchema() {
    const result = await query(`
        SELECT column_name, is_nullable, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'coupon_usage' 
        ORDER BY ordinal_position
    `);
    console.table(result.rows);
    process.exit(0);
}

checkSchema().catch(console.error);
