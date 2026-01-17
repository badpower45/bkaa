-- جداول الأمان والتدقيق (Security & Audit Tables)

-- جدول security_logs لتسجيل الأحداث الأمنية المشبوهة
CREATE TABLE IF NOT EXISTS security_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL, -- 'invalid_payment_callback', 'rate_limit_exceeded', etc.
    ip_address VARCHAR(50),
    user_id INTEGER,
    details JSONB,
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for security_logs
CREATE INDEX IF NOT EXISTS idx_security_event_type ON security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_severity ON security_logs(severity);
CREATE INDEX IF NOT EXISTS idx_security_created ON security_logs(created_at DESC);

-- جدول error_logs لتسجيل الأخطاء الحرجة
CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT,
    stack_trace TEXT,
    request_data JSONB,
    user_id INTEGER,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for error_logs
CREATE INDEX IF NOT EXISTS idx_error_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_created ON error_logs(created_at DESC);

-- جدول payment_audit_logs لتتبع جميع عمليات الدفع
CREATE TABLE IF NOT EXISTS payment_audit_logs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    transaction_id INTEGER,
    action VARCHAR(50) NOT NULL, -- 'initiated', 'completed', 'failed', 'refunded'
    user_id INTEGER,
    ip_address VARCHAR(50),
    user_agent TEXT,
    amount DECIMAL(10, 2),
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for payment_audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_order ON payment_audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON payment_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON payment_audit_logs(created_at DESC);

COMMENT ON TABLE security_logs IS 'تسجيل الأحداث الأمنية المشبوهة';
COMMENT ON TABLE error_logs IS 'تسجيل الأخطاء الحرجة للمراجعة';
COMMENT ON TABLE payment_audit_logs IS 'تدقيق كامل لجميع عمليات الدفع';
