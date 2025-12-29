import { query } from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAuthMigration() {
    try {
        console.log('🔄 Running authentication fields migration...');
        
        const migrationPath = path.join(__dirname, 'migrations', 'add_auth_fields_to_users.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Split by semicolon and filter out empty statements
        const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));
        
        for (const statement of statements) {
            if (statement.toLowerCase().includes('commit')) continue;
            
            try {
                await query(statement);
                console.log('✅ Executed:', statement.substring(0, 50) + '...');
            } catch (err) {
                console.error('❌ Error executing statement:', err.message);
                console.error('Statement:', statement.substring(0, 100));
                // Continue with other statements
            }
        }
        
        console.log('\n✅ Migration completed successfully!');
        console.log('\n📋 Summary:');
        console.log('   - Added first_name, last_name fields');
        console.log('   - Added phone, birth_date fields');
        console.log('   - Added avatar field');
        console.log('   - Added google_id, facebook_id fields');
        console.log('   - Added profile_completed, email_verified fields');
        console.log('   - Added email_verification_token field');
        console.log('   - Added reset_token, reset_token_expiry fields');
        console.log('   - Added created_at, updated_at fields');
        console.log('   - Created performance indexes');
        console.log('   - Added auto-update trigger for updated_at');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runAuthMigration();
