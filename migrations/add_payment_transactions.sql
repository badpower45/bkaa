-- إضافة جدول payment_transactions لتخزين معاملات الدفع الإلكتروني
-- يدعم Paymob, Fawry, وأي payment gateway آخر

CREATE TABLE IF NOT EXISTS payment_transactions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    payment_method VARCHAR(50) NOT NULL, -- 'paymob_card', 'fawry', 'instapay', etc.
    payment_token TEXT, -- Token من payment gateway
    paymob_order_id VARCHAR(255), -- Order ID من Paymob
    paymob_transaction_id VARCHAR(255), -- Transaction ID بعد الدفع
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'refunded'
    amount DECIMAL(10, 2) NOT NULL,
    callback_data JSONB, -- Callback data من payment gateway
    ip_address VARCHAR(50), -- IP للأمان
    user_agent TEXT, -- User agent للأمان
    is_3d_secure BOOLEAN DEFAULT FALSE, -- هل استخدم 3D Secure
    card_type VARCHAR(50), -- نوع البطاقة (Visa, MasterCard)
    refund_reason TEXT, -- سبب الاسترجاع
    refund_data JSONB, -- بيانات الاسترجاع
    refund_initiated_at TIMESTAMP, -- وقت بدء الاسترجاع
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    UNIQUE(payment_token)
);

-- Indexes for performance and security
CREATE INDEX IF NOT EXISTS idx_order_payment ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_paymob_transaction ON payment_transactions(paymob_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_created ON payment_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_ip ON payment_transactions(ip_address);

-- إضافة أعمدة جديدة لجدول orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_transaction_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending'; -- 'pending', 'paid', 'failed', 'refunded'

-- إنشاء index للبحث السريع
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_transaction ON orders(payment_transaction_id);

COMMENT ON TABLE payment_transactions IS 'جدول معاملات الدفع الإلكتروني - يدعم Paymob وغيرها';
COMMENT ON COLUMN payment_transactions.callback_data IS 'بيانات callback من payment gateway (JSONB)';
COMMENT ON COLUMN orders.payment_status IS 'حالة الدفع: pending, paid, failed, refunded';
