import { query } from './database.js';

async function check() {
    try {
        const result = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('Tables:', result.rows.map(r => r.table_name));
        
        // Check order_preparation_items
        const prepResult = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'order_preparation_items'
        `);
        console.log('\norder_preparation_items columns:', prepResult.rows);
        
        // Check order_assignments
        const assignResult = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'order_assignments'
        `);
        console.log('\norder_assignments columns:', assignResult.rows);
        
        // Check delivery_staff
        const staffResult = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'delivery_staff'
        `);
        console.log('\ndelivery_staff columns:', staffResult.rows);
        
        // Wait a bit before exiting to avoid connection termination issues
        setTimeout(() => process.exit(0), 500);
    } catch (e) {
        console.error('Error:', e.message);
        setTimeout(() => process.exit(1), 500);
    }
}

check();
