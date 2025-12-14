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

// Ensure sslmode=no-verify is always present for Supabase to bypass self-signed chains
const normalizeConnectionString = (raw) => {
    if (!raw) return raw;
    if (raw.includes('sslmode=')) return raw;
    const separator = raw.includes('?') ? '&' : '?';
    return `${raw}${separator}sslmode=no-verify`;
};

const connectionString = normalizeConnectionString(process.env.DATABASE_URL);

const poolConfig = connectionString
    ? {
        connectionString,
        ssl: { rejectUnauthorized: false }, // Required for Supabase
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        max: 1, // ⚠️ CRITICAL for serverless: Only 1 connection
        min: 0,
        idleTimeoutMillis: 10000, // Close idle connections quickly
        connectionTimeoutMillis: 5000,
        allowExitOnIdle: true, // Allow pool to close when idle
    }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'lumina_fresh_market',
        password: process.env.DB_PASSWORD || 'postgres',
        port: process.env.DB_PORT || 5432,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 1,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000,
        allowExitOnIdle: true,
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

// Test the connection with retry (non-blocking for serverless)
const testConnection = async (retries = 2) => {
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
                console.log('⏳ Retrying in 1 second...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    console.error('⚠️ Initial connection failed - will retry on first query');
    return false;
};

// Don't await - run in background to avoid blocking serverless startup
if (!isProduction) {
    testConnection();
}

// Helper function with automatic retry
export const query = async (text, params, retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await pool.query(text, params);
            return result;
        } catch (err) {
            const shouldRetry = (
                (err.code === 'ECONNRESET' || 
                 err.code === 'ETIMEDOUT' ||
                 err.code === 'XX000' || // Circuit breaker
                 err.message?.includes('Connection terminated') ||
                 err.message?.includes('Circuit breaker') ||
                 err.message?.includes('connection timeout')) &&
                attempt < retries
            );
            
            if (shouldRetry) {
                console.log(`🔄 Query retry ${attempt + 1}/${retries} after error:`, err.message);
                await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
                continue;
            }
            throw err;
        }
    }
};

// Graceful shutdown - close all connections
export const closePool = async () => {
    try {
        await pool.end();
        console.log('✅ Database pool closed successfully');
    } catch (err) {
        console.error('❌ Error closing database pool:', err);
    }
};

// Handle process termination
process.on('SIGTERM', async () => {
    console.log('🔴 SIGTERM received, closing database connections...');
    await closePool();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🔴 SIGINT received, closing database connections...');
    await closePool();
    process.exit(0);
});

// Export the pool for direct access if needed
export default pool;
