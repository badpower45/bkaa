import { query } from './database.js';

async function checkProduct() {
    try {
        // Check product 10 price in all branches
        const result = await query(`
            SELECT p.id, p.name, bp.branch_id, bp.price, bp.discount_price, bp.stock_quantity
            FROM products p
            LEFT JOIN branch_products bp ON p.id = bp.product_id
            WHERE p.id = '10'
        `);
        
        console.log('Product 10 pricing:');
        console.log(JSON.stringify(result.rows, null, 2));
        
        // Check all branches
        const branches = await query('SELECT id, name FROM branches LIMIT 5');
        console.log('\nAvailable branches:');
        console.log(JSON.stringify(branches.rows, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkProduct();
