import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import './database.js'; // Database connection initializes on import
import { initializeSocket } from './socket.js';
import { startScheduler } from './scheduler.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chat.js';
import branchProductsRoutes from './routes/branchProducts.js';
import deliverySlotsRoutes from './routes/deliverySlots.js';
import branchesRoutes from './routes/branches.js';
import distributionRoutes from './routes/distribution.js';
import deliveryFeesRoutes from './routes/delivery-fees.js';
import couponsRoutes from './routes/coupons.js';
import magazineRoutes from './routes/magazine.js';
import hotDealsRoutes from './routes/hotDeals.js';
import favoritesRoutes from './routes/favorites.js';
import storiesRoutes from './routes/stories.js';
import categoriesRoutes from './routes/categories.js';
import facebookReelsRoutes from './routes/facebook_reels.js';
import brandOffersRoutes from './routes/brandOffers.js';
import bulkImportRoutes from './routes/bulkImport.js';
import homeSectionsRoutes from './routes/homeSections.js';

// dotenv is loaded in database.js with the correct path
// No need to load it again here

const app = express();
const httpServer = createServer(app);

// Determine allowed origins
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://192.168.1.112:5173',
    'http://192.168.1.112:5174',
    'https://newnewoo.vercel.app',
    'https://newnewoo-git-main-bode-ahmeds-projects.vercel.app',
    'https://newnewoo-ag9qdglgo-bode-ahmeds-projects.vercel.app',
    'https://newnewoo-92m6214ih-bode-ahmeds-projects.vercel.app',
    'https://newnewoo-22ou4sjsu-bode-ahmeds-projects.vercel.app',
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(url => url.trim()) : [])
];

const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST", "PATCH", "DELETE"],
        credentials: true
    }
});

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security: Trust proxy (for Render, Railway, etc)
if (NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: NODE_ENV === 'production' ? 100 : 1000, // Limit requests per IP
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api', limiter);

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many authentication attempts, please try again later.' }
});

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);
        // Allow listed origins or Vercel preview domains for this project
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

// Initialize Socket.io
initializeSocket(io);

// Routes
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
app.use('/api/favorites', favoritesRoutes);
app.use('/api/stories', storiesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/facebook-reels', facebookReelsRoutes);
app.use('/api/brand-offers', brandOffersRoutes);
app.use('/api/products', bulkImportRoutes);
app.use('/api/home-sections', homeSectionsRoutes);

// Health check endpoint (moved under /api for serverless route consistency)
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: NODE_ENV
    });
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'Lumina Fresh Market API',
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
        error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
        ...(NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// Only start server if not in Vercel serverless environment
if (!process.env.VERCEL) {
    httpServer.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📡 Environment: ${NODE_ENV}`);
        console.log(`🔌 Socket.io ready`);
        
        // Start the order scheduler
        startScheduler();
        
        if (NODE_ENV === 'production') {
            console.log(`✅ Production mode active`);
        }
    });
}

// Export app for Vercel serverless
// Last updated: 2025-12-11 20:50 - Force redeploy to fix syntax error
export default app;
