-- Migration: Add loyalty_points column to users table
-- This column tracks customer loyalty points

-- Add loyalty_points column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='loyalty_points') THEN
        ALTER TABLE users ADD COLUMN loyalty_points INTEGER DEFAULT 0;

        -- Update existing users to have 0 points
        UPDATE users SET loyalty_points = 0 WHERE loyalty_points IS NULL;

        RAISE NOTICE 'Column loyalty_points added successfully';
    ELSE
        RAISE NOTICE 'Column loyalty_points already exists';
    END IF;
END $$;

-- Display users table structure
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
