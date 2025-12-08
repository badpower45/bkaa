import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    try {
        console.log('🔄 Running distribution columns migration...');
        
        const sqlPath = path.join(__dirname, 'migrations', 'add_missing_distribution_columns.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Split by semicolons but keep the DO $$ blocks together
        const statements = [];
        let currentStatement = '';
        let inDollarBlock = false;
        
        for (const line of sql.split('\n')) {
            const trimmedLine = line.trim();
            
            // Track if we're inside a $$ block
            if (trimmedLine.includes('DO $$') || trimmedLine.includes('$$;')) {
                if (trimmedLine.includes('DO $$')) {
                    inDollarBlock = true;
                }
                if (trimmedLine.includes('$$;')) {
                    currentStatement += line + '\n';
                    statements.push(currentStatement.trim());
                    currentStatement = '';
                    inDollarBlock = false;
                    continue;
                }
            }
            
            currentStatement += line + '\n';
            
            // If not in a $$ block and line ends with semicolon, end statement
            if (!inDollarBlock && trimmedLine.endsWith(';') && !trimmedLine.includes('$$')) {
                statements.push(currentStatement.trim());
                currentStatement = '';
            }
        }
        
        // Execute each statement
        for (const statement of statements) {
            if (statement.trim() && !statement.startsWith('--')) {
                try {
                    const result = await query(statement);
                    if (result.rows && result.rows.length > 0) {
                        console.log('📊 Query result:', result.rows);
                    }
                    console.log('✅ Statement executed successfully');
                } catch (err) {
                    console.log('⚠️ Statement error (may be expected):', err.message);
                }
            }
        }
        
        console.log('\n✅ Migration completed!');
        
        // Verify columns
        console.log('\n📋 Checking order_assignments columns:');
        const cols = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'order_assignments' 
            ORDER BY ordinal_position
        `);
        console.log(cols.rows);
        
        console.log('\n📋 Checking delivery_staff columns:');
        const staffCols = await query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'delivery_staff' 
            ORDER BY ordinal_position
        `);
        console.log(staffCols.rows);
        
        setTimeout(() => process.exit(0), 500);
    } catch (e) {
        console.error('❌ Migration failed:', e.message);
        setTimeout(() => process.exit(1), 500);
    }
}

runMigration();
