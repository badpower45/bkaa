// Security Middleware - Rate Limiting for sensitive endpoints
import rateLimit from 'express-rate-limit';

// Orders rate limiter - prevent order spam
export const ordersLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 operations per 15 minutes per IP (more lenient for admin)
    message: { error: 'Too many operations. Please try again in a moment.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip for admin/manager users
        return req.user && (req.user.role === 'admin' || req.user.role === 'manager');
    }
});

// Cart operations limiter
export const cartLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 operations per minute
    message: { error: 'Too many cart operations. Please slow down.' },
    skip: (req) => req.user && (req.user.role === 'admin' || req.user.role === 'manager')
});

// Search limiter
export const searchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60, // 60 searches per minute
    message: { error: 'Too many searches. Please wait a moment.' },
    skip: (req) => req.user && (req.user.role === 'admin' || req.user.role === 'manager')
});

// Returns limiter
export const returnsLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 return requests per hour
    message: { error: 'Too many return requests. Please try again later.' }
});

// Chat limiter
export const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30, // 30 messages per minute
    message: { error: 'Too many messages. Please slow down.' }
});

// Review limiter
export const reviewLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 reviews per hour
    message: { error: 'Too many reviews. Please try again later.' }
});
