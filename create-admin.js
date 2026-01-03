import bcrypt from 'bcryptjs';
import pkg from 'pg';
const { Pool } = pkg;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const createAdmin = async () => {
    try {
        // بيانات حساب الأدمن - غيرهم حسب رغبتك
        const adminData = {
            name: 'Admin',
            email: 'admin@allosh.com',
            password: 'admin123456',  // غير الباسورد بعد أول تسجيل دخول
            phone: '01000000000',
            role: 'admin'
        };

        // Hash password
        const hashedPassword = bcrypt.hashSync(adminData.password, 8);

        // Check if admin already exists
        const existingAdmin = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [adminData.email]
        );

        if (existingAdmin.rows.length > 0) {
            console.log('⚠️  Admin user already exists with email:', adminData.email);
            console.log('✅ Admin ID:', existingAdmin.rows[0].id);
            
            // Update to admin role if needed
            await pool.query(
                'UPDATE users SET role = $1 WHERE email = $2',
                ['admin', adminData.email]
            );
            console.log('✅ Role updated to admin');
        } else {
            // Create new admin user
            const result = await pool.query(
                `INSERT INTO users (name, email, password, phone, role, loyalty_points) 
                 VALUES ($1, $2, $3, $4, $5, 0) 
                 RETURNING id, name, email, role`,
                [adminData.name, adminData.email, hashedPassword, adminData.phone, adminData.role]
            );

            console.log('✅ Admin user created successfully!');
            console.log('📧 Email:', adminData.email);
            console.log('🔑 Password:', adminData.password);
            console.log('👤 User ID:', result.rows[0].id);
            console.log('\n⚠️  IMPORTANT: Change the password after first login!');
        }

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        process.exit(1);
    }
};

createAdmin();
