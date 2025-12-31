import { query } from './database.js';
import { socketAuthMiddleware, requireSocketAuth, requireSocketAdmin } from './middleware/socketAuth.js';

let io;

// تخزين مواقع السائقين في الذاكرة (يمكن استخدام Redis للإنتاج)
const driverLocations = new Map();

// تخزين السائقين المتصلين
const connectedDrivers = new Map();

// تخزين العملاء المتصلين لمتابعة الطلبات
const orderTrackers = new Map();

export const initializeSocket = (socketServer) => {
    io = socketServer;

    // ✅ Security: Apply authentication middleware
    io.use(socketAuthMiddleware);

    io.on('connection', (socket) => {
        const authStatus = socket.isAuthenticated ? `User ${socket.userId} (${socket.userRole})` : 'Guest';
        console.log(`🔌 Connection: ${socket.id} - ${authStatus}`);

        // =============================================
        // أحداث السائق (Delivery Driver) - تتطلب مصادقة
        // =============================================

        // السائق يسجل دخوله
        socket.on('driver:join', async ({ driverId, userId }) => {
            // ✅ Security: Verify driver is authenticated
            if (!socket.isAuthenticated) {
                return socket.emit('error', { message: 'Authentication required for driver events' });
            }
            
            // ✅ Security: Verify user matches driver ID or is admin
            const adminRoles = ['admin', 'owner', 'manager', 'delivery'];
            if (socket.userId !== userId && !adminRoles.includes(socket.userRole)) {
                return socket.emit('error', { message: 'Unauthorized driver access' });
            }
            
            socket.join(`driver_${driverId}`);
            socket.driverId = driverId;
            socket.userId = userId;
            connectedDrivers.set(driverId, socket.id);
            console.log(`🚗 Driver ${driverId} connected (auth verified)`);

            // تحديث حالة السائق في قاعدة البيانات
            try {
                await query(
                    'UPDATE delivery_staff SET is_available = TRUE WHERE id = $1',
                    [driverId]
                );
            } catch (err) {
                console.error('Error updating driver status:', err);
            }
        });

        // تحديث موقع السائق GPS
        socket.on('driver:location', async ({ driverId, lat, lng, orderId }) => {
            // ✅ Security: Verify driver is the one sending location
            if (!socket.isAuthenticated || socket.driverId !== driverId) {
                return socket.emit('error', { message: 'Unauthorized location update' });
            }
            
            // ✅ Security: Validate coordinates
            if (typeof lat !== 'number' || typeof lng !== 'number' ||
                lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return socket.emit('error', { message: 'Invalid coordinates' });
            }
            
            const locationData = {
                driverId,
                lat,
                lng,
                timestamp: Date.now()
            };
            
            driverLocations.set(driverId, locationData);

            // إرسال الموقع للعميل إذا كان متتبعاً للطلب
            if (orderId) {
                io.to(`order_${orderId}`).emit('driver:location:update', locationData);
            }

            // حفظ آخر موقع في قاعدة البيانات (كل 30 ثانية)
            if (!socket.lastLocationSave || Date.now() - socket.lastLocationSave > 30000) {
                socket.lastLocationSave = Date.now();
                try {
                    await query(
                        'UPDATE delivery_staff SET last_lat = $1, last_lng = $2, last_location_at = CURRENT_TIMESTAMP WHERE id = $3',
                        [lat, lng, driverId]
                    );
                } catch (err) {
                    console.error('Error saving driver location:', err);
                }
            }
        });

        // =============================================
        // أحداث العميل - تتبع الطلب
        // =============================================

        // العميل يبدأ تتبع الطلب
        socket.on('order:track', ({ orderId, userId }) => {
            socket.join(`order_${orderId}`);
            socket.trackingOrderId = orderId;
            orderTrackers.set(`${userId}_${orderId}`, socket.id);
            console.log(`👤 User ${userId} tracking order ${orderId}`);

            // إرسال آخر موقع للسائق إذا كان متاحاً
            // سيتم تحديثه عندما يتصل السائق
        });

        // العميل يوقف تتبع الطلب
        socket.on('order:untrack', ({ orderId, userId }) => {
            socket.leave(`order_${orderId}`);
            orderTrackers.delete(`${userId}_${orderId}`);
        });

        // =============================================
        // أحداث الموزع (Distributor)
        // =============================================

        // الموزع يسجل دخوله
        socket.on('distributor:join', ({ distributorId, branchId }) => {
            socket.join('distributors');
            socket.join(`branch_${branchId}`);
            socket.distributorId = distributorId;
            socket.branchId = branchId;
            console.log(`📦 Distributor ${distributorId} connected for branch ${branchId}`);
        });

        // =============================================
        // أحداث الطلبات والإشعارات
        // =============================================

        // طلب جديد - إشعار الموزعين
        socket.on('order:new', ({ orderId, branchId, orderData }) => {
            io.to(`branch_${branchId}`).emit('order:notification', {
                type: 'new_order',
                orderId,
                orderData,
                message: `طلب جديد #${orderId}`
            });
        });

        // Customer joins chat
        socket.on('customer:join', ({ conversationId, customerName }) => {
            socket.join(`conversation_${conversationId}`);
            socket.conversationId = conversationId;
            console.log(`Customer ${customerName} joined conversation ${conversationId}`);
        });

        // Agent joins dashboard
        socket.on('agent:join', ({ agentId, agentName }) => {
            socket.join('agents');
            socket.agentId = agentId;
            socket.agentName = agentName;
            console.log(`Agent ${agentName} joined dashboard`);

            // Notify all agents of new agent online
            io.to('agents').emit('agent:online', { agentId, agentName });
        });

        // Agent opens specific conversation
        socket.on('conversation:open', ({ conversationId }) => {
            socket.join(`conversation_${conversationId}`);
            console.log(`Agent ${socket.agentName} opened conversation ${conversationId}`);
        });

        // Send message
        socket.on('message:send', async ({ conversationId, senderId, senderType, message }) => {
            try {
                // Save to database
                const { rows } = await query(
                    `INSERT INTO messages (conversation_id, sender_id, sender_type, message) VALUES ($1, $2, $3, $4) RETURNING id, timestamp`,
                    [conversationId, senderId, senderType, message]
                );

                const messageData = {
                    id: rows[0].id,
                    conversationId,
                    senderId,
                    senderType,
                    message,
                    timestamp: rows[0].timestamp,
                    isRead: false
                };

                // Update conversation last message time
                await query(
                    `UPDATE conversations SET last_message_at = $1 WHERE id = $2`,
                    [rows[0].timestamp, conversationId]
                );

                // Broadcast to conversation room
                io.to(`conversation_${conversationId}`).emit('message:new', messageData);

                // If customer message, notify all agents
                if (senderType === 'customer') {
                    io.to('agents').emit('message:notification', {
                        conversationId,
                        message: messageData
                    });
                }
            } catch (error) {
                console.error('Error in message:send:', error);
            }
        });

        // Typing indicators
        socket.on('typing:start', ({ conversationId, userType, userName }) => {
            socket.to(`conversation_${conversationId}`).emit('typing:indicator', {
                userType,
                userName,
                isTyping: true
            });
        });

        socket.on('typing:stop', ({ conversationId, userType }) => {
            socket.to(`conversation_${conversationId}`).emit('typing:indicator', {
                userType,
                isTyping: false
            });
        });

        // Assign conversation to agent
        socket.on('conversation:assign', async ({ conversationId, agentId, agentName }) => {
            try {
                await query(
                    `UPDATE conversations SET agent_id = $1 WHERE id = $2`,
                    [agentId, conversationId]
                );
                io.to('agents').emit('conversation:assigned', {
                    conversationId,
                    agentId,
                    agentName
                });
            } catch (error) {
                console.error('Error assigning conversation:', error);
            }
        });

        // Mark messages as read
        socket.on('messages:markRead', async ({ conversationId }) => {
            try {
                await query(
                    `UPDATE messages SET is_read = TRUE WHERE conversation_id = $1 AND sender_type = 'customer'`,
                    [conversationId]
                );
            } catch (error) {
                console.error('Error marking messages as read:', error);
            }
        });

        // Disconnect
        socket.on('disconnect', async () => {
            console.log('🔌 User disconnected:', socket.id);
            
            // إذا كان سائق
            if (socket.driverId) {
                connectedDrivers.delete(socket.driverId);
                driverLocations.delete(socket.driverId);
                
                // تحديث حالة السائق - غير متاح
                try {
                    await query(
                        'UPDATE delivery_staff SET is_available = FALSE WHERE id = $1',
                        [socket.driverId]
                    );
                } catch (err) {
                    console.error('Error updating driver status on disconnect:', err);
                }
                console.log(`🚗 Driver ${socket.driverId} disconnected`);
            }
            
            if (socket.agentId) {
                io.to('agents').emit('agent:offline', {
                    agentId: socket.agentId,
                    agentName: socket.agentName
                });
            }
        });
    });
};

// =============================================
// وظائف مساعدة للإشعارات من الـ Routes
// =============================================

// إشعار السائق بطلب جديد معين له
export const notifyDriverNewOrder = (driverId, orderData) => {
    if (io) {
        io.to(`driver_${driverId}`).emit('order:assigned', {
            type: 'new_assignment',
            ...orderData,
            message: `لديك طلب جديد #${orderData.orderId}`,
            timestamp: Date.now()
        });
    }
};

// إشعار العميل بتحديث حالة الطلب
export const notifyCustomerOrderUpdate = (orderId, status, additionalData = {}) => {
    if (io) {
        const statusMessages = {
            'preparing': 'جاري تحضير طلبك',
            'ready': 'طلبك جاهز للتوصيل',
            'assigned_to_delivery': 'تم تعيين سائق لطلبك',
            'accepted': 'السائق في الطريق للفرع',
            'picked_up': 'السائق استلم طلبك وفي الطريق إليك',
            'arriving': 'السائق وصل - في انتظارك',
            'delivered': 'تم توصيل طلبك بنجاح! 🎉',
            'rejected': 'حدثت مشكلة في التوصيل',
            'cancelled': 'تم إلغاء الطلب'
        };
        
        io.to(`order_${orderId}`).emit('order:status:update', {
            orderId,
            status,
            message: statusMessages[status] || `حالة الطلب: ${status}`,
            timestamp: Date.now(),
            ...additionalData
        });
    }
};

// إشعار الموزعين بطلب جديد
export const notifyDistributorsNewOrder = (branchId, orderData) => {
    if (io) {
        io.to(`branch_${branchId}`).emit('order:new', {
            type: 'new_order',
            ...orderData,
            message: `طلب جديد #${orderData.orderId}`,
            timestamp: Date.now()
        });
    }
};

// إرسال موقع السائق للعميل
export const sendDriverLocation = (orderId, locationData) => {
    if (io) {
        io.to(`order_${orderId}`).emit('driver:location:update', locationData);
    }
};

// جلب موقع السائق الحالي
export const getDriverLocation = (driverId) => {
    return driverLocations.get(driverId);
};

// التحقق من اتصال السائق
export const isDriverConnected = (driverId) => {
    return connectedDrivers.has(driverId);
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};
