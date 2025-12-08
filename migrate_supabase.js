import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.resolve(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');

const migrate = async () => {
    const client = await pool.connect();
    try {
        console.log('🚀 Starting migration to Supabase...');

        // Execute the schema SQL
        await client.query(schemaSql);

        console.log('✅ Migration Successful: Tables created/verified.');
    } catch (err) {
        console.error('❌ Migration Failed:', err);
    } finally {
        client.release();
        pool.end();
    }
};

migrate();
