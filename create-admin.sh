#!/bin/bash

# Script to create admin user directly in database

echo "🔐 Creating Admin User..."
echo "=========================="

# تأكد من وجود DATABASE_URL في environment
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL is not set"
    echo "Please set DATABASE_URL environment variable"
    exit 1
fi

# تنفيذ الـ SQL
psql "$DATABASE_URL" << EOF
-- إضافة حساب الأدمن
INSERT INTO users (name, email, password, phone, role, loyalty_points, created_at)
VALUES (
    'Admin Allosh',
    'admin@allosh.com',
    '\$2a\$08\$joA4vptfyM3XHNlBLeCA6e2v2QVr1NK1AepnMWXoUgZlXOotOPauK',
    '01000000000',
    'admin',
    0,
    NOW()
)
ON CONFLICT (email) 
DO UPDATE SET 
    role = 'admin',
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    password = EXCLUDED.password;

-- عرض بيانات الأدمن
SELECT id, name, email, role, created_at 
FROM users 
WHERE email = 'admin@allosh.com';
EOF

echo ""
echo "✅ Admin user created successfully!"
echo "📧 Email: admin@allosh.com"
echo "🔑 Password: admin123456"
echo ""
echo "⚠️  IMPORTANT: Change the password after first login!"
