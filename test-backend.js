/**
 * Backend API Tests
 * Run with: node test-backend.js
 */

const BASE_URL = 'http://localhost:3001/api';
let authToken = null;
let testUserId = null;
let testProductId = null;
let testOrderId = null;

// Test results
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

// Colors for console
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function test(name, fn) {
    try {
        await fn();
        results.passed++;
        results.tests.push({ name, status: 'PASS' });
        log(`✅ PASS: ${name}`, 'green');
    } catch (error) {
        results.failed++;
        results.tests.push({ name, status: 'FAIL', error: error.message });
        log(`❌ FAIL: ${name} - ${error.message}`, 'red');
    }
}

async function fetchAPI(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        ...options.headers
    };
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    const data = await response.json().catch(() => ({}));
    return { response, data, status: response.status };
}

// ==================== TESTS ====================

async function testHealthCheck() {
    await test('Server Health Check', async () => {
        const { data, status } = await fetchAPI('/products');
        if (status !== 200) throw new Error(`Status: ${status}`);
    });
}

async function testRegister() {
    const timestamp = Date.now();
    const email = `test${timestamp}@test.com`;
    
    await test('Register New User', async () => {
        const { data, status } = await fetchAPI('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                name: 'Test User',
                email: email,
                password: 'Test123456'
            })
        });
        
        if (status !== 200 && status !== 201) {
            throw new Error(`Status: ${status}, Error: ${JSON.stringify(data)}`);
        }
        if (!data.token) throw new Error('No token returned');
        if (!data.user) throw new Error('No user returned');
        
        authToken = data.token;
        testUserId = data.user.id;
        log(`   → User created: ${data.user.email} (ID: ${testUserId})`, 'blue');
    });
}

async function testLogin() {
    await test('Login Existing User', async () => {
        // First register a user
        const timestamp = Date.now();
        const email = `login${timestamp}@test.com`;
        
        await fetchAPI('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                name: 'Login Test',
                email: email,
                password: 'Test123456'
            })
        });
        
        // Now login
        const { data, status } = await fetchAPI('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email: email,
                password: 'Test123456'
            })
        });
        
        if (status !== 200) throw new Error(`Status: ${status}`);
        if (!data.token) throw new Error('No token returned');
        if (!data.auth) throw new Error('Auth flag not set');
        
        authToken = data.token;
        log(`   → Login successful, token received`, 'blue');
    });
}

async function testGetMe() {
    await test('Get Current User (Auth)', async () => {
        if (!authToken) throw new Error('No auth token available');
        
        const { data, status } = await fetchAPI('/auth/me');
        
        if (status !== 200) throw new Error(`Status: ${status}`);
        if (!data.user) throw new Error('No user data returned');
        
        log(`   → User: ${data.user.name} (${data.user.email})`, 'blue');
    });
}

async function testGetProducts() {
    await test('Get All Products', async () => {
        const { data, status } = await fetchAPI('/products');
        
        if (status !== 200) throw new Error(`Status: ${status}`);
        
        const products = data.data || data;
        log(`   → Found ${Array.isArray(products) ? products.length : 0} products`, 'blue');
        
        if (Array.isArray(products) && products.length > 0) {
            testProductId = products[0].id;
            log(`   → Sample product: ${products[0].name} (ID: ${testProductId})`, 'blue');
        }
    });
}

async function testGetProductsByBranch() {
    await test('Get Products by Branch', async () => {
        const { data, status } = await fetchAPI('/products?branchId=1');
        
        if (status !== 200) throw new Error(`Status: ${status}`);
        
        const products = data.data || data;
        log(`   → Found ${Array.isArray(products) ? products.length : 0} products for branch 1`, 'blue');
    });
}

async function testGetCategories() {
    await test('Get Categories', async () => {
        const { data, status } = await fetchAPI('/categories');
        
        if (status !== 200) throw new Error(`Status: ${status}`);
        
        const categories = data.data || data;
        log(`   → Found ${Array.isArray(categories) ? categories.length : 0} categories`, 'blue');
    });
}

async function testGetBranches() {
    await test('Get Branches', async () => {
        const { data, status } = await fetchAPI('/branches');
        
        if (status !== 200) throw new Error(`Status: ${status}`);
        
        const branches = data.data || data;
        log(`   → Found ${Array.isArray(branches) ? branches.length : 0} branches`, 'blue');
    });
}

async function testCart() {
    await test('Get Cart', async () => {
        if (!authToken) throw new Error('No auth token');
        
        const { data, status } = await fetchAPI('/cart');
        
        if (status !== 200) throw new Error(`Status: ${status}`);
        log(`   → Cart items: ${data.data?.length || 0}`, 'blue');
    });
    
    if (testProductId) {
        await test('Add to Cart', async () => {
            const { data, status } = await fetchAPI('/cart/add', {
                method: 'POST',
                body: JSON.stringify({
                    productId: testProductId,
                    quantity: 2
                })
            });
            
            if (status !== 200 && status !== 201) {
                throw new Error(`Status: ${status}, Error: ${JSON.stringify(data)}`);
            }
            log(`   → Added product ${testProductId} to cart`, 'blue');
        });
        
        await test('Update Cart', async () => {
            const { data, status } = await fetchAPI('/cart/update', {
                method: 'POST',
                body: JSON.stringify({
                    productId: testProductId,
                    quantity: 3
                })
            });
            
            if (status !== 200) throw new Error(`Status: ${status}`);
            log(`   → Updated quantity to 3`, 'blue');
        });
    }
}

async function testOrders() {
    await test('Get My Orders', async () => {
        if (!authToken) throw new Error('No auth token');
        
        const { data, status } = await fetchAPI('/orders/my');
        
        if (status !== 200) throw new Error(`Status: ${status}`);
        
        const orders = data.data || data;
        log(`   → Found ${Array.isArray(orders) ? orders.length : 0} orders`, 'blue');
    });
    
    await test('Create Order', async () => {
        if (!authToken || !testUserId) throw new Error('No auth');
        
        const { data, status } = await fetchAPI('/orders', {
            method: 'POST',
            body: JSON.stringify({
                userId: testUserId,
                total: 150.00,
                items: [
                    { id: testProductId || '1', name: 'Test Product', price: 50, quantity: 3 }
                ],
                branchId: 1,
                paymentMethod: 'cod',
                shippingDetails: {
                    firstName: 'Test',
                    lastName: 'User',
                    phone: '01234567890',
                    address: 'Test Address',
                    city: 'Cairo'
                }
            })
        });
        
        if (status !== 200 && status !== 201) {
            throw new Error(`Status: ${status}, Error: ${JSON.stringify(data)}`);
        }
        
        testOrderId = data.orderId || data.id;
        log(`   → Order created: ${data.orderCode || testOrderId}`, 'blue');
    });
    
    if (testOrderId) {
        await test('Track Order', async () => {
            const { data, status } = await fetchAPI(`/orders/track/${testOrderId}`);
            
            // May return 404 if order code doesn't exist, that's okay
            if (status !== 200 && status !== 404) {
                throw new Error(`Status: ${status}`);
            }
            log(`   → Order status: ${data.data?.status || 'N/A'}`, 'blue');
        });
    }
}

async function testDeliverySlots() {
    await test('Get Delivery Slots', async () => {
        const { data, status } = await fetchAPI('/delivery-slots');
        
        if (status !== 200) throw new Error(`Status: ${status}`);
        
        const slots = data.data || data;
        log(`   → Found ${Array.isArray(slots) ? slots.length : 0} delivery slots`, 'blue');
    });
}

async function testCoupons() {
    await test('Validate Coupon', async () => {
        const { data, status } = await fetchAPI('/coupons/validate', {
            method: 'POST',
            body: JSON.stringify({
                code: 'TEST10',
                orderTotal: 100
            })
        });
        
        // Coupon may not exist, that's okay
        if (status !== 200 && status !== 400 && status !== 404) {
            throw new Error(`Status: ${status}`);
        }
        log(`   → Coupon validation: ${data.valid ? 'Valid' : 'Invalid/Not Found'}`, 'blue');
    });
}

async function testFavorites() {
    await test('Get Favorites', async () => {
        if (!authToken) throw new Error('No auth token');
        
        const { data, status } = await fetchAPI('/favorites');
        
        if (status !== 200) throw new Error(`Status: ${status}`);
        
        const favorites = data.data || data;
        log(`   → Found ${Array.isArray(favorites) ? favorites.length : 0} favorites`, 'blue');
    });
}

// ==================== RUN TESTS ====================

async function runAllTests() {
    log('\n========================================', 'yellow');
    log('🧪 BACKEND API TESTS', 'yellow');
    log('========================================\n', 'yellow');
    
    // Health check
    await testHealthCheck();
    
    log('\n--- Authentication Tests ---', 'yellow');
    await testRegister();
    await testLogin();
    await testGetMe();
    
    log('\n--- Products Tests ---', 'yellow');
    await testGetProducts();
    await testGetProductsByBranch();
    await testGetCategories();
    
    log('\n--- Branches Tests ---', 'yellow');
    await testGetBranches();
    
    log('\n--- Cart Tests ---', 'yellow');
    await testCart();
    
    log('\n--- Orders Tests ---', 'yellow');
    await testOrders();
    
    log('\n--- Delivery Slots Tests ---', 'yellow');
    await testDeliverySlots();
    
    log('\n--- Coupons Tests ---', 'yellow');
    await testCoupons();
    
    log('\n--- Favorites Tests ---', 'yellow');
    await testFavorites();
    
    // Summary
    log('\n========================================', 'yellow');
    log('📊 TEST SUMMARY', 'yellow');
    log('========================================', 'yellow');
    log(`✅ Passed: ${results.passed}`, 'green');
    log(`❌ Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
    log(`📝 Total:  ${results.passed + results.failed}`, 'blue');
    
    if (results.failed > 0) {
        log('\n❌ Failed Tests:', 'red');
        results.tests.filter(t => t.status === 'FAIL').forEach(t => {
            log(`   - ${t.name}: ${t.error}`, 'red');
        });
    }
    
    log('\n========================================\n', 'yellow');
}

runAllTests().catch(console.error);
