import jwt from 'jsonwebtoken';

// ✅ Security: Ensure JWT_SECRET is set
if (!process.env.JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables!');
}
const SECRET_KEY = process.env.JWT_SECRET;

// Rate limiting storage for socket connections
const connectionAttempts = new Map();
const MAX_ATTEMPTS = 10; // Max connection attempts per minute
const WINDOW_MS = 60000; // 1 minute window

/**
 * Socket.io Authentication Middleware
 * Verifies JWT token on socket connection handshake
 */
export const socketAuthMiddleware = (socket, next) => {
    const clientIp = socket.handshake.address || socket.request.connection.remoteAddress;
    
    // Rate limiting check
    const now = Date.now();
    const clientAttempts = connectionAttempts.get(clientIp) || { count: 0, resetTime: now + WINDOW_MS };
    
    // Reset counter if window expired
    if (now > clientAttempts.resetTime) {
        clientAttempts.count = 0;
        clientAttempts.resetTime = now + WINDOW_MS;
    }
    
    clientAttempts.count++;
    connectionAttempts.set(clientIp, clientAttempts);
    
    // Check rate limit
    if (clientAttempts.count > MAX_ATTEMPTS) {
        console.log(`⚠️ Rate limit exceeded for socket connection from: ${clientIp}`);
        return next(new Error('Too many connection attempts. Please try again later.'));
    }
    
    // Get token from handshake auth or query
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    
    // Allow connections without token for public events (tracking, etc.)
    // But mark them as guest connections
    if (!token) {
        socket.userId = null;
        socket.userRole = null;
        socket.isGuest = true;
        socket.isAuthenticated = false;
        console.log(`🔓 Guest socket connection: ${socket.id} from ${clientIp}`);
        return next();
    }
    
    try {
        // Verify JWT token
        const decoded = jwt.verify(token, SECRET_KEY);
        
        // Attach user info to socket
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        socket.isGuest = false;
        socket.isAuthenticated = true;
        
        console.log(`🔐 Authenticated socket connection: ${socket.id} - User: ${decoded.id} (${decoded.role})`);
        return next();
    } catch (err) {
        // Invalid token - allow as guest but log warning
        console.log(`⚠️ Invalid token for socket ${socket.id}: ${err.message}`);
        socket.userId = null;
        socket.userRole = null;
        socket.isGuest = true;
        socket.isAuthenticated = false;
        
        // For certain events, we might want to reject completely
        // But for general connection, we allow as guest
        return next();
    }
};

/**
 * Middleware to require authentication for specific socket events
 * Use this to wrap event handlers that require auth
 */
export const requireSocketAuth = (handler) => {
    return (socket, data, callback) => {
        if (!socket.isAuthenticated) {
            const error = { error: 'Authentication required', code: 'AUTH_REQUIRED' };
            if (callback) {
                return callback(error);
            }
            return socket.emit('error', error);
        }
        return handler(socket, data, callback);
    };
};

/**
 * Middleware to require admin role for specific socket events
 */
export const requireSocketAdmin = (handler) => {
    return (socket, data, callback) => {
        if (!socket.isAuthenticated) {
            const error = { error: 'Authentication required', code: 'AUTH_REQUIRED' };
            if (callback) return callback(error);
            return socket.emit('error', error);
        }
        
        const adminRoles = ['admin', 'owner', 'manager'];
        if (!adminRoles.includes(socket.userRole)) {
            const error = { error: 'Admin access required', code: 'ADMIN_REQUIRED' };
            if (callback) return callback(error);
            return socket.emit('error', error);
        }
        
        return handler(socket, data, callback);
    };
};

/**
 * Clean up old rate limit entries periodically
 */
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of connectionAttempts.entries()) {
        if (now > data.resetTime + WINDOW_MS) {
            connectionAttempts.delete(ip);
        }
    }
}, 60000); // Clean up every minute

export default socketAuthMiddleware;
