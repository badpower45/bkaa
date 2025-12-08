import pool from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    console.log('🚀 Running categories migration...');
    
    try {
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'migrations', 'add_categories.sql'),
            'utf8'
        );
        
        await pool.query(migrationSQL);
        
        console.log('✅ Categories migration completed successfully!');
        
        // Verify table and show count
        const countResult = await pool.query('SELECT COUNT(*) FROM categories');
        console.log(`📊 Total categories created: ${countResult.rows[0].count}`);
        
        // Show sample categories
        const sampleResult = await pool.query('SELECT name, name_ar, icon, bg_color FROM categories LIMIT 10');
        console.log('\n📋 Sample categories:');
        sampleResult.rows.forEach(cat => {
            console.log(`   ${cat.icon} ${cat.name_ar || cat.name} (${cat.bg_color})`);
        });
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

runMigration();
