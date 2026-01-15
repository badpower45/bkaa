import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Setup frames tables endpoint (admin only, one-time use)
router.post('/setup', verifyToken, isAdmin, async (req, res) => {
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
        
        // 2. Add frame columns to products table
        await query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'frame_overlay_url'
                ) THEN
                    ALTER TABLE products ADD COLUMN frame_overlay_url TEXT;
                END IF;
                
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'frame_enabled'
                ) THEN
                    ALTER TABLE products ADD COLUMN frame_enabled BOOLEAN DEFAULT false;
                END IF;
            END $$;
        `);
        
        // 3. Create index
        await query(`
            CREATE INDEX IF NOT EXISTS idx_products_frame_enabled 
            ON products(frame_enabled) WHERE frame_enabled = true;
        `);
        
        // 4. Check frames count
        const framesResult = await query('SELECT COUNT(*) FROM product_frames');
        const count = framesResult.rows[0].count;
        
        // 5. Get all frames
        const allFrames = await query('SELECT id, name, name_ar, frame_url, category FROM product_frames ORDER BY created_at DESC LIMIT 20');
        
        res.json({
            success: true,
            message: 'Frames tables setup complete',
            framesCount: count,
            frames: allFrames.rows
        });
        
    } catch (error) {
        console.error('❌ Error setting up tables:', error);
        res.status(500).json({ 
            error: 'Failed to setup tables',
            details: error.message 
        });
    }
});

export default router;
