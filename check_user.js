import { query } from './database.js';
import bcrypt from 'bcryptjs';

async function checkUser() {
    try {
        const email = 'bodbod531@outlook.com';
        
        console.log('🔍 Checking user:', email);
        
        // Check if user exists
        const result = await query('SELECT id, name, email, role, password FROM users WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
            console.log('❌ User not found!');
            console.log('\n💡 Creating user with password: 13572468');
            
            const hashedPassword = bcrypt.hashSync('13572468', 12);
            
            const insertResult = await query(
                'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
                ['Bod Bod', email, hashedPassword, 'customer']
            );
            
            console.log('✅ User created:', insertResult.rows[0]);
        } else {
            const user = result.rows[0];
            console.log('\n✅ User found:');
            console.log('   ID:', user.id);
            console.log('   Name:', user.name);
            console.log('   Email:', user.email);
            console.log('   Role:', user.role);
            
            // Test password
            const password = '13572468';
            const passwordIsValid = bcrypt.compareSync(password, user.password);
            
            console.log('\n🔐 Password test:');
            console.log('   Input password:', password);
            console.log('   Valid:', passwordIsValid ? '✅ YES' : '❌ NO');
            
            if (!passwordIsValid) {
                console.log('\n💡 Resetting password to: 13572468');
                const hashedPassword = bcrypt.hashSync('13572468', 12);
                await query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
                console.log('✅ Password reset complete!');
            }
        }
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

checkUser();
