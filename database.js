import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory; do NOT override existing env vars (CLI values should win)
dotenv.config({ path: path.join(__dirname, '.env'), override: false });

// Debug: Check if .env is loaded correctly
console.log('🔍 DEBUG - Environment Variables:');
console.log('  Loading .env from:', path.join(__dirname, '.env'));
console.log('  DB_HOST from env:', process.env.DB_HOST);
console.log('  DB_USER from env:', process.env.DB_USER);
console.log('  DB_PORT from env:', process.env.DB_PORT);

// PostgreSQL Connection Pool
const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL;

const poolConfig = connectionString
    ? {
        connectionString,
        ssl: { rejectUnauthorized: false }, // Required for Supabase
        max: 10, // Max connections
        idleTimeoutMillis: 30000, // Close idle connections after 30s
        connectionTimeoutMillis: 10000, // Connection timeout 10s
    }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'lumina_fresh_market',
        password: process.env.DB_PASSWORD || 'postgres',
        port: process.env.DB_PORT || 5432,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };

console.log('🔌 Attempting to connect to database...');
if (connectionString) {
    console.log('Using DATABASE_URL:', connectionString.replace(/:[^:@]*@/, ':****@')); // Mask password
} else {
    console.log('Using Connection Params:');
    console.log('  Host:', poolConfig.host);
    console.log('  User:', poolConfig.user);
    console.log('  Port:', poolConfig.port);
    console.log('  Database:', poolConfig.database);
    console.log('  SSL:', poolConfig.ssl ? 'Enabled' : 'Disabled');
}

const pool = new Pool(poolConfig);

// Handle pool errors - Don't crash the server
pool.on('error', (err, client) => {
    console.error('❌ Unexpected error on idle client:', err.message);
    // Don't crash - pool will automatically remove the broken client
});

// Handle process-level unhandled rejections to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't crash - just log
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err.message);
    // For critical errors, we might want to restart gracefully
    // but for now, just log and continue
});

// Test the connection with retry
const testConnection = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const client = await pool.connect();
            const result = await client.query('SELECT NOW()');
            client.release();
            console.log('✅ Connected to PostgreSQL database:', result.rows[0].now);
            return true;
        } catch (err) {
            console.error(`❌ Connection attempt ${i + 1}/${retries} failed:`, err.message);
            if (i < retries - 1) {
                console.log('⏳ Retrying in 2 seconds...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    console.error('❌ Could not connect to database after', retries, 'attempts');
    return false;
};

testConnection();

// Helper function to query the database
export const query = (text, params) => pool.query(text, params);

// Export the pool for direct access if needed
export default pool;
