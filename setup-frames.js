import { query } from './database.js';

async function setupFramesTables() {
    try {
        console.log('🔧 Setting up product frames tables...');
        
        // 1. Create product_frames table
        await query(`
            CREATE TABLE IF NOT EXISTS product_frames (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                name_ar VARCHAR(100),
                description TEXT,
                frame_url TEXT NOT NULL,
                preview_url TEXT,
                category VARCHAR(50) DEFAULT 'general',
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ product_frames table created/verified');
        
        // 2. Add frame columns to products table
        await query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'frame_overlay_url'
                ) THEN
                    ALTER TABLE products ADD COLUMN frame_overlay_url TEXT;
                    RAISE NOTICE 'Added column frame_overlay_url';
                END IF;
                
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'frame_enabled'
                ) THEN
                    ALTER TABLE products ADD COLUMN frame_enabled BOOLEAN DEFAULT false;
                    RAISE NOTICE 'Added column frame_enabled';
                END IF;
            END $$;
        `);
        console.log('✅ Products table columns verified');
        
        // 3. Create index
        await query(`
            CREATE INDEX IF NOT EXISTS idx_products_frame_enabled 
            ON products(frame_enabled) WHERE frame_enabled = true;
        `);
        console.log('✅ Index created');
        
        // 4. Check frames count
        const framesResult = await query('SELECT COUNT(*) FROM product_frames');
        console.log(`📊 Total frames in database: ${framesResult.rows[0].count}`);
        
        // 5. List all frames
        const allFrames = await query('SELECT id, name, name_ar, frame_url, category FROM product_frames ORDER BY created_at DESC LIMIT 20');
        console.log('\n📋 All frames:');
        if (allFrames.rows.length === 0) {
            console.log('  (No frames found)');
        } else {
            allFrames.rows.forEach(frame => {
                console.log(`  - ID: ${frame.id} | ${frame.name} (${frame.name_ar}) | ${frame.category}`);
                console.log(`    URL: ${frame.frame_url}`);
            });
        }
        
        console.log('\n✅ Setup complete!');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error setting up tables:', error);
        process.exit(1);
    }
}

setupFramesTables();
