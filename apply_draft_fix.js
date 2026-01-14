import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function applyMigration() {
    try {
        console.log('🔧 Applying draft products function fix...');
        
        const migrationPath = path.join(__dirname, 'migrations', 'add_draft_products_table.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        await pool.query(sql);
        
        console.log('✅ Migration applied successfully!');
        console.log('✅ publish_draft_product function has been updated to handle TEXT parameter correctly');
        
        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error applying migration:', error);
        await pool.end();
        process.exit(1);
    }
}

applyMigration();
