import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './database.js'; // Use existing connection

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    try {
        console.log('✅ Using existing database connection');

        // Read migration file
        const migrationPath = path.join(__dirname, 'migrations', 'add_draft_products_table.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('📝 Running migration...');
        await query(migrationSQL);
        
        console.log('✅ Migration completed successfully!');
        console.log('✅ Table draft_products created');
        console.log('✅ Function publish_draft_product created');

        // Verify table exists
        const result = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'draft_products'
            );
        `);

        if (result.rows[0].exists) {
            console.log('✅ Verification: draft_products table exists');
        } else {
            console.log('❌ Warning: draft_products table not found');
        }

    } catch (err) {
        console.error('❌ Migration error:', err.message);
        console.error('Full error:', err);
        process.exit(1);
    }
}

runMigration();
