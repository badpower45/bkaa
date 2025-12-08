import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    console.log('🔧 Running database migrations...\n');

    try {
        // Read migration file
        const migrationPath = path.join(__dirname, 'migrations', 'add_loyalty_points.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        // Execute migration
        await query(migrationSQL);

        console.log('✅ Migration completed successfully!\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error running migration:', error);
        process.exit(1);
    }
}

runMigration();
