import pool from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    console.log('🚀 Running favorites and stories migration...');
    
    try {
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'migrations', 'add_favorites_stories.sql'),
            'utf8'
        );
        
        await pool.query(migrationSQL);
        
        console.log('✅ Migration completed successfully!');
        console.log('   - Created favorites table');
        console.log('   - Created stories table');
        console.log('   - Created indexes');
        
        // Verify tables exist
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('favorites', 'stories')
        `);
        
        console.log('\n📋 Verified tables:', tablesResult.rows.map(r => r.table_name));
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

runMigration();
