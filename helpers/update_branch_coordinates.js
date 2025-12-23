/**
 * Extract coordinates from Google Maps links and update branches
 * Usage: node helpers/update_branch_coordinates.js
 */

const { query } = require('../database');
const axios = require('axios');

/**
 * Extract coordinates from Google Maps URL
 * Supports multiple formats
 */
function extractCoordinates(url) {
    if (!url) return null;

    // Pattern 1: ?q=lat,lng
    let match = url.match(/\?q=([-]?[0-9]+\.[0-9]+),([-]?[0-9]+\.[0-9]+)/);
    if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    }

    // Pattern 2: @lat,lng,zoom
    match = url.match(/@([-]?[0-9]+\.[0-9]+),([-]?[0-9]+\.[0-9]+),/);
    if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    }

    // Pattern 3: /place/.../@lat,lng
    match = url.match(/\/@([-]?[0-9]+\.[0-9]+),([-]?[0-9]+\.[0-9]+)/);
    if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    }

    return null;
}

/**
 * Resolve shortened Google Maps URL (goo.gl, maps.app.goo.gl)
 */
async function resolveShortUrl(shortUrl) {
    try {
        const response = await axios.get(shortUrl, {
            maxRedirects: 5,
            validateStatus: () => true // Accept any status
        });
        return response.request.res.responseUrl || shortUrl;
    } catch (error) {
        console.error(`Failed to resolve ${shortUrl}:`, error.message);
        return shortUrl;
    }
}

/**
 * Main function to update branch coordinates
 */
async function updateBranchCoordinates() {
    try {
        console.log('🗺️  Starting coordinate extraction...\n');

        // Get all branches
        const { rows: branches } = await query(
            'SELECT id, name, maps_link, location_lat, location_lng FROM branches ORDER BY id'
        );

        let updated = 0;
        let failed = 0;
        let skipped = 0;

        for (const branch of branches) {
            console.log(`\n📍 Processing: ${branch.name} (ID: ${branch.id})`);

            if (!branch.maps_link) {
                console.log('   ⚠️  No maps link found - SKIPPED');
                skipped++;
                continue;
            }

            let fullUrl = branch.maps_link;

            // Check if it's a short link
            if (fullUrl.includes('goo.gl') || fullUrl.includes('maps.app.goo.gl')) {
                console.log(`   🔗 Short link detected, resolving...`);
                fullUrl = await resolveShortUrl(fullUrl);
                console.log(`   ✅ Resolved to: ${fullUrl.substring(0, 60)}...`);
            }

            // Extract coordinates
            const coords = extractCoordinates(fullUrl);

            if (coords) {
                console.log(`   📌 Coordinates found: ${coords.lat}, ${coords.lng}`);

                // Update database
                await query(
                    `UPDATE branches 
                     SET location_lat = $1, location_lng = $2, maps_link = $3 
                     WHERE id = $4`,
                    [coords.lat, coords.lng, fullUrl, branch.id]
                );

                console.log(`   ✅ Updated successfully!`);
                updated++;
            } else {
                console.log(`   ❌ Failed to extract coordinates from URL`);
                console.log(`   URL: ${fullUrl}`);
                failed++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 Summary:');
        console.log(`   ✅ Updated: ${updated}`);
        console.log(`   ❌ Failed: ${failed}`);
        console.log(`   ⚠️  Skipped: ${skipped}`);
        console.log('='.repeat(60) + '\n');

        // Display final results
        console.log('📋 Final branch coordinates:\n');
        const { rows: finalBranches } = await query(
            'SELECT id, name, location_lat, location_lng FROM branches ORDER BY id'
        );

        finalBranches.forEach(b => {
            const status = b.location_lat && b.location_lng ? '✅' : '❌';
            const coords = b.location_lat && b.location_lng
                ? `${b.location_lat}, ${b.location_lng}`
                : 'No coordinates';
            console.log(`   ${status} ${b.name}: ${coords}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    updateBranchCoordinates();
}

module.exports = { extractCoordinates, resolveShortUrl, updateBranchCoordinates };
