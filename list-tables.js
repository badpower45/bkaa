import pool from './database.js';

async function listTables() {
    try {
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        console.log('📊 All Tables in Database:\n');
        result.rows.forEach((t, i) => console.log(`${i + 1}. ${t.table_name}`));
        console.log(`\n✅ Total: ${result.rows.length} tables`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

listTables();
