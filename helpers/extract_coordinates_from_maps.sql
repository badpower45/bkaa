-- Helper function to extract coordinates from Google Maps links
-- This script updates branches table with coordinates from Google Maps links

-- Function to extract lat/lng from Google Maps URL
-- Supports formats:
-- 1. https://maps.app.goo.gl/... (short link - needs to be resolved)
-- 2. https://www.google.com/maps?q=30.123,31.456
-- 3. https://www.google.com/maps/@30.123,31.456,15z
-- 4. https://www.google.com/maps/place/.../@30.123,31.456,15z

-- Note: For short links (goo.gl), you need to resolve them first to get the full URL
-- This can be done via HTTP request or manually

-- Step 1: Create a temporary function to parse coordinates
CREATE OR REPLACE FUNCTION extract_coords_from_url(url TEXT)
RETURNS TABLE(lat DECIMAL(10,8), lng DECIMAL(11,8)) AS $$
DECLARE
    coords_text TEXT;
    lat_val DECIMAL(10,8);
    lng_val DECIMAL(11,8);
BEGIN
    -- Pattern 1: ?q=lat,lng
    IF url ~ '\?q=[-]?[0-9]+\.[0-9]+,[-]?[0-9]+\.[0-9]+' THEN
        coords_text := substring(url from '\?q=([-]?[0-9]+\.[0-9]+,[-]?[0-9]+\.[0-9]+)');
        lat_val := split_part(coords_text, ',', 1)::DECIMAL(10,8);
        lng_val := split_part(coords_text, ',', 2)::DECIMAL(11,8);
        RETURN QUERY SELECT lat_val, lng_val;
        RETURN;
    END IF;
    
    -- Pattern 2: @lat,lng,zoom
    IF url ~ '@[-]?[0-9]+\.[0-9]+,[-]?[0-9]+\.[0-9]+,[0-9]+' THEN
        coords_text := substring(url from '@([-]?[0-9]+\.[0-9]+,[-]?[0-9]+\.[0-9]+),[0-9]+');
        lat_val := split_part(coords_text, ',', 1)::DECIMAL(10,8);
        lng_val := split_part(coords_text, ',', 2)::DECIMAL(11,8);
        RETURN QUERY SELECT lat_val, lng_val;
        RETURN;
    END IF;
    
    -- Pattern 3: /place/.../@lat,lng
    IF url ~ '/@[-]?[0-9]+\.[0-9]+,[-]?[0-9]+\.[0-9]+' THEN
        coords_text := substring(url from '/@([-]?[0-9]+\.[0-9]+,[-]?[0-9]+\.[0-9]+)');
        lat_val := split_part(coords_text, ',', 1)::DECIMAL(10,8);
        lng_val := split_part(coords_text, ',', 2)::DECIMAL(11,8);
        RETURN QUERY SELECT lat_val, lng_val;
        RETURN;
    END IF;
    
    -- No match found
    RETURN QUERY SELECT NULL::DECIMAL(10,8), NULL::DECIMAL(11,8);
END;
$$ LANGUAGE plpgsql;

-- Step 2: Update branches with coordinates from maps_link
UPDATE branches
SET 
    location_lat = coords.lat,
    location_lng = coords.lng
FROM (
    SELECT 
        id,
        (extract_coords_from_url(maps_link)).lat as lat,
        (extract_coords_from_url(maps_link)).lng as lng
    FROM branches
    WHERE maps_link IS NOT NULL AND maps_link != ''
) as coords
WHERE branches.id = coords.id
  AND coords.lat IS NOT NULL 
  AND coords.lng IS NOT NULL;

-- Step 3: Show results
SELECT 
    id,
    name,
    maps_link,
    location_lat,
    location_lng,
    CASE 
        WHEN location_lat IS NOT NULL THEN '✅ Coordinates extracted'
        WHEN maps_link IS NULL OR maps_link = '' THEN '⚠️ No maps link'
        ELSE '❌ Failed to extract (check URL format)'
    END as status
FROM branches
ORDER BY id;

-- Step 4: Drop the temporary function (optional - keep it if you need it later)
-- DROP FUNCTION IF EXISTS extract_coords_from_url(TEXT);

-- ============================================
-- Manual Update Examples (if automatic extraction fails)
-- ============================================

-- Example 1: Update specific branch by ID
-- UPDATE branches 
-- SET location_lat = 30.0444196, location_lng = 31.2357116
-- WHERE id = 1;

-- Example 2: Update by name
-- UPDATE branches 
-- SET 
--     location_lat = 30.0444196, 
--     location_lng = 31.2357116,
--     maps_link = 'https://www.google.com/maps/@30.0444196,31.2357116,15z'
-- WHERE name = 'الفرع الرئيسي';

-- ============================================
-- How to get coordinates from short links manually:
-- ============================================
-- 1. Open the short link (https://maps.app.goo.gl/...) in browser
-- 2. Copy the full URL from address bar
-- 3. Extract coordinates from the full URL
-- 4. Update the maps_link column with the full URL
-- 
-- Example:
-- Short link: https://maps.app.goo.gl/abc123
-- Full URL: https://www.google.com/maps/place/.../@30.0444196,31.2357116,15z
-- Coordinates: 30.0444196, 31.2357116
