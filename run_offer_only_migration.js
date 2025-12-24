import { query } from './database.js';
import fs from 'fs';

async function runMigration() {
    try {
        console.log('🔄 Starting migration: add_offer_only_column');
        
        const sql = fs.readFileSync('./add_offer_only_column.sql', 'utf8');
        
        await query(sql);
        
        console.log('✅ Migration completed successfully!');
        console.log('📋 Changes applied:');
        console.log('   - Added column: is_offer_only BOOLEAN DEFAULT FALSE');
        console.log('   - Created index: idx_products_offer_only');
        
        // Verify the column was added
        const result = await query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'products' AND column_name = 'is_offer_only'
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ Verification successful - Column exists:', result.rows[0]);
        } else {
            console.log('⚠️ Warning: Could not verify column creation');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        console.error('Error details:', err);
        process.exit(1);
    }
}

runMigration();
