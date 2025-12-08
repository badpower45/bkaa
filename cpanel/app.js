const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Initialize database connection
require('./database');

const app = express();

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'production';

// Allowed origins
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://newnewoo.vercel.app',
    process.env.FRONTEND_URL,
    // Add your cPanel domain here
    process.env.CPANEL_DOMAIN
].filter(Boolean);

// Security: Trust proxy (for cPanel)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api', limiter);

// Stricter rate limit for auth
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many authentication attempts, please try again later.' }
});

// CORS
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const isAllowed = allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin);
        if (isAllowed) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chat');
const branchProductsRoutes = require('./routes/branchProducts');
const deliverySlotsRoutes = require('./routes/deliverySlots');
const branchesRoutes = require('./routes/branches');
const distributionRoutes = require('./routes/distribution');
const deliveryFeesRoutes = require('./routes/delivery-fees');
const couponsRoutes = require('./routes/coupons');
const magazineRoutes = require('./routes/magazine');
const hotDealsRoutes = require('./routes/hotDeals');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/branch-products', branchProductsRoutes);
app.use('/api/delivery-slots', deliverySlotsRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/distribution', distributionRoutes);
app.use('/api/delivery-fees', deliveryFeesRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/magazine', magazineRoutes);
app.use('/api/hot-deals', hotDealsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: NODE_ENV
    });
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'Allosh Fresh Market API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            auth: '/api/auth',
            products: '/api/products',
            cart: '/api/cart',
            orders: '/api/orders',
            chat: '/api/chat',
            branches: '/api/branches'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(err.status || 500).json({ 
        error: NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Environment: ${NODE_ENV}`);
    console.log(`✅ Ready for requests`);
});

module.exports = app;
