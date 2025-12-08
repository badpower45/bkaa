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

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://newnewoo.vercel.app',
        'https://allosh-eg.com',
        'https://www.allosh-eg.com',
        ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(u => u.trim()) : [])
    ].filter(Boolean),
    credentials: true
}));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;

// Helper
const query = (text, params) => pool.query(text, params);

// Auth middleware
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'No token provided' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        req.userRole = decoded.role;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// ===================== AUTH ROUTES =====================

// Register
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, phone } = req.body;
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

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (!rows[0]) return res.status(404).json({ error: 'User not found' });

        if (!bcrypt.compareSync(password, rows[0].password)) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const token = jwt.sign({ id: rows[0].id, role: rows[0].role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            auth: true,
            token,
            user: { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role, phone: rows[0].phone }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
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
    const { branchId, category, search, limit, brand, minPrice, maxPrice, onSale } = req.query;

    try {
        let sql = `
            SELECT p.*, 
                   COALESCE(bp.price, p.price) as price, 
                   COALESCE(bp.stock_quantity, p.stock) as stock_quantity, 
                   COALESCE(bp.is_available, true) as is_available
            FROM products p
            LEFT JOIN branch_products bp ON p.id = bp.product_id
        `;
        const params = [];
        const conditions = [];

        if (branchId) {
            conditions.push(`(bp.branch_id = $${params.length + 1} OR bp.branch_id IS NULL)`);
            params.push(branchId);
        }
        if (category) {
            conditions.push(`p.category = $${params.length + 1}`);
            params.push(category);
        }
        if (brand) {
            conditions.push(`p.brand = $${params.length + 1}`);
            params.push(brand);
        }
        if (search) {
            conditions.push(`(p.name ILIKE $${params.length + 1} OR p.description ILIKE $${params.length + 1} OR p.brand ILIKE $${params.length + 1})`);
            params.push(`%${search}%`);
        }
        if (minPrice) {
            conditions.push(`COALESCE(bp.price, p.price) >= $${params.length + 1}`);
            params.push(parseFloat(minPrice));
        }
        if (maxPrice) {
            conditions.push(`COALESCE(bp.price, p.price) <= $${params.length + 1}`);
            params.push(parseFloat(maxPrice));
        }
        if (onSale === 'true') {
            conditions.push(`p.discount > 0`);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY p.created_at DESC';
        if (limit) sql += ` LIMIT ${parseInt(limit)}`;

        const { rows } = await query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('Products error:', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT p.*, COALESCE(bp.price, p.price) as price, COALESCE(bp.stock_quantity, p.stock) as stock_quantity 
             FROM products p 
             LEFT JOIN branch_products bp ON p.id = bp.product_id 
             WHERE p.id = $1`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

// ===================== ORDERS ROUTES =====================

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
        const { rows } = await query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category');
        res.json(rows.map(r => r.category));
    } catch (err) {
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

app.get('/api/cart/:userId', verifyToken, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT c.*, p.name, p.price, p.image, p.discount
             FROM cart c
             JOIN products p ON c.product_id = p.id
             WHERE c.user_id = $1`,
            [req.params.userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch cart' });
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
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    try {
        const { rows } = await query('SELECT id, name, email, role, phone, created_at FROM users ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
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

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Export for Vercel serverless
module.exports = app;
