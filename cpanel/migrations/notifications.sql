-- Notifications tables for cPanel deployment (no WebSocket support)
-- These tables store notifications that apps will poll for

-- Driver Notifications
CREATE TABLE IF NOT EXISTS driver_notifications (
    id SERIAL PRIMARY KEY,
    delivery_staff_id INTEGER REFERENCES delivery_staff(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'new_order',
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- User Notifications  
CREATE TABLE IF NOT EXISTS user_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'order_update',
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_driver_notifications_staff ON driver_notifications(delivery_staff_id, is_read);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_created ON driver_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created ON user_notifications(created_at DESC);

-- API endpoint to get unread notifications will be:
-- GET /api/notifications/driver/:driverId
-- GET /api/notifications/user/:userId
