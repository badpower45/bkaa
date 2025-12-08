-- Script to add test employees for customer service testing
-- Run this to create test accounts with different roles

-- Password for all test accounts: "password123"
-- Hashed with bcrypt (8 rounds): $2a$08$vVqT7aY8Nqe6Xh9Ev7IWC.YqJmqmQr5f5ZLnX2lCPQvKb4nVjW8Zu

-- 1. Customer Service Employee
INSERT INTO users (name, email, password, role, loyalty_points, default_branch_id)
VALUES (
    'أحمد محمود',
    'employee@lumina.com',
    '$2a$08$vVqT7aY8Nqe6Xh9Ev7IWC.YqJmqmQr5f5ZLnX2lCPQvKb4nVjW8Zu',
    'employee',
    0,
    1
) ON CONFLICT (email) DO NOTHING;

-- 2. Manager
INSERT INTO users (name, email, password, role, loyalty_points, default_branch_id)
VALUES (
    'سارة أحمد',
    'manager@lumina.com',
    '$2a$08$vVqT7aY8Nqe6Xh9Ev7IWC.YqJmqmQr5f5ZLnX2lCPQvKb4nVjW8Zu',
    'manager',
    0,
    1
) ON CONFLICT (email) DO NOTHING;

-- 3. Admin
INSERT INTO users (name, email, password, role, loyalty_points, default_branch_id)
VALUES (
    'محمد علي',
    'admin@lumina.com',
    '$2a$08$vVqT7aY8Nqe6Xh9Ev7IWC.YqJmqmQr5f5ZLnX2lCPQvKb4nVjW8Zu',
    'admin',
    0,
    1
) ON CONFLICT (email) DO NOTHING;

-- 4. Test Customer
INSERT INTO users (name, email, password, role, loyalty_points, default_branch_id)
VALUES (
    'عميل تجريبي',
    'customer@test.com',
    '$2a$08$vVqT7aY8Nqe6Xh9Ev7IWC.YqJmqmQr5f5ZLnX2lCPQvKb4nVjW8Zu',
    'customer',
    100,
    1
) ON CONFLICT (email) DO NOTHING;

-- Display created accounts
SELECT id, name, email, role FROM users WHERE email IN (
    'employee@lumina.com',
    'manager@lumina.com',
    'admin@lumina.com',
    'customer@test.com'
);
