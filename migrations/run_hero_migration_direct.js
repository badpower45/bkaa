import pkg from 'pg';
const { Client } = pkg;

const runMigration = async () => {
    const client = new Client({
        connectionString: 'postgresql://postgres.jsrqjmovbuhuhbmxyqsh:13572468bodeAa@@aws-1-eu-west-3.pooler.supabase.com:6543/postgres',
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔌 Connecting to database...');
        await client.connect();
        console.log('✅ Connected successfully!');

        console.log('🚀 Creating hero_sections table...');
        
        // Create table
        await client.query(`
            CREATE TABLE IF NOT EXISTS hero_sections (
                id SERIAL PRIMARY KEY,
                title_en VARCHAR(200),
                title_ar VARCHAR(200),
                subtitle_en TEXT,
                subtitle_ar TEXT,
                description_en TEXT,
                description_ar TEXT,
                
                image_url TEXT NOT NULL,
                mobile_image_url TEXT,
                image_alt_en VARCHAR(200),
                image_alt_ar VARCHAR(200),
                
                button1_text_en VARCHAR(100),
                button1_text_ar VARCHAR(100),
                button1_link VARCHAR(500),
                button1_color VARCHAR(50) DEFAULT '#FF6B6B',
                button1_enabled BOOLEAN DEFAULT false,
                
                button2_text_en VARCHAR(100),
                button2_text_ar VARCHAR(100),
                button2_link VARCHAR(500),
                button2_color VARCHAR(50) DEFAULT '#4ECDC4',
                button2_enabled BOOLEAN DEFAULT false,
                
                display_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                show_on_mobile BOOLEAN DEFAULT true,
                show_on_desktop BOOLEAN DEFAULT true,
                
                background_color VARCHAR(50) DEFAULT '#FFFFFF',
                text_color VARCHAR(50) DEFAULT '#000000',
                overlay_opacity DECIMAL(3, 2) DEFAULT 0.0,
                
                animation_type VARCHAR(50) DEFAULT 'fade',
                animation_duration INTEGER DEFAULT 5000,
                
                click_count INTEGER DEFAULT 0,
                view_count INTEGER DEFAULT 0,
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER,
                updated_by INTEGER
            );
        `);
        
        console.log('✅ Table created successfully!');
        
        // Create indexes
        console.log('🔧 Creating indexes...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_hero_sections_active ON hero_sections(is_active, display_order);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_hero_sections_order ON hero_sections(display_order);
        `);
        
        console.log('✅ Indexes created successfully!');
        
        // Create trigger function
        console.log('🔧 Creating trigger function...');
        await client.query(`
            CREATE OR REPLACE FUNCTION update_hero_sections_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        await client.query(`
            DROP TRIGGER IF EXISTS hero_sections_updated_at_trigger ON hero_sections;
        `);
        
        await client.query(`
            CREATE TRIGGER hero_sections_updated_at_trigger
                BEFORE UPDATE ON hero_sections
                FOR EACH ROW
                EXECUTE FUNCTION update_hero_sections_updated_at();
        `);
        
        console.log('✅ Triggers created successfully!');
        
        // Insert sample data
        console.log('📝 Inserting sample data...');
        await client.query(`
            INSERT INTO hero_sections (
                title_en, title_ar,
                subtitle_en, subtitle_ar,
                description_en, description_ar,
                image_url,
                button1_text_en, button1_text_ar, button1_link, button1_enabled,
                button2_text_en, button2_text_ar, button2_link, button2_enabled,
                display_order, is_active
            ) VALUES (
                'Fresh Organic Products',
                'منتجات طازجة وعضوية',
                'Delivered to Your Doorstep',
                'نوصلها لباب بيتك',
                'Get the freshest organic products with same-day delivery',
                'احصل على أطزج المنتجات العضوية مع التوصيل في نفس اليوم',
                'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200',
                'Shop Now',
                'تسوق الآن',
                '/products',
                true,
                'View Offers',
                'عرض العروض',
                '/offers',
                true,
                1,
                true
            ) ON CONFLICT DO NOTHING;
        `);
        
        console.log('✅ Sample data inserted successfully!');
        console.log('🎉 Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await client.end();
        console.log('🔌 Connection closed');
    }
};

runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
