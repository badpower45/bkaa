import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runIndexes() {
    try {
        console.log('📊 Adding performance indexes...');
        
        const sql = fs.readFileSync(join(__dirname, 'migrations', 'add_performance_indexes.sql'), 'utf8');
        
        await pool.query(sql);
        
        console.log('✅ Performance indexes added successfully!');
        console.log('🚀 Database queries will be much faster now!');
        
    } catch (err) {
        console.error('❌ Error adding indexes:', err);
    } finally {
        await pool.end();
    }
}

runIndexes();
