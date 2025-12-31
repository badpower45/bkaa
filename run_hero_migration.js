const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
    connectionString: 'postgresql://postgres.zthkavobhbomewjcmcrf:JKbEhEbnshXBGW9N@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=no-verify'
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Starting Hero Sections migration...');
        
        // Read the SQL file
        const sqlPath = path.join(__dirname, 'migrations', 'create_hero_sections.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Execute the migration
        await client.query(sql);
        
        console.log('✅ Hero Sections table created successfully!');
        
        // Verify the table was created
        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'hero_sections'
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ Table verified in database');
            
            // Get column count
            const columns = await client.query(`
                SELECT COUNT(*) as count 
                FROM information_schema.columns 
                WHERE table_name = 'hero_sections'
            `);
            console.log(`📊 Table has ${columns.rows[0].count} columns`);
        }
        
    } catch (error) {
        console.error('❌ Error running migration:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration()
    .then(() => {
        console.log('\n🎉 Migration completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Migration failed:', error);
        process.exit(1);
    });
