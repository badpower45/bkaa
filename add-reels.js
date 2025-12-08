import pool from './database.js';

const reels = [
    {
        title: 'شوكولاتة فاخرة 🔥',
        thumbnail_url: 'https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=400&h=700&fit=crop',
        facebook_url: 'https://www.facebook.com/alloshmarket',
        views_count: '12K',
        duration: '0:30',
        display_order: 2
    },
    {
        title: 'عروض حصرية 🔥',
        thumbnail_url: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=700&fit=crop',
        facebook_url: 'https://www.facebook.com/alloshmarket',
        views_count: '8.5K',
        duration: '0:25',
        display_order: 3
    },
    {
        title: 'منتجات الألبان الطازجة 🥛',
        thumbnail_url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&h=700&fit=crop',
        facebook_url: 'https://www.facebook.com/alloshmarket',
        views_count: '15K',
        duration: '0:20',
        display_order: 4
    },
    {
        title: 'فواكه وخضروات طازجة 🥕',
        thumbnail_url: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&h=700&fit=crop',
        facebook_url: 'https://www.facebook.com/alloshmarket',
        views_count: '9.2K',
        duration: '0:35',
        display_order: 5
    },
    {
        title: 'مشروبات منعشة 🍹',
        thumbnail_url: 'https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=400&h=700&fit=crop',
        facebook_url: 'https://www.facebook.com/alloshmarket',
        views_count: '11K',
        duration: '0:40',
        display_order: 6
    }
];

async function addReels() {
    try {
        console.log('Adding Facebook reels to database...');
        
        for (const reel of reels) {
            const result = await pool.query(
                `INSERT INTO facebook_reels (title, thumbnail_url, facebook_url, views_count, duration, is_active, display_order) 
                 VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING id`,
                [reel.title, reel.thumbnail_url, reel.facebook_url, reel.views_count, reel.duration, reel.display_order]
            );
            console.log(`✅ Added reel ID: ${result.rows[0].id} - ${reel.title}`);
        }
        
        // Show total count
        const countResult = await pool.query('SELECT COUNT(*) FROM facebook_reels WHERE is_active = true');
        console.log(`\n📊 Total active reels: ${countResult.rows[0].count}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

addReels();
