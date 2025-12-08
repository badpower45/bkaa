import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    console.log('🚀 Running order tracking improvements migration...\n');
    
    try {
        const migrationPath = path.join(__dirname, 'migrations', 'order_tracking_improvements.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        // Split and run each statement
        const statements = sql.split(';').filter(s => s.trim());
        
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await query(statement);
                    console.log('✅', statement.substring(0, 60).replace(/\n/g, ' ') + '...');
                } catch (err) {
                    // Ignore "already exists" errors
                    if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
                        console.error('⚠️ Warning:', err.message);
                    } else {
                        console.log('⏭️ Skipped (already exists):', statement.substring(0, 40).replace(/\n/g, ' ') + '...');
                    }
                }
            }
        }
        
        console.log('\n✅ Migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
