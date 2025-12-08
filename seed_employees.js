import bcrypt from 'bcryptjs';
import { query } from './database.js';

/**
 * Script to add test employees for customer service testing
 * Run with: node seed_employees.js
 */

const testUsers = [
    {
        name: 'أحمد محمود',
        email: 'employee@lumina.com',
        password: 'password123',
        role: 'employee'
    },
    {
        name: 'سارة أحمد',
        email: 'manager@lumina.com',
        password: 'password123',
        role: 'manager'
    },
    {
        name: 'محمد علي',
        email: 'admin@lumina.com',
        password: 'password123',
        role: 'admin'
    },
    {
        name: 'عميل تجريبي',
        email: 'customer@test.com',
        password: 'password123',
        role: 'customer'
    }
];

async function seedEmployees() {
    console.log('🌱 Starting employee seeding...\n');

    try {
        for (const user of testUsers) {
            // Hash password
            const hashedPassword = bcrypt.hashSync(user.password, 8);

            // Insert user
            const sql = `
                INSERT INTO users (name, email, password, role, loyalty_points, default_branch_id)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (email) DO UPDATE SET
                    name = EXCLUDED.name,
                    password = EXCLUDED.password,
                    role = EXCLUDED.role
                RETURNING id, name, email, role
            `;

            const { rows } = await query(sql, [
                user.name,
                user.email,
                hashedPassword,
                user.role,
                user.role === 'customer' ? 100 : 0,
                1 // default_branch_id
            ]);

            const created = rows[0];
            console.log(`✅ ${user.role.toUpperCase().padEnd(10)} | ${created.name.padEnd(20)} | ${created.email}`);
        }

        console.log('\n🎉 Employee seeding completed successfully!\n');
        console.log('📝 Test Accounts Created:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Role       | Email                | Password');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Employee   | employee@lumina.com  | password123');
        console.log('Manager    | manager@lumina.com   | password123');
        console.log('Admin      | admin@lumina.com     | password123');
        console.log('Customer   | customer@test.com    | password123');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n🚀 You can now login with any of these accounts!\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding employees:', error);
        process.exit(1);
    }
}

seedEmployees();
