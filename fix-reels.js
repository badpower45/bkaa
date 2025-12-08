import pool from './database.js';

async function fixReelsData() {
    try {
        console.log('🔧 Fixing facebook_reels data...\n');
        
        // 1. Remove Facebook embed URLs (they don't work due to tracking prevention)
        const updateResult = await pool.query(`
            UPDATE facebook_reels 
            SET video_url = NULL 
            WHERE video_url LIKE '%facebook.com%'
        `);
        console.log(`✅ Removed ${updateResult.rowCount} Facebook embed URLs`);
        
        // 2. Delete duplicate entries (keep only lowest ID for each title)
        const deleteResult = await pool.query(`
            DELETE FROM facebook_reels a
            USING facebook_reels b
            WHERE a.id > b.id AND a.title = b.title
        `);
        console.log(`✅ Removed ${deleteResult.rowCount} duplicate entries`);
        
        // 3. Show current data
        const result = await pool.query('SELECT id, title, video_url, facebook_url FROM facebook_reels ORDER BY id');
        console.log('\n📊 Current reels data:');
        result.rows.forEach(r => {
            console.log(`  ID ${r.id}: ${r.title}`);
            console.log(`    video_url: ${r.video_url || '(none)'}`);
            console.log(`    facebook_url: ${r.facebook_url}`);
        });
        
        console.log('\n✅ Done!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

fixReelsData();
