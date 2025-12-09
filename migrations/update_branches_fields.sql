-- Add new columns to branches table for enhanced functionality
ALTER TABLE branches ADD COLUMN IF NOT EXISTS name_ar TEXT;

-- Handle google_maps_link column (check if maps_link exists first)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'maps_link') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'google_maps_link') THEN
        ALTER TABLE branches RENAME COLUMN maps_link TO google_maps_link;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'google_maps_link') THEN
        ALTER TABLE branches ADD COLUMN google_maps_link TEXT;
    END IF;
END $$;

-- Make phone and address fields if they don't exist (they should from schema.sql)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address TEXT;

-- Rename location columns to match the code
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'location_lat') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'latitude') THEN
        ALTER TABLE branches RENAME COLUMN location_lat TO latitude;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'latitude') THEN
        ALTER TABLE branches ADD COLUMN latitude DOUBLE PRECISION;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'location_lng') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'longitude') THEN
        ALTER TABLE branches RENAME COLUMN location_lng TO longitude;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'longitude') THEN
        ALTER TABLE branches ADD COLUMN longitude DOUBLE PRECISION;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'coverage_radius_km') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'delivery_radius') THEN
        ALTER TABLE branches RENAME COLUMN coverage_radius_km TO delivery_radius;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'delivery_radius') THEN
        ALTER TABLE branches ADD COLUMN delivery_radius DOUBLE PRECISION DEFAULT 10;
    END IF;
END $$;

-- Make latitude and longitude nullable since they're optional
DO $$
BEGIN
    ALTER TABLE branches ALTER COLUMN latitude DROP NOT NULL;
EXCEPTION
    WHEN OTHERS THEN NULL; -- Ignore if column doesn't have NOT NULL constraint
END $$;

DO $$
BEGIN
    ALTER TABLE branches ALTER COLUMN longitude DROP NOT NULL;
EXCEPTION
    WHEN OTHERS THEN NULL; -- Ignore if column doesn't have NOT NULL constraint
END $$;

-- Add index for active branches
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);

COMMENT ON COLUMN branches.name_ar IS 'Arabic name for the branch';
COMMENT ON COLUMN branches.google_maps_link IS 'Google Maps link for the branch location';
COMMENT ON COLUMN branches.latitude IS 'Optional: Latitude coordinate for location (for future use)';
COMMENT ON COLUMN branches.longitude IS 'Optional: Longitude coordinate for location (for future use)';
