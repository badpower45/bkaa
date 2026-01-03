const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ✅ Security: Ensure JWT_SECRET is set
if (!process.env.JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables!');
}

// Initialize Express
const app = express();

// Database connection (normalize sslmode to avoid self-signed chain issues)
const normalizeConnectionString = (raw) => {
    if (!raw) return raw;
    
    let normalized = raw;
    
    // Add sslmode if not present
    if (!normalized.includes('sslmode=')) {
        const separator = normalized.includes('?') ? '&' : '?';
        normalized = `${normalized}${separator}sslmode=no-verify`;
    }
    
    // Add prepared_statements=false for pgbouncer compatibility
    if (normalized.includes(':6543') && !normalized.includes('prepared_statements=')) {
        normalized = `${normalized}&prepared_statements=false`;
    }
    
    return normalized;
};

const pool = new Pool({
    connectionString: normalizeConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false },
    keepAlive: true,
    keepAliveInitialDelayMillis: 0,
    max: 1,
    min: 0,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    statement_timeout: 10000,
});

// Handle pool errors
pool.on('error', (err, client) => {
    console.error('❌ Unexpected pool error:', err.message);
    // Don't crash - pool will handle reconnection
});

// Test connection on startup (non-blocking)
(async () => {
    try {
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        console.log('✅ Database connected successfully');
    } catch (err) {
        console.error('⚠️ Database connection warning:', err.message);
        // Don't crash - continue anyway, queries will retry
    }
})();

// Middleware - CORS configuration
app.use(cors({
    origin: '*', // Allow all origins for now
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'apikey'],
    exposedHeaders: ['Content-Length', 'Content-Type']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// JWT Configuration - Use a fixed secret if env var missing
const JWT_SECRET = process.env.JWT_SECRET || 'allosh-supermarket-secret-key-2026-production';
console.log('🔐 JWT_SECRET configured:', JWT_SECRET ? '✅ Present' : '❌ Missing');

// Helper with retry logic
const query = async (text, params, retries = 3) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await pool.query(text, params);
            return result;
        } catch (err) {
            // Connection errors that should be retried
            const shouldRetry = (
                (err.code === 'ECONNRESET' || 
                 err.code === 'ETIMEDOUT' || 
                 err.code === 'XX000' || // Circuit breaker
                 err.code === '57P01' || // Connection terminated
                 err.message?.includes('Connection terminated') ||
                 err.message?.includes('Circuit breaker') ||
                 err.message?.includes('connection timeout') ||
                 err.message?.includes('upstream database')) &&
                attempt < retries
            );
            
            if (shouldRetry) {
                console.log(`🔄 Retry ${attempt + 1}/${retries} for query after: ${err.message}`);
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
                
                // Try to reset pool connection
                try {
                    await pool.query('SELECT 1');
                } catch (resetErr) {
                    console.log('Pool reset failed, continuing...');
                }
                continue;
            }
            throw err;
        }
    }
};

// Auth middleware - Enhanced with better error handling
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        console.log('❌ No authorization header');
        return res.status(403).json({ auth: false, message: 'No token provided.' });
    }
    
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    
    if (!token || token === 'null' || token === 'undefined') {
        console.log('❌ Invalid token value:', token);
        return res.status(403).json({ auth: false, message: 'No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        req.userRole = decoded.role || 'customer';
        console.log('✅ Token verified for user:', decoded.id, 'role:', req.userRole);
        next();
    } catch (err) {
        console.error('❌ Token verification failed:', err.message);
        return res.status(401).json({ auth: false, message: 'Failed to authenticate token.', error: err.message });
    }
};

// ===================== AUTH ROUTES =====================

// Register
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, phone } = req.body;

    // Validation
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password are required' });
    }

    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Invalid input format' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = bcrypt.hashSync(password, 8);

    try {
        const { rows } = await query(
            `INSERT INTO users (name, email, password, phone, role) VALUES ($1, $2, $3, $4, 'customer') RETURNING id`,
            [name, email, hashedPassword, phone || null]
        );
        const token = jwt.sign({ id: rows[0].id, role: 'customer' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ auth: true, token, user: { id: rows[0].id, name, email, role: 'customer' } });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login - Enhanced with better token generation
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt for:', email);

    // Validation
    if (!email || !password) {
        return res.status(400).json({ auth: false, error: 'Email and password are required' });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ auth: false, error: 'Invalid email or password format' });
    }

    try {
        const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        
        if (!rows[0]) {
            console.log('❌ User not found:', email);
            return res.status(401).json({ auth: false, error: 'Invalid email or password' });
        }

        const user = rows[0];

        // Check if user is blocked
        if (user.is_blocked) {
            console.log('❌ User is blocked:', email);
            return res.status(403).json({ auth: false, error: 'Account is blocked' });
        }

        // Verify password
        const passwordMatch = bcrypt.compareSync(password, user.password);
        if (!passwordMatch) {
            console.log('❌ Invalid password for:', email);
            return res.status(401).json({ auth: false, error: 'Invalid email or password' });
        }

        // Generate token with proper payload
        const tokenPayload = { 
            id: user.id, 
            role: user.role || 'customer',
            email: user.email,
            iat: Math.floor(Date.now() / 1000)
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { 
            expiresIn: '30d',
            algorithm: 'HS256'
        });
        
        console.log('✅ Login successful for:', email, 'role:', user.role);
        console.log('✅ Token generated:', token.substring(0, 20) + '...');

        res.json({
            auth: true,
            token: token,
            user: { 
                id: user.id, 
                name: user.name, 
                email: user.email, 
                role: user.role || 'customer',
                phone: user.phone,
                email_verified: user.email_verified
            }
        });
    } catch (err) {
        console.error('❌ Login error:', err);
        res.status(500).json({ auth: false, error: 'Login failed', details: err.message });
    }
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { rows } = await query('SELECT id, name, email, role, phone FROM users WHERE id = $1', [decoded.id]);
        if (!rows[0]) return res.status(404).json({ error: 'User not found' });
        res.json({ user: rows[0] });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Update profile
app.put('/api/auth/profile', verifyToken, async (req, res) => {
    const { name, phone, address } = req.body;
    try {
        const { rows } = await query(
            'UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), address = COALESCE($3, address) WHERE id = $4 RETURNING id, name, email, phone, address',
            [name, phone, address, req.userId]
        );
        res.json({ user: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ===================== PRODUCTS ROUTES =====================

// Get all products
app.get('/api/products', async (req, res) => {
    const { branchId, category, search, limit } = req.query;

    try {
        let sql = '';
        const params = [];
        
        if (branchId) {
            // Get products for specific branch with JOIN to products table
            sql = `
                SELECT 
                    bp.product_id as id,
                    p.name,
                    p.category,
                    p.subcategory,
                    p.image,
                    bp.price,
                    bp.stock_quantity,
                    bp.is_available,
                    p.description,
                    p.rating,
                    p.barcode
                FROM branch_products bp
                INNER JOIN products p ON bp.product_id = p.id
                WHERE bp.branch_id = $1
            `;
            params.push(parseInt(branchId));
            
            if (category) {
                sql += ` AND p.category = $${params.length + 1}`;
                params.push(category);
            }
            if (search) {
                sql += ` AND p.name ILIKE $${params.length + 1}`;
                params.push(`%${search}%`);
            }
            
            sql += ' ORDER BY p.name ASC';
        } else {
            // Get all products (first branch for each product)
            sql = `
                SELECT DISTINCT ON (p.id)
                    p.id,
                    p.name,
                    p.category,
                    p.subcategory,
                    p.image,
                    COALESCE(bp.price, 0) as price,
                    COALESCE(bp.stock_quantity, 0) as stock_quantity,
                    COALESCE(bp.is_available, true) as is_available,
                    p.description,
                    p.rating,
                    p.barcode
                FROM products p
                LEFT JOIN branch_products bp ON p.id = bp.product_id
            `;
            
            const whereClauses = [];
            if (category) {
                whereClauses.push(`p.category = $${params.length + 1}`);
                params.push(category);
            }
            if (search) {
                whereClauses.push(`p.name ILIKE $${params.length + 1}`);
                params.push(`%${search}%`);
            }
            
            if (whereClauses.length > 0) {
                sql += ' WHERE ' + whereClauses.join(' AND ');
            }
            
            sql += ' ORDER BY p.id, p.name ASC';
        }
        
        if (limit) {
            sql += ` LIMIT ${parseInt(limit)}`;
        }

        const { rows } = await query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('Products error:', err);
        console.error('SQL:', err.message);
        res.status(500).json({ error: 'Failed to fetch products', details: err.message });
    }
});

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const { branchId } = req.query;
        const productId = req.params.id;
        
        let sql = `
            SELECT 
                bp.product_id as id,
                COALESCE(bp.name, p.name) as name,
                COALESCE(bp.category, p.category) as category,
                COALESCE(bp.subcategory, p.subcategory) as subcategory,
                COALESCE(bp.image, p.image) as image,
                bp.price,
                bp.stock_quantity,
                bp.is_available,
                p.description,
                COALESCE(p.rating, 4.5) as rating,
                COALESCE(p.reviews, 0) as reviews,
                p.barcode,
                p.weight,
                p.is_new
            FROM branch_products bp
            INNER JOIN products p ON bp.product_id = p.id
            WHERE bp.product_id = $1
        `;
        
        const params = [productId];
        
        // If branchId specified, get product from that branch
        if (branchId) {
            sql += ` AND bp.branch_id = $2`;
            params.push(parseInt(branchId));
        } else {
            // Otherwise, get from first available branch
            sql += ` ORDER BY bp.branch_id ASC`;
        }
        
        sql += ` LIMIT 1`;
        
        const { rows } = await query(sql, params);
        
        if (!rows[0]) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        console.error('Get product error:', err);
        res.status(500).json({ error: 'Failed to fetch product', details: err.message });
    }
});

// ===================== ORDERS ROUTES =====================

// Get all orders with userId query param
app.get('/api/orders', verifyToken, async (req, res) => {
    const { userId } = req.query;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }
    
    try {
        const { rows } = await query(
            `SELECT o.*, 
                    json_agg(json_build_object(
                        'id', oi.id, 
                        'product_id', oi.product_id, 
                        'quantity', oi.quantity, 
                        'price', oi.price,
                        'product_name', p.name,
                        'product_image', p.image
                    )) as items
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN products p ON oi.product_id::text = p.id::text
             WHERE o.user_id = $1
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Orders error:', err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Create order
app.post('/api/orders', async (req, res) => {
    const { userId, total, items, branchId, shippingDetails, paymentMethod } = req.body;

    try {
        await query('BEGIN');

        // Generate order code
        const orderCode = 'ORD-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        const { rows } = await query(
            `INSERT INTO orders (user_id, total, status, branch_id, shipping_info, payment_method, order_code)
             VALUES ($1, $2, 'pending', $3, $4, $5, $6) RETURNING id, order_code`,
            [userId || null, total, branchId || 1, JSON.stringify(shippingDetails), paymentMethod || 'cash', orderCode]
        );

        const orderId = rows[0].id;

        // Insert order items
        for (const item of items) {
            await query(
                `INSERT INTO order_items (order_id, product_id, quantity, price)
                 VALUES ($1, $2, $3, $4)`,
                [orderId, item.id || item.productId, item.quantity, item.price]
            );
        }

        await query('COMMIT');
        res.json({ id: orderId, order_code: rows[0].order_code, status: 'pending' });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Order error:', err);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Get user orders
app.get('/api/orders/user/:userId', verifyToken, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT o.*, 
                    json_agg(json_build_object(
                        'id', oi.id, 
                        'product_id', oi.product_id, 
                        'quantity', oi.quantity, 
                        'price', oi.price,
                        'product_name', p.name,
                        'product_image', p.image
                    )) as items
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE o.user_id = $1
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [req.params.userId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Orders error:', err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Track order by code
app.get('/api/orders/track/:orderCode', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT o.id, o.order_code, o.status, o.total, o.created_at, o.shipping_info, o.payment_method,
                    json_agg(json_build_object(
                        'id', oi.id,
                        'product_id', oi.product_id,
                        'quantity', oi.quantity,
                        'price', oi.price,
                        'product_name', p.name
                    )) as items
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE o.order_code = $1
             GROUP BY o.id`,
            [req.params.orderCode]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to track order' });
    }
});

// Get order by ID
app.get('/api/orders/:id', verifyToken, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT o.*, 
                    json_agg(json_build_object(
                        'id', oi.id, 
                        'product_id', oi.product_id, 
                        'quantity', oi.quantity, 
                        'price', oi.price,
                        'product_name', p.name,
                        'product_image', p.image
                    )) as items
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE o.id = $1
             GROUP BY o.id`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// ===================== BRANCHES ROUTES =====================

app.get('/api/branches', async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM branches WHERE is_active = true ORDER BY name');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch branches' });
    }
});

app.get('/api/branches/:id', async (req, res) => {
    try {
        const { rows } = await query('SELECT * FROM branches WHERE id = $1', [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Branch not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch branch' });
    }
});

// ===================== CATEGORIES =====================

app.get('/api/categories', async (req, res) => {
    try {
        // Get categories from the categories table with all details
        const { rows } = await query(
            `SELECT id, name, name_ar, image, icon, bg_color, description, 
                    parent_id, display_order, is_active, created_at, updated_at,
                    (SELECT COUNT(*) FROM products p WHERE p.category = c.name) as products_count
             FROM categories c
             WHERE is_active = true
             ORDER BY display_order, name`
        );
        res.json({ data: rows });
    } catch (err) {
        console.error('Categories fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// ===================== FAVORITES =====================

app.get('/api/favorites/:userId', verifyToken, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT p.* FROM favorites f
             JOIN products p ON f.product_id = p.id
             WHERE f.user_id = $1`,
            [req.params.userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch favorites' });
    }
});

app.post('/api/favorites', verifyToken, async (req, res) => {
    const { productId } = req.body;
    try {
        await query('INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, productId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add favorite' });
    }
});

app.delete('/api/favorites/:productId', verifyToken, async (req, res) => {
    try {
        await query('DELETE FROM favorites WHERE user_id = $1 AND product_id = $2', [req.userId, req.params.productId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove favorite' });
    }
});

// ===================== CART =====================

// Get cart with branchId support
app.get('/api/cart', verifyToken, async (req, res) => {
    const userId = req.userId;
    const branchId = req.query.branchId || 1;
    
    try {
        const { rows } = await query(
            `SELECT c.id as cart_id, c.quantity, c.substitution_preference,
                    p.id, p.name, p.image, p.category, p.description, p.weight, p.barcode,
                    COALESCE(bp.price, 0) as price,
                    bp.discount_price,
                    bp.stock_quantity,
                    bp.is_available
             FROM cart c
             JOIN products p ON c.product_id::text = p.id::text
             LEFT JOIN branch_products bp ON p.id::text = bp.product_id::text AND bp.branch_id = $2
             WHERE c.user_id = $1`,
            [userId, branchId]
        );
        
        const items = rows.map(row => ({
            id: row.id,
            cartId: row.cart_id,
            name: row.name,
            image: row.image,
            price: Number(row.price) || 0,
            discountPrice: row.discount_price ? Number(row.discount_price) : null,
            quantity: row.quantity,
            substitutionPreference: row.substitution_preference || 'none',
            category: row.category,
            description: row.description,
            weight: row.weight,
            barcode: row.barcode,
            stockQuantity: row.stock_quantity,
            isAvailable: row.is_available
        }));
        
        res.json({ message: 'success', data: items });
    } catch (err) {
        console.error('Cart fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch cart' });
    }
});

// Old endpoint for backward compatibility
app.get('/api/cart/:userId', verifyToken, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT c.*, p.name, p.image,
                    COALESCE(bp.price, 0) as price,
                    bp.discount_price,
                    COALESCE(bp.stock_quantity, 0) as stock_quantity,
                    COALESCE(bp.is_available, true) as is_available
             FROM cart c
             JOIN products p ON c.product_id = p.id
             LEFT JOIN branch_products bp ON p.id = bp.product_id
             WHERE c.user_id = $1`,
            [req.params.userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch cart' });
    }
});

// Add to cart (supports both logged in and guest users)
app.post('/api/cart/add', async (req, res) => {
    const { productId, quantity, substitutionPreference, userId } = req.body;
    
    // Get userId from token if available, otherwise use provided userId (for guests)
    const token = req.headers['authorization']?.split(' ')[1];
    let effectiveUserId = userId;
    
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            effectiveUserId = decoded.id;
        } catch (err) {
            // Token invalid, use provided userId
        }
    }
    
    if (!effectiveUserId) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    
    try {
        await query(
            `INSERT INTO cart (user_id, product_id, quantity, substitution_preference) 
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, product_id) 
             DO UPDATE SET quantity = cart.quantity + $3, substitution_preference = $4`,
            [effectiveUserId, productId, quantity || 1, substitutionPreference || 'none']
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Add to cart error:', err);
        res.status(500).json({ error: 'Failed to add to cart', details: err.message });
    }
});

// Update cart item
app.post('/api/cart/update', verifyToken, async (req, res) => {
    const { productId, quantity, substitutionPreference } = req.body;
    try {
        await query(
            'UPDATE cart SET quantity = $1, substitution_preference = COALESCE($2, substitution_preference) WHERE user_id = $3 AND product_id = $4',
            [quantity, substitutionPreference, req.userId, productId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Update cart error:', err);
        res.status(500).json({ error: 'Failed to update cart' });
    }
});

app.post('/api/cart', verifyToken, async (req, res) => {
    const { productId, quantity } = req.body;
    try {
        await query(
            `INSERT INTO cart (user_id, product_id, quantity) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = cart.quantity + $3`,
            [req.userId, productId, quantity || 1]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add to cart' });
    }
});

app.put('/api/cart/:productId', verifyToken, async (req, res) => {
    const { quantity } = req.body;
    try {
        await query('UPDATE cart SET quantity = $1 WHERE user_id = $2 AND product_id = $3', [quantity, req.userId, req.params.productId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update cart' });
    }
});

app.delete('/api/cart/:productId', verifyToken, async (req, res) => {
    try {
        await query('DELETE FROM cart WHERE user_id = $1 AND product_id = $2', [req.userId, req.params.productId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove from cart' });
    }
});

app.delete('/api/cart', verifyToken, async (req, res) => {
    try {
        await query('DELETE FROM cart WHERE user_id = $1', [req.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear cart' });
    }
});

// ===================== ADMIN ROUTES =====================

// Get all users (admin)
app.get('/api/admin/users', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin' && req.userRole !== 'manager') {
        return res.status(403).json({ error: 'Admin only' });
    }
    
    try {
        const { rows } = await query(
            `SELECT 
                id, name, email, role, phone, phone2,
                assigned_branch_id, created_at, is_blocked,
                email_verified, loyalty_points
             FROM users 
             ORDER BY created_at DESC`
        );
        
        console.log(`📋 Loaded ${rows.length} users for admin`);
        
        // Return in format expected by frontend
        res.json({ 
            success: true,
            data: rows 
        });
    } catch (err) {
        console.error('❌ Error fetching users:', err);
        res.status(500).json({ error: 'Failed to fetch users', details: err.message });
    }
});

// Get all orders (admin)
app.get('/api/admin/orders', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    try {
        const { rows } = await query(
            `SELECT o.*, u.name as user_name, u.email as user_email
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             ORDER BY o.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Update order status (admin)
app.put('/api/admin/orders/:id/status', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { status } = req.body;
    try {
        const { rows } = await query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Add product (admin)
app.post('/api/admin/products', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { name, description, price, category, image, brand, stock, discount } = req.body;
    try {
        const { rows } = await query(
            `INSERT INTO products (name, description, price, category, image, brand, stock, discount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [name, description, price, category, image, brand, stock || 100, discount || 0]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error('Add product error:', err);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// Update product (admin)
app.put('/api/admin/products/:id', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { name, description, price, category, image, brand, stock, discount } = req.body;
    try {
        const { rows } = await query(
            `UPDATE products SET name = $1, description = $2, price = $3, category = $4, image = $5, brand = $6, stock = $7, discount = $8
             WHERE id = $9 RETURNING *`,
            [name, description, price, category, image, brand, stock, discount, req.params.id]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product (admin)
app.delete('/api/admin/products/:id', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    try {
        await query('DELETE FROM products WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// Dashboard stats (admin)
app.get('/api/admin/stats', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    try {
        const usersCount = await query('SELECT COUNT(*) FROM users');
        const ordersCount = await query('SELECT COUNT(*) FROM orders');
        const productsCount = await query('SELECT COUNT(*) FROM products');
        const revenue = await query('SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != $1', ['cancelled']);
        const recentOrders = await query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5');
        
        res.json({
            users: parseInt(usersCount.rows[0].count),
            orders: parseInt(ordersCount.rows[0].count),
            products: parseInt(productsCount.rows[0].count),
            revenue: parseFloat(revenue.rows[0].total),
            recentOrders: recentOrders.rows
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ===================== CUSTOMER ANALYTICS ROUTES =====================

// Get customer analytics with filtering and sorting
app.get('/api/admin/customer-analytics', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    
    try {
        const { search, rating, sortBy, limit = 200 } = req.query;
        
        let sql = `
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.is_blocked,
                COUNT(DISTINCT o.id) as total_orders,
                COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END) as rejected_orders,
                COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) as completed_orders,
                COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total ELSE 0 END), 0) as total_spent,
                COALESCE(AVG(CASE WHEN o.status = 'delivered' THEN o.total END), 0) as average_order_value,
                MAX(o.created_at) as last_order_date,
                CASE 
                    WHEN u.is_blocked = true THEN 'banned'
                    WHEN COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END) >= 3 THEN 'problematic'
                    WHEN COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total ELSE 0 END), 0) >= 1000 THEN 'excellent'
                    ELSE 'good'
                END as customer_rating
            FROM users u
            LEFT JOIN orders o ON o.user_id = u.id
            WHERE u.role = 'user'
        `;
        
        const params = [];
        
        // Search filter
        if (search) {
            params.push(`%${search}%`);
            sql += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length})`;
        }
        
        sql += ' GROUP BY u.id, u.name, u.email, u.phone, u.is_blocked';
        
        // Rating filter (applied after GROUP BY using HAVING)
        if (rating && rating !== 'all') {
            if (rating === 'excellent') {
                sql += ' HAVING COALESCE(SUM(CASE WHEN o.status = \'delivered\' THEN o.total ELSE 0 END), 0) >= 1000';
            } else if (rating === 'good') {
                sql += ' HAVING COALESCE(SUM(CASE WHEN o.status = \'delivered\' THEN o.total ELSE 0 END), 0) < 1000 AND COUNT(DISTINCT CASE WHEN o.status = \'cancelled\' THEN o.id END) < 3 AND u.is_blocked = false';
            } else if (rating === 'problematic') {
                sql += ' HAVING COUNT(DISTINCT CASE WHEN o.status = \'cancelled\' THEN o.id END) >= 3 AND u.is_blocked = false';
            } else if (rating === 'banned') {
                sql += ' HAVING u.is_blocked = true';
            }
        }
        
        // Sorting
        if (sortBy === 'rejected') {
            sql += ' ORDER BY rejected_orders DESC, total_orders DESC';
        } else if (sortBy === 'spent') {
            sql += ' ORDER BY total_spent DESC';
        } else if (sortBy === 'orders') {
            sql += ' ORDER BY total_orders DESC';
        } else if (sortBy === 'recent') {
            sql += ' ORDER BY last_order_date DESC NULLS LAST';
        } else {
            sql += ' ORDER BY total_orders DESC';
        }
        
        params.push(parseInt(limit));
        sql += ` LIMIT $${params.length}`;
        
        const { rows } = await query(sql, params);
        
        // Format the response
        const formattedRows = rows.map(row => ({
            ...row,
            total_spent: parseFloat(row.total_spent || 0),
            average_order_value: parseFloat(row.average_order_value || 0),
            total_orders: parseInt(row.total_orders || 0),
            rejected_orders: parseInt(row.rejected_orders || 0),
            completed_orders: parseInt(row.completed_orders || 0)
        }));
        
        res.json({ data: formattedRows });
    } catch (err) {
        console.error('Customer analytics error:', err);
        res.status(500).json({ error: 'Failed to fetch customer analytics', details: err.message });
    }
});

// Get customer analytics stats summary
app.get('/api/admin/customer-analytics/stats', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    
    try {
        const statsQuery = `
            SELECT 
                COUNT(DISTINCT u.id) as total_customers,
                COUNT(DISTINCT CASE WHEN u.is_blocked = true THEN u.id END) as blocked_customers,
                COUNT(DISTINCT CASE 
                    WHEN u.is_blocked = false 
                    AND (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'cancelled') >= 3 
                    THEN u.id 
                END) as problematic_customers,
                COUNT(DISTINCT CASE 
                    WHEN (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.user_id = u.id AND o.status = 'delivered') >= 1000 
                    THEN u.id 
                END) as excellent_customers,
                COALESCE(AVG((SELECT SUM(o.total) FROM orders o WHERE o.user_id = u.id AND o.status = 'delivered')), 0) as avg_customer_lifetime_value
            FROM users u
            WHERE u.role = 'user'
        `;
        
        const { rows } = await query(statsQuery);
        const stats = rows[0];
        
        res.json({
            data: {
                total_customers: parseInt(stats.total_customers || 0),
                blocked_customers: parseInt(stats.blocked_customers || 0),
                problematic_customers: parseInt(stats.problematic_customers || 0),
                excellent_customers: parseInt(stats.excellent_customers || 0),
                avg_customer_lifetime_value: parseFloat(stats.avg_customer_lifetime_value || 0)
            }
        });
    } catch (err) {
        console.error('Customer analytics stats error:', err);
        res.status(500).json({ error: 'Failed to fetch customer analytics stats', details: err.message });
    }
});

// ===================== SEARCH =====================

app.get('/api/search', async (req, res) => {
    const { q, category, brand, minPrice, maxPrice } = req.query;
    
    try {
        let sql = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (q) {
            params.push(`%${q}%`);
            sql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length} OR brand ILIKE $${params.length})`;
        }
        if (category) {
            params.push(category);
            sql += ` AND category = $${params.length}`;
        }
        if (brand) {
            params.push(brand);
            sql += ` AND brand = $${params.length}`;
        }
        if (minPrice) {
            params.push(parseFloat(minPrice));
            sql += ` AND price >= $${params.length}`;
        }
        if (maxPrice) {
            params.push(parseFloat(maxPrice));
            sql += ` AND price <= $${params.length}`;
        }

        sql += ' ORDER BY created_at DESC LIMIT 50';
        const { rows } = await query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// ===================== STORIES ROUTES =====================

// Get all active stories
app.get('/api/stories', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT s.*, u.name as user_name, u.avatar as user_avatar
             FROM stories s
             LEFT JOIN users u ON s.user_id = u.id
             WHERE s.is_active = true AND s.expires_at > NOW()
             ORDER BY s.priority DESC, s.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error('Stories fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch stories' });
    }
});

// Get single story
app.get('/api/stories/:id', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT s.*, u.name as user_name, u.avatar as user_avatar
             FROM stories s
             LEFT JOIN users u ON s.user_id = u.id
             WHERE s.id = $1`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Story not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch story' });
    }
});

// Record story view
app.post('/api/stories/:id/view', async (req, res) => {
    const storyId = req.params.id;
    const userId = req.body.userId || null;
    const viewerIp = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';

    try {
        // Try to insert view record
        if (userId) {
            await query(
                `INSERT INTO story_views (story_id, user_id, viewer_ip) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                [storyId, userId, viewerIp]
            );
        } else {
            await query(
                `INSERT INTO story_views (story_id, viewer_ip) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [storyId, viewerIp]
            );
        }
        
        // Increment views count
        await query('UPDATE stories SET views_count = views_count + 1 WHERE id = $1', [storyId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Story view error:', err);
        res.status(500).json({ error: 'Failed to record view' });
    }
});

// Create story (Admin only)
app.post('/api/stories', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
        return res.status(403).json({ error: 'Admin only' });
    }

    const { title, media_url, media_type, duration, link_url, link_text, expires_in_hours, priority, branch_id } = req.body;
    
    // Calculate expiry date (default 24 hours)
    const expiresAt = new Date(Date.now() + (expires_in_hours || 24) * 60 * 60 * 1000);

    try {
        const { rows } = await query(
            `INSERT INTO stories (user_id, title, media_url, media_type, duration, link_url, link_text, expires_at, priority, branch_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [req.userId, title, media_url, media_type || 'image', duration || 5, link_url, link_text, expiresAt, priority || 0, branch_id]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error('Create story error:', err);
        res.status(500).json({ error: 'Failed to create story' });
    }
});

// Update story (Admin only)
app.put('/api/stories/:id', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
        return res.status(403).json({ error: 'Admin only' });
    }

    const { title, media_url, media_type, duration, link_url, link_text, is_active, priority } = req.body;

    try {
        const { rows } = await query(
            `UPDATE stories SET 
                title = COALESCE($1, title),
                media_url = COALESCE($2, media_url),
                media_type = COALESCE($3, media_type),
                duration = COALESCE($4, duration),
                link_url = COALESCE($5, link_url),
                link_text = COALESCE($6, link_text),
                is_active = COALESCE($7, is_active),
                priority = COALESCE($8, priority)
             WHERE id = $9
             RETURNING *`,
            [title, media_url, media_type, duration, link_url, link_text, is_active, priority, req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Story not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update story' });
    }
});

// Delete story (Admin only)
app.delete('/api/stories/:id', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
        return res.status(403).json({ error: 'Admin only' });
    }

    try {
        await query('DELETE FROM stories WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete story' });
    }
});

// Get all stories for admin (including expired)
app.get('/api/admin/stories', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
        return res.status(403).json({ error: 'Admin only' });
    }

    try {
        const { rows } = await query(
            `SELECT s.*, u.name as user_name
             FROM stories s
             LEFT JOIN users u ON s.user_id = u.id
             ORDER BY s.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stories' });
    }
});

// ===================== BRANCH PRODUCTS =====================

// Get products for a specific branch
app.get('/api/branch-products/:branchId', async (req, res) => {
    const { branchId } = req.params;
    const { category, available } = req.query;

    try {
        let sql = `
            SELECT p.*, bp.price, bp.discount_price, bp.stock_quantity, bp.is_available
            FROM products p
            JOIN branch_products bp ON p.id::text = bp.product_id::text
            WHERE bp.branch_id = $1
        `;
        const params = [branchId];
        let paramIndex = 2;

        if (category) {
            sql += ` AND p.category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        if (available === 'true') {
            sql += ` AND bp.is_available = TRUE`;
        }

        sql += ' ORDER BY p.name';

        const { rows } = await query(sql, params);
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error('Branch products error:', err);
        res.status(500).json({ error: 'Failed to fetch branch products' });
    }
});

// ===================== DELIVERY FEES =====================

// Calculate delivery fees
app.post('/api/delivery-fees/calculate', async (req, res) => {
    const { branchId, subtotal, customerLat, customerLng } = req.body;

    if (!branchId || !subtotal) {
        return res.status(400).json({ error: 'Branch ID and subtotal are required' });
    }

    try {
        // جلب إعدادات رسوم التوصيل للفرع
        const { rows: feeRows } = await query(
            `SELECT * FROM delivery_fees WHERE branch_id = $1 AND is_active = TRUE LIMIT 1`,
            [branchId]
        );

        if (feeRows.length === 0) {
            // إذا لم توجد إعدادات، استخدم القيم الافتراضية
            return res.json({
                deliveryFee: 20,
                freeDelivery: false,
                minOrder: 0,
                canDeliver: true
            });
        }

        const fee = feeRows[0];

        // Check if free delivery applies
        if (subtotal >= fee.free_delivery_threshold) {
            return res.json({
                deliveryFee: 0,
                freeDelivery: true,
                minOrder: fee.min_order,
                canDeliver: true
            });
        }

        // Calculate distance-based fees if coordinates provided
        let totalFee = fee.base_fee;
        
        if (customerLat && customerLng && fee.per_km_fee > 0) {
            // جلب موقع الفرع
            const { rows: branchRows } = await query(
                'SELECT latitude, longitude FROM branches WHERE id = $1',
                [branchId]
            );
            
            if (branchRows[0] && branchRows[0].latitude && branchRows[0].longitude) {
                const distance = calculateDistance(
                    branchRows[0].latitude,
                    branchRows[0].longitude,
                    customerLat,
                    customerLng
                );
                
                totalFee += distance * fee.per_km_fee;
            }
        }

        res.json({
            deliveryFee: Math.round(totalFee * 100) / 100,
            freeDelivery: false,
            minOrder: fee.min_order,
            canDeliver: true,
            message: null
        });

    } catch (err) {
        console.error('Error calculating delivery fee:', err);
        res.status(500).json({ error: err.message });
    }
});

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// ===================== FACEBOOK REELS =====================

// Get active Facebook Reels
app.get('/api/facebook-reels', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT id, title, thumbnail_url, video_url, facebook_url, 
                    views_count, duration, display_order, is_active, created_at
             FROM facebook_reels
             WHERE is_active = true
             ORDER BY display_order, created_at DESC`
        );
        res.json({ data: rows });
    } catch (err) {
        console.error('Facebook reels fetch error:', err);
        // Return empty array if table doesn't exist yet
        res.json({ data: [] });
    }
});

// Get all Facebook Reels for admin
app.get('/api/facebook-reels/admin/all', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
        return res.status(403).json({ error: 'Admin only' });
    }

    try {
        const { rows } = await query(
            `SELECT * FROM facebook_reels ORDER BY display_order, created_at DESC`
        );
        res.json({ data: rows });
    } catch (err) {
        console.error('Facebook reels admin fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch reels' });
    }
});

// Get single reel by ID
app.get('/api/facebook-reels/:id', async (req, res) => {
    try {
        const { rows } = await query(
            'SELECT * FROM facebook_reels WHERE id = $1',
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Reel not found' });
        res.json({ data: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reel' });
    }
});

// Create new reel (Admin only)
app.post('/api/facebook-reels', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
        return res.status(403).json({ error: 'Admin only' });
    }

    const { title, thumbnail_url, video_url, facebook_url, views_count, duration, display_order, is_active } = req.body;
    
    try {
        const { rows } = await query(
            `INSERT INTO facebook_reels 
                (title, thumbnail_url, video_url, facebook_url, views_count, duration, display_order, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [title, thumbnail_url, video_url, facebook_url, views_count, duration, display_order || 0, is_active !== false]
        );
        res.status(201).json({ data: rows[0] });
    } catch (err) {
        console.error('Create reel error:', err);
        res.status(500).json({ error: 'Failed to create reel' });
    }
});

// Update reel (Admin only)
app.put('/api/facebook-reels/:id', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
        return res.status(403).json({ error: 'Admin only' });
    }

    const { title, thumbnail_url, video_url, facebook_url, views_count, duration, display_order, is_active } = req.body;
    
    try {
        const { rows } = await query(
            `UPDATE facebook_reels SET 
                title = COALESCE($1, title),
                thumbnail_url = COALESCE($2, thumbnail_url),
                video_url = COALESCE($3, video_url),
                facebook_url = COALESCE($4, facebook_url),
                views_count = COALESCE($5, views_count),
                duration = COALESCE($6, duration),
                display_order = COALESCE($7, display_order),
                is_active = COALESCE($8, is_active),
                updated_at = NOW()
             WHERE id = $9
             RETURNING *`,
            [title, thumbnail_url, video_url, facebook_url, views_count, duration, display_order, is_active, req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Reel not found' });
        res.json({ data: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update reel' });
    }
});

// Delete reel (Admin only)
app.delete('/api/facebook-reels/:id', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin' && req.userRole !== 'owner') {
        return res.status(403).json({ error: 'Admin only' });
    }

    try {
        await query('DELETE FROM facebook_reels WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete reel' });
    }
});

// ===================== HEALTH & ROOT =====================

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), environment: 'vercel' });
});

app.get('/api', (req, res) => {
    res.json({ message: 'Allosh Fresh Market API', version: '1.0.0', status: 'running' });
});

app.get('/', (req, res) => {
    res.json({ message: 'Allosh Fresh Market API', version: '1.0.0', status: 'running' });
});

// ===================== ADMIN SETUP ENDPOINT (TEMPORARY) =====================
// This endpoint creates an admin user - REMOVE IN PRODUCTION
app.post('/api/setup-admin', async (req, res) => {
    try {
        const adminEmail = 'admin@allosh.com';
        const adminPassword = 'admin123456';
        const hashedPassword = bcrypt.hashSync(adminPassword, 8);

        // Check if admin exists
        const { rows: existing } = await query(
            'SELECT id, email, role FROM users WHERE email = $1',
            [adminEmail]
        );

        if (existing.length > 0) {
            // Update existing user to admin
            await query(
                'UPDATE users SET role = $1, password = $2 WHERE email = $3',
                ['admin', hashedPassword, adminEmail]
            );
            return res.json({
                success: true,
                message: 'Admin user updated',
                email: adminEmail,
                password: adminPassword,
                note: 'User already existed, role updated to admin'
            });
        }

        // Create new admin
        const { rows } = await query(
            `INSERT INTO users (name, email, password, phone, role, loyalty_points, created_at)
             VALUES ($1, $2, $3, $4, $5, 0, NOW())
             RETURNING id, email, role`,
            ['Admin Allosh', adminEmail, hashedPassword, '01000000000', 'admin']
        );

        res.json({
            success: true,
            message: 'Admin user created successfully',
            email: adminEmail,
            password: adminPassword,
            userId: rows[0].id,
            warning: 'CHANGE PASSWORD AFTER FIRST LOGIN!'
        });
    } catch (err) {
        console.error('Setup admin error:', err);
        res.status(500).json({ error: 'Failed to create admin', details: err.message });
    }
});

// Reset admin password (for debugging)
app.post('/api/reset-admin-password', async (req, res) => {
    try {
        const password = 'admin123456';
        const hashedPassword = bcrypt.hashSync(password, 8);
        
        const { rows } = await query(
            `UPDATE users 
             SET password = $1 
             WHERE email = 'admin@allosh.com' 
             RETURNING id, email, name, role`,
            [hashedPassword]
        );
        
        if (rows[0]) {
            console.log('✅ Admin password reset successfully');
            res.json({ 
                success: true, 
                message: 'Admin password reset to: admin123456',
                user: rows[0],
                hash: hashedPassword
            });
        } else {
            res.status(404).json({ error: 'Admin user not found' });
        }
    } catch (err) {
        console.error('❌ Error resetting admin password:', err);
        res.status(500).json({ error: 'Failed to reset password', details: err.message });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Export for Vercel serverless
module.exports = app;
