import pool from './database.js';
import fs from 'fs';

async function exportSchema() {
    try {
        console.log('🔄 Exporting database schema...\n');
        
        // Get all tables
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        let sqlOutput = `-- =============================================
-- ALLOSH MARKET - Complete Database Schema
-- Generated: ${new Date().toISOString()}
-- Database: Supabase PostgreSQL
-- =============================================

`;
        
        for (const table of tablesResult.rows) {
            const tableName = table.table_name;
            console.log(`📋 Processing: ${tableName}`);
            
            // Get columns for this table
            const columnsResult = await pool.query(`
                SELECT 
                    column_name,
                    data_type,
                    character_maximum_length,
                    column_default,
                    is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
                ORDER BY ordinal_position
            `, [tableName]);
            
            // Get primary key
            const pkResult = await pool.query(`
                SELECT a.attname
                FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                WHERE i.indrelid = $1::regclass AND i.indisprimary
            `, [tableName]);
            
            const primaryKey = pkResult.rows.map(r => r.attname);
            
            // Build CREATE TABLE statement
            sqlOutput += `-- =============================================
-- Table: ${tableName}
-- =============================================
CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
            
            const columnDefs = columnsResult.rows.map(col => {
                let def = `    ${col.column_name} `;
                
                // Data type
                if (col.data_type === 'character varying') {
                    def += `VARCHAR(${col.character_maximum_length || 255})`;
                } else if (col.data_type === 'integer') {
                    def += 'INTEGER';
                } else if (col.data_type === 'bigint') {
                    def += 'BIGINT';
                } else if (col.data_type === 'boolean') {
                    def += 'BOOLEAN';
                } else if (col.data_type === 'text') {
                    def += 'TEXT';
                } else if (col.data_type === 'numeric') {
                    def += 'DECIMAL(10,2)';
                } else if (col.data_type === 'timestamp with time zone') {
                    def += 'TIMESTAMP WITH TIME ZONE';
                } else if (col.data_type === 'timestamp without time zone') {
                    def += 'TIMESTAMP';
                } else if (col.data_type === 'date') {
                    def += 'DATE';
                } else if (col.data_type === 'json' || col.data_type === 'jsonb') {
                    def += 'JSONB';
                } else if (col.data_type === 'ARRAY') {
                    def += 'TEXT[]';
                } else {
                    def += col.data_type.toUpperCase();
                }
                
                // Default value
                if (col.column_default) {
                    if (col.column_default.includes('nextval')) {
                        def = `    ${col.column_name} SERIAL`;
                    } else {
                        def += ` DEFAULT ${col.column_default}`;
                    }
                }
                
                // Not null
                if (col.is_nullable === 'NO' && !col.column_default?.includes('nextval')) {
                    def += ' NOT NULL';
                }
                
                // Primary key
                if (primaryKey.includes(col.column_name) && primaryKey.length === 1) {
                    def += ' PRIMARY KEY';
                }
                
                return def;
            });
            
            sqlOutput += columnDefs.join(',\n');
            sqlOutput += '\n);\n\n';
        }
        
        // Add RLS policies section
        sqlOutput += `
-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

-- Orders policy
CREATE POLICY "Users can view own orders" ON orders
    FOR SELECT USING (auth.uid()::text = user_id::text);

-- Cart policy
CREATE POLICY "Users can manage own cart" ON cart
    FOR ALL USING (auth.uid()::text = user_id::text);

-- Favorites policy
CREATE POLICY "Users can manage own favorites" ON favorites
    FOR ALL USING (auth.uid()::text = user_id::text);

-- Public read access for products, categories, branches
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Public read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Public read branches" ON branches FOR SELECT USING (true);
CREATE POLICY "Public read facebook_reels" ON facebook_reels FOR SELECT USING (is_active = true);
`;
        
        // Save to file
        fs.writeFileSync('../supabase/complete_schema.sql', sqlOutput);
        console.log('\n✅ Schema exported to: supabase/complete_schema.sql');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

exportSchema();
