-- Add banner fields for categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_image TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_title TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_subtitle TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_type VARCHAR(20) DEFAULT 'display';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_action_url TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_button_text TEXT;
