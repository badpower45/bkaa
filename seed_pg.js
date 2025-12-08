import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { query } from './database.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.resolve(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');

const seedData = async () => {
    const client = await pool.connect();
    try {
        console.log('🔄 Starting database migration & seeding...');

        // 1. Run Schema
        console.log('📜 Applying schema...');
        await client.query(schemaSql);

        // 2. Seed Admin User
        console.log('👤 Seeding admin user...');
        const adminEmail = 'admin@lumina.com';
        const adminPassword = 'admin123';
        const hashedPassword = bcrypt.hashSync(adminPassword, 8);

        // Check if admin exists
        const adminCheck = await client.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
        if (adminCheck.rows.length === 0) {
            await client.query(
                'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
                ['Admin', adminEmail, hashedPassword, 'admin']
            );
            console.log('✅ Admin user created.');
        } else {
            console.log('ℹ️ Admin user already exists.');
        }

        // 3. Seed Branches
        console.log('🏢 Seeding branches...');
        const branches = [
            { name: 'Downtown Branch', lat: 30.0444, lng: 31.2357, radius: 5.0 }, // Cairo Downtown
            { name: 'Nasr City Branch', lat: 30.0561, lng: 31.3301, radius: 7.0 }, // Nasr City
            { name: 'Maadi Branch', lat: 29.9602, lng: 31.2569, radius: 6.0 }      // Maadi
        ];

        for (const branch of branches) {
            // Check if branch exists
            const branchCheck = await client.query('SELECT * FROM branches WHERE name = $1', [branch.name]);
            if (branchCheck.rows.length === 0) {
                await client.query(
                    'INSERT INTO branches (name, location_lat, location_lng, coverage_radius_km) VALUES ($1, $2, $3, $4)',
                    [branch.name, branch.lat, branch.lng, branch.radius]
                );
            }
        }
        console.log('✅ Branches seeded.');

        // 4. Seed Products (Static Info)
        console.log('🍎 Seeding products...');
        const products = [
            // Fresh Products
            {
                id: '1',
                name: 'بلح سيوي فاخر',
                category: 'ياميش',
                rating: 4.9,
                reviews: 342,
                image: 'https://images.unsplash.com/photo-1628607270974-c06490723748?q=80&w=600&auto=format&fit=crop',
                isOrganic: true,
                weight: '1 كجم',
                barcode: '6281234567001'
            },
            {
                id: '2',
                name: 'عيش فينو طازة',
                category: 'مخبوزات',
                rating: 4.8,
                reviews: 1500,
                image: 'https://images.unsplash.com/photo-1598373182133-52452f7691ef?q=80&w=600&auto=format&fit=crop',
                weight: '10 أرغفة',
                barcode: '6281234567002'
            },
            {
                id: '3',
                name: 'طماطم بلدي صلصة',
                category: 'خضروات',
                rating: 4.5,
                reviews: 230,
                image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?q=80&w=600&auto=format&fit=crop',
                weight: '1 كجم',
                barcode: '6281234567003'
            },
            {
                id: '4',
                name: 'كباب حلة بلدي',
                category: 'جزارة',
                rating: 4.9,
                reviews: 89,
                image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?q=80&w=600&auto=format&fit=crop',
                weight: '1 كجم',
                barcode: '6281234567004'
            },
            // Pantry Products
            {
                id: '5',
                name: 'زيت كريستال عباد',
                category: 'زيوت',
                rating: 4.7,
                reviews: 540,
                image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=600&auto=format&fit=crop',
                weight: '800 مل',
                barcode: '6281234567005'
            },
            {
                id: '6',
                name: 'أرز الضحى مصري',
                category: 'أرز',
                rating: 4.8,
                reviews: 800,
                image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?q=80&w=600&auto=format&fit=crop',
                weight: '1 كجم',
                barcode: '6281234567006'
            },
            {
                id: '7',
                name: 'مكرونة الملكة بنا',
                category: 'مكرونة',
                rating: 4.6,
                reviews: 320,
                image: 'https://images.unsplash.com/photo-1612966874574-1041c94f8a55?q=80&w=600&auto=format&fit=crop',
                weight: '400 جرام',
                barcode: '6281234567007'
            },
            {
                id: '8',
                name: 'شاي العروسة ناعم',
                category: 'مشروبات ساخنة',
                rating: 4.9,
                reviews: 1200,
                image: 'https://images.unsplash.com/photo-1597318181409-cf64d0b5d8a2?q=80&w=600&auto=format&fit=crop',
                weight: '250 جرام',
                barcode: '6281234567008'
            },
            // Snack Products
            {
                id: '9',
                name: 'شيبسي طماطم عائلي',
                category: 'سناكس',
                rating: 4.8,
                reviews: 156,
                image: 'https://images.unsplash.com/photo-1613919085533-0a05360b1cbe?q=80&w=600&auto=format&fit=crop',
                weight: 'جامبو',
                barcode: '6281234567009'
            },
            {
                id: '10',
                name: 'بيبسي كانز',
                category: 'مشروبات',
                rating: 4.9,
                reviews: 2000,
                image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?q=80&w=600&auto=format&fit=crop',
                weight: '330 مل',
                barcode: '6281234567010'
            },
            {
                id: '11',
                name: 'مولتو ماجموم شوكولاتة',
                category: 'مخبوزات',
                rating: 4.5,
                reviews: 450,
                image: 'https://images.unsplash.com/photo-1545337706-16125eb23d15?q=80&w=600&auto=format&fit=crop',
                weight: 'قطعة',
                barcode: '6281234567011'
            },
            {
                id: '12',
                name: 'شوكولاتة كيت كات 4 أصابع',
                category: 'شوكولاتة',
                rating: 4.8,
                reviews: 600,
                image: 'https://images.unsplash.com/photo-1614066000917-5c51861e37e0?q=80&w=600&auto=format&fit=crop',
                weight: '41.5 جرام',
                barcode: '6281234567012'
            }
        ];

        for (const p of products) {
            await client.query(
                `INSERT INTO products (id, name, category, rating, reviews, image, is_organic, weight, barcode) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO NOTHING`,
                [p.id, p.name, p.category, p.rating, p.reviews, p.image, p.isOrganic, p.weight, p.barcode]
            );
        }
        console.log('✅ Products seeded.');

        // 5. Seed Branch Inventory (Pivot Table)
        console.log('📦 Populating inventory for branches...');

        // Get all branches
        const dbBranches = await client.query('SELECT id, name FROM branches');

        // Base prices (mapped from original sqlite data)
        const basePrices = {
            '1': 65.00, '2': 25.00, '3': 15.00, '4': 480.00,
            '5': 95.00, '6': 42.00, '7': 15.00, '8': 60.00,
            '9': 15.00, '10': 12.00, '11': 10.00, '12': 25.00
        };

        for (const branch of dbBranches.rows) {
            for (const p of products) {
                const basePrice = basePrices[p.id];
                let priceMultiplier = 1.0;
                let stock = 50;

                // Vary price and stock by branch
                if (branch.name.includes('Downtown')) {
                    priceMultiplier = 1.1; // Expensive rent, higher prices
                    stock = 20; // Smaller storage
                } else if (branch.name.includes('Nasr City')) {
                    priceMultiplier = 1.0; // Standard
                    stock = 100; // Large warehouse
                } else if (branch.name.includes('Maadi')) {
                    priceMultiplier = 1.05; // Premium area
                    stock = 60;
                }

                const finalPrice = (basePrice * priceMultiplier).toFixed(2);

                await client.query(
                    `INSERT INTO branch_products (branch_id, product_id, price, stock_quantity, is_available)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (branch_id, product_id) DO UPDATE SET
                 price = EXCLUDED.price,
                 stock_quantity = EXCLUDED.stock_quantity`,
                    [branch.id, p.id, finalPrice, stock, true]
                );
            }
        }
        console.log('✅ Inventory populated across all branches.');

        console.log('🎉 Migration & Seeding Completed Successfully!');
    } catch (err) {
        console.error('❌ Error during seeding:', err);
    } finally {
        client.release();
        pool.end();
    }
};

seedData();
