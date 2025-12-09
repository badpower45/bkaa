-- Add new columns to branches table for enhanced functionality
ALTER TABLE branches ADD COLUMN IF NOT EXISTS name_ar TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS google_maps_link TEXT;

-- Update existing columns if they don't match the new naming
-- Rename maps_link to google_maps_link if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'maps_link') THEN
        ALTER TABLE branches RENAME COLUMN maps_link TO google_maps_link;
    END IF;
END $$;

-- Make phone and address fields if they don't exist (they should from schema.sql)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address TEXT;

-- Rename location columns to match the code
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'location_lat') THEN
        ALTER TABLE branches RENAME COLUMN location_lat TO latitude;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'location_lng') THEN
        ALTER TABLE branches RENAME COLUMN location_lng TO longitude;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'coverage_radius_km') THEN
        ALTER TABLE branches RENAME COLUMN coverage_radius_km TO delivery_radius;
    END IF;
END $$;

-- Make latitude and longitude nullable since they're optional
ALTER TABLE branches ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE branches ALTER COLUMN longitude DROP NOT NULL;

-- Add index for active branches
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);

COMMENT ON COLUMN branches.name_ar IS 'Arabic name for the branch';
COMMENT ON COLUMN branches.google_maps_link IS 'Google Maps link for the branch location';
COMMENT ON COLUMN branches.latitude IS 'Optional: Latitude coordinate for location (for future use)';
COMMENT ON COLUMN branches.longitude IS 'Optional: Longitude coordinate for location (for future use)';
