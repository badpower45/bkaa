-- Migration: Enhanced User Registration System
-- Created: 2025-12-24
-- Purpose: Add comprehensive user fields for email, Google, and Facebook registration

-- Add new columns to users table
DO $$ 
BEGIN
    -- Split name into first_name and last_name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'first_name') THEN
        ALTER TABLE users ADD COLUMN first_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_name') THEN
        ALTER TABLE users ADD COLUMN last_name TEXT;
    END IF;
    
    -- Phone number (required)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
        ALTER TABLE users ADD COLUMN phone VARCHAR(20);
    END IF;
    
    -- Birth date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'birth_date') THEN
        ALTER TABLE users ADD COLUMN birth_date DATE;
    END IF;
    
    -- OAuth provider IDs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'google_id') THEN
        ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'facebook_id') THEN
        ALTER TABLE users ADD COLUMN facebook_id VARCHAR(255) UNIQUE;
    END IF;
    
    -- Avatar/Profile picture URL
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'avatar') THEN
        ALTER TABLE users ADD COLUMN avatar TEXT;
    END IF;
    
    -- Wallet balance (for loyalty system)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'wallet_balance') THEN
        ALTER TABLE users ADD COLUMN wallet_balance DECIMAL(10, 2) DEFAULT 0;
    END IF;
    
    -- Password reset fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'reset_token') THEN
        ALTER TABLE users ADD COLUMN reset_token TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'reset_token_expiry') THEN
        ALTER TABLE users ADD COLUMN reset_token_expiry TIMESTAMP;
    END IF;
    
    -- Profile completion status (useful for OAuth users)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profile_completed') THEN
        ALTER TABLE users ADD COLUMN profile_completed BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Created at timestamp
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'created_at') THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Migrate existing 'name' to first_name if data exists
DO $$
BEGIN
    -- Copy existing name to first_name if first_name is empty
    UPDATE users 
    SET first_name = name 
    WHERE first_name IS NULL AND name IS NOT NULL;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id) WHERE facebook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Add comments
COMMENT ON COLUMN users.first_name IS 'الاسم الأول';
COMMENT ON COLUMN users.last_name IS 'الاسم الأخير';
COMMENT ON COLUMN users.phone IS 'رقم الهاتف';
COMMENT ON COLUMN users.birth_date IS 'تاريخ الميلاد';
COMMENT ON COLUMN users.google_id IS 'معرف Google للـ OAuth';
COMMENT ON COLUMN users.facebook_id IS 'معرف Facebook للـ OAuth';
COMMENT ON COLUMN users.avatar IS 'صورة الملف الشخصي';
COMMENT ON COLUMN users.profile_completed IS 'هل اكتملت البيانات الأساسية';
