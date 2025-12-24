// Security Middleware - Rate Limiting for sensitive endpoints
import rateLimit from 'express-rate-limit';

// Orders rate limiter - prevent order spam
export const ordersLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 orders per 15 minutes per IP
    message: { error: 'Too many orders created. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip for admin users
        return req.user && req.user.role === 'admin';
    }
});

// Cart operations limiter
export const cartLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 operations per minute
    message: { error: 'Too many cart operations. Please slow down.' }
});

// Search limiter
export const searchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20, // 20 searches per minute
    message: { error: 'Too many searches. Please wait a moment.' }
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
