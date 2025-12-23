import { query } from './database.js';

async function checkTables() {
    console.log('🔍 Checking barcode system tables...\n');
    
    try {
        // Check if loyalty_barcodes table exists
        const { rows: tableCheck } = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'loyalty_barcodes'
            ) as exists
        `);
        
        if (tableCheck[0].exists) {
            console.log('✅ loyalty_barcodes table EXISTS\n');
            
            // Get columns
            const { rows: columns } = await query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'loyalty_barcodes'
                ORDER BY ordinal_position
            `);
            
            console.log('📋 Table columns:');
            columns.forEach(col => {
                console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(25)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
            });
            
            // Check row count
            const { rows: count } = await query('SELECT COUNT(*) as count FROM loyalty_barcodes');
            console.log(`\n📊 Total barcodes: ${count[0].count}\n`);
            
        } else {
            console.log('❌ loyalty_barcodes table DOES NOT EXIST');
            console.log('👉 Need to run migration: node run_barcode_migration.js\n');
        }
        
        // Check loyalty_transactions columns
        const { rows: ltColumns } = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'loyalty_transactions' 
            AND column_name IN ('barcode_id', 'order_id')
        `);
        
        if (ltColumns.length > 0) {
            console.log('✅ loyalty_transactions columns:');
            ltColumns.forEach(col => {
                console.log(`  ✓ ${col.column_name}`);
            });
        } else {
            console.log('⚠️  loyalty_transactions missing barcode_id/order_id columns');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkTables();
