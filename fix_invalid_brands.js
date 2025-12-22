import { query } from './database.js';

/**
 * Fix Invalid Brand IDs in Products Table
 * This script will:
 * 1. Find all products with brand_id that doesn't exist in brands table
 * 2. Set those brand_id to NULL
 */

async function fixInvalidBrands() {
    console.log('🔍 Starting brand validation and cleanup...\n');
    
    try {
        // Step 1: Find products with invalid brand_id
        console.log('📊 Step 1: Finding products with invalid brand_id...');
        const invalidBrandsQuery = `
            SELECT 
                p.id, 
                p.name, 
                p.brand_id,
                p.category
            FROM products p
            WHERE p.brand_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM brands b WHERE b.id = p.brand_id
            )
            ORDER BY p.brand_id
        `;
        
        const { rows: invalidProducts } = await query(invalidBrandsQuery);
        
        console.log(`\n📦 Found ${invalidProducts.length} products with invalid brand_id:\n`);
        
        if (invalidProducts.length === 0) {
            console.log('✅ All products have valid brand references! No cleanup needed.\n');
            return;
        }
        
        // Display invalid products
        invalidProducts.forEach((product, index) => {
            console.log(`${index + 1}. Product ID: ${product.id}`);
            console.log(`   Name: ${product.name}`);
            console.log(`   Invalid Brand ID: ${product.brand_id}`);
            console.log(`   Category: ${product.category}`);
            console.log('');
        });
        
        // Step 2: Get list of valid brands for reference
        console.log('🏷️  Step 2: Listing valid brands in the system...');
        const { rows: validBrands } = await query('SELECT id, name_ar, name_en FROM brands ORDER BY id');
        
        console.log(`\n✅ Valid brands in system (${validBrands.length} total):\n`);
        validBrands.forEach(brand => {
            console.log(`   ID ${brand.id}: ${brand.name_ar} - ${brand.name_en}`);
        });
        
        // Step 3: Clean up invalid brand_id
        console.log('\n🧹 Step 3: Cleaning up invalid brand_id values...\n');
        
        const cleanupQuery = `
            UPDATE products
            SET brand_id = NULL
            WHERE brand_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM brands b WHERE b.id = products.brand_id
            )
            RETURNING id, name, brand_id
        `;
        
        const { rows: cleanedProducts, rowCount } = await query(cleanupQuery);
        
        console.log(`✅ Successfully cleaned ${rowCount} products!\n`);
        
        if (rowCount > 0) {
            console.log('📋 Cleaned products:');
            cleanedProducts.forEach((product, index) => {
                console.log(`   ${index + 1}. ${product.name} (ID: ${product.id}) - brand_id set to NULL`);
            });
        }
        
        // Step 4: Verification
        console.log('\n🔍 Step 4: Verifying cleanup...');
        const { rows: remainingInvalid } = await query(invalidBrandsQuery);
        
        if (remainingInvalid.length === 0) {
            console.log('✅ Verification passed! No invalid brand_id found.\n');
        } else {
            console.log(`⚠️  Warning: Still found ${remainingInvalid.length} products with invalid brand_id\n`);
        }
        
        // Step 5: Summary
        console.log('📊 Summary:');
        console.log(`   Total products with invalid brand_id: ${invalidProducts.length}`);
        console.log(`   Products cleaned: ${rowCount}`);
        console.log(`   Valid brands in system: ${validBrands.length}`);
        console.log('\n✅ Brand cleanup completed successfully!\n');
        
    } catch (error) {
        console.error('❌ Error during brand cleanup:', error);
        throw error;
    }
}

// Run the script
fixInvalidBrands()
    .then(() => {
        console.log('🎉 Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });
