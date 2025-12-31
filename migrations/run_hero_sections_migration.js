import { query } from '../database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runMigration = async () => {
    try {
        console.log('🚀 Starting Hero Sections migration...');

        const sql = fs.readFileSync(
            path.join(__dirname, 'create_hero_sections.sql'),
            'utf8'
        );

        await query(sql);

        console.log('✅ Hero Sections migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

runMigration();
