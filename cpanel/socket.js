/**
 * Socket.io stub for cPanel deployment
 * =====================================
 * cPanel shared hosting doesn't support WebSockets well.
 * This file provides placeholder functions that log actions
 * instead of using real-time sockets.
 * 
 * For real-time features, use Supabase Realtime or Edge Functions
 */

// تخزين بيانات السائقين (in-memory fallback)
const driverLocations = new Map();
const connectedDrivers = new Map();

/**
 * إرسال إشعار للسائق بطلب جديد
 * في cPanel: يتم تخزين الإشعار في قاعدة البيانات بدلاً من الـ socket
 */
const notifyDriverNewOrder = async (driverId, orderData) => {
    console.log(`📱 [NOTIFICATION] New order for driver ${driverId}:`, orderData?.orderId || 'N/A');
    // TODO: Use Supabase Edge Functions or push notifications
    // For now, we'll store in DB and let the driver's app poll
    try {
        const { query } = require('./database');
        await query(`
            INSERT INTO driver_notifications (delivery_staff_id, order_id, type, message, created_at)
            VALUES ($1, $2, 'new_order', $3, NOW())
            ON CONFLICT DO NOTHING
        `, [driverId, orderData?.orderId, JSON.stringify(orderData)]);
    } catch (err) {
        console.error('Error storing driver notification:', err.message);
    }
};

/**
 * إرسال إشعار للعميل بتحديث الطلب
 */
const notifyCustomerOrderUpdate = async (userId, orderData) => {
    console.log(`📱 [NOTIFICATION] Order update for user ${userId}:`, orderData?.status || 'N/A');
    // TODO: Use Supabase Edge Functions or push notifications
    try {
        const { query } = require('./database');
        await query(`
            INSERT INTO user_notifications (user_id, order_id, type, message, created_at)
            VALUES ($1, $2, 'order_update', $3, NOW())
            ON CONFLICT DO NOTHING
        `, [userId, orderData?.orderId, JSON.stringify(orderData)]);
    } catch (err) {
        console.error('Error storing user notification:', err.message);
    }
};

/**
 * إرسال إشعار للموزعين بطلب جديد
 */
const notifyDistributorsNewOrder = async (branchId, orderData) => {
    console.log(`📱 [NOTIFICATION] New order for branch ${branchId} distributors:`, orderData?.orderId || 'N/A');
    // Distributors will poll the API or use Supabase Realtime
};

/**
 * الحصول على موقع السائق
 */
const getDriverLocation = (driverId) => {
    return driverLocations.get(driverId) || null;
};

/**
 * التحقق من اتصال السائق
 */
const isDriverConnected = (driverId) => {
    return connectedDrivers.has(driverId);
};

/**
 * تحديث موقع السائق
 */
const updateDriverLocation = (driverId, lat, lng) => {
    driverLocations.set(driverId, {
        lat,
        lng,
        timestamp: Date.now()
    });
};

/**
 * إرسال إشعار بتغيير حالة الطلب
 */
const emitOrderStatusChange = async (orderId, status, data) => {
    console.log(`📱 [STATUS] Order ${orderId} status changed to: ${status}`);
};

/**
 * إرسال موقع السائق للعميل
 */
const emitDriverLocationToCustomer = (userId, locationData) => {
    console.log(`📍 [LOCATION] Driver location sent to user ${userId}`);
};

// Initialize (placeholder - no actual socket server)
const initializeSocket = (io) => {
    console.log('⚠️ Socket.io is disabled on cPanel. Using notification fallbacks.');
};

module.exports = {
    initializeSocket,
    notifyDriverNewOrder,
    notifyCustomerOrderUpdate,
    notifyDistributorsNewOrder,
    getDriverLocation,
    isDriverConnected,
    updateDriverLocation,
    emitOrderStatusChange,
    emitDriverLocationToCustomer
};
