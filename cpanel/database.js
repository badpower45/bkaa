const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load .env from server directory
dotenv.config({ path: path.join(__dirname, '.env'), override: false });

// Debug: Check if .env is loaded correctly
console.log('🔍 DEBUG - Environment Variables:');
console.log('  Loading .env from:', path.join(__dirname, '.env'));
console.log('  DB_HOST from env:', process.env.DB_HOST);
console.log('  DB_USER from env:', process.env.DB_USER);
console.log('  DB_PORT from env:', process.env.DB_PORT);

// PostgreSQL Connection Pool - Supabase
const connectionString = process.env.DATABASE_URL;

const poolConfig = connectionString
    ? {
        connectionString,
        ssl: { rejectUnauthorized: false }, // Required for Supabase
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
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

console.log('🔌 Attempting to connect to Supabase database...');
if (connectionString) {
    console.log('Using DATABASE_URL:', connectionString.replace(/:[^:@]*@/, ':****@'));
} else {
    console.log('Using Connection Params:');
    console.log('  Host:', poolConfig.host);
    console.log('  User:', poolConfig.user);
    console.log('  Port:', poolConfig.port);
    console.log('  Database:', poolConfig.database);
    console.log('  SSL:', poolConfig.ssl ? 'Enabled' : 'Disabled');
}

const pool = new Pool(poolConfig);

// Handle pool errors
pool.on('error', (err, client) => {
    console.error('❌ Unexpected error on idle client:', err.message);
});

// Handle process errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err.message);
});

// Test connection with retry
const testConnection = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const client = await pool.connect();
            const result = await client.query('SELECT NOW()');
            client.release();
            console.log('✅ Connected to Supabase PostgreSQL:', result.rows[0].now);
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
const query = (text, params) => pool.query(text, params);

module.exports = pool;
module.exports.query = query;
