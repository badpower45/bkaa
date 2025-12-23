import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    console.log('🚀 Starting Loyalty Barcode Migration...\n');
    
    try {
        // Read the migration file
        const migrationPath = path.join(__dirname, 'migrations', 'add_loyalty_barcode.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('📄 Migration file loaded successfully');
        console.log('📊 Executing migration...\n');
        
        // Execute the migration
        await query(sql);
        
        console.log('\n✅ Migration completed successfully!');
        console.log('📋 Verifying changes...\n');
        
        // Verify the table was created
        const { rows: tableCheck } = await query(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_name = 'loyalty_barcodes'
        `);
        
        if (tableCheck[0].count > 0) {
            console.log('✓ loyalty_barcodes table created');
            
            // Check columns
            const { rows: columns } = await query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'loyalty_barcodes'
                ORDER BY ordinal_position
            `);
            
            console.log('\n📋 Table columns:');
            columns.forEach(col => {
                console.log(`  - ${col.column_name} (${col.data_type})`);
            });
            
            // Check indexes
            const { rows: indexes } = await query(`
                SELECT indexname 
                FROM pg_indexes 
                WHERE tablename = 'loyalty_barcodes'
            `);
            
            console.log('\n🔍 Indexes:');
            indexes.forEach(idx => {
                console.log(`  - ${idx.indexname}`);
            });
        }
        
        // Check loyalty_transactions columns
        const { rows: ltColumns } = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'loyalty_transactions' 
            AND column_name IN ('barcode_id', 'order_id')
        `);
        
        console.log('\n✓ loyalty_transactions updated:');
        ltColumns.forEach(col => {
            console.log(`  - ${col.column_name} column added`);
        });
        
        console.log('\n🎉 Migration verification complete!');
        console.log('💾 Database is ready for barcode redemption system!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nError details:', error);
        process.exit(1);
    }
}

runMigration();
