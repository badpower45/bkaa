import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    console.log('🚀 Running OAuth and Password Reset migration...\n');
    
    try {
        // Add OAuth columns
        console.log('Adding google_id column...');
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)');
        console.log('✅ google_id column added');
        
        console.log('Adding facebook_id column...');
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(255)');
        console.log('✅ facebook_id column added');
        
        console.log('Adding avatar column...');
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(500)');
        console.log('✅ avatar column added');
        
        console.log('Adding reset_token column...');
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)');
        console.log('✅ reset_token column added');
        
        console.log('Adding reset_token_expiry column...');
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP');
        console.log('✅ reset_token_expiry column added');
        
        console.log('\n🎉 Migration completed successfully!');
        
        // Verify columns exist
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name IN ('google_id', 'facebook_id', 'avatar', 'reset_token', 'reset_token_expiry')
        `);
        
        console.log('\n📋 Verified columns:');
        result.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

runMigration();
