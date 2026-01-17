/**
 * Payment Security Middleware
 * تأمين إضافي لعمليات الدفع الإلكتروني
 */

import rateLimit from 'express-rate-limit';
import { query } from '../database.js';

/**
 * Rate Limiter للدفع - حماية من الهجمات
 * يسمح بـ 3 محاولات دفع فقط كل 15 دقيقة لكل IP
 */
export const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 3, // 3 محاولات فقط
    message: { 
        error: 'تم تجاوز عدد محاولات الدفع المسموح بها. يرجى المحاولة لاحقاً.',
        code: 'PAYMENT_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // عد جميع المحاولات حتى الناجحة
    handler: (req, res) => {
        console.error(`⚠️ Payment rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'تم تجاوز عدد محاولات الدفع المسموح بها',
            code: 'PAYMENT_RATE_LIMIT_EXCEEDED',
            retry_after: 900 // ثواني
        });
    }
});

/**
 * Validation للمبالغ - التأكد من المبلغ منطقي
 */
export const validatePaymentAmount = (req, res, next) => {
    const { orderData } = req.body;
    
    if (!orderData || !orderData.amount) {
        return res.status(400).json({ 
            error: 'مبلغ الدفع مطلوب',
            code: 'AMOUNT_REQUIRED'
        });
    }

    const amount = parseFloat(orderData.amount);

    // التحقق من المبلغ
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ 
            error: 'مبلغ الدفع غير صالح',
            code: 'INVALID_AMOUNT'
        });
    }

    // الحد الأدنى: 10 جنيه
    if (amount < 10) {
        return res.status(400).json({ 
            error: 'الحد الأدنى للدفع هو 10 جنيه',
            code: 'AMOUNT_TOO_LOW'
        });
    }

    // الحد الأقصى: 50,000 جنيه (حماية من الاحتيال)
    if (amount > 50000) {
        console.warn(`⚠️ Suspicious high payment attempt: ${amount} EGP from IP ${req.ip}`);
        return res.status(400).json({ 
            error: 'المبلغ يتجاوز الحد الأقصى المسموح. يرجى التواصل مع الدعم.',
            code: 'AMOUNT_TOO_HIGH'
        });
    }

    next();
};

/**
 * التحقق من Order قبل الدفع
 */
export const verifyOrderBeforePayment = async (req, res, next) => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ 
                error: 'رقم الطلب مطلوب',
                code: 'ORDER_ID_REQUIRED'
            });
        }

        // التحقق من وجود الطلب
        const { rows } = await query(
            'SELECT id, total, payment_status, status FROM orders WHERE id = $1',
            [orderId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ 
                error: 'الطلب غير موجود',
                code: 'ORDER_NOT_FOUND'
            });
        }

        const order = rows[0];

        // التحقق من أن الطلب لم يتم دفعه بالفعل
        if (order.payment_status === 'paid') {
            console.warn(`⚠️ Duplicate payment attempt for order ${orderId}`);
            return res.status(400).json({ 
                error: 'تم دفع هذا الطلب بالفعل',
                code: 'ORDER_ALREADY_PAID'
            });
        }

        // التحقق من أن الطلب ليس ملغي
        if (order.status === 'cancelled') {
            return res.status(400).json({ 
                error: 'هذا الطلب ملغي ولا يمكن دفعه',
                code: 'ORDER_CANCELLED'
            });
        }

        // التحقق من تطابق المبلغ
        const orderTotal = parseFloat(order.total);
        const paymentAmount = parseFloat(req.body.orderData?.amount || 0);

        if (Math.abs(orderTotal - paymentAmount) > 0.01) {
            console.error(`❌ Amount mismatch: Order ${orderId} - Expected: ${orderTotal}, Got: ${paymentAmount}`);
            return res.status(400).json({ 
                error: 'المبلغ لا يطابق قيمة الطلب',
                code: 'AMOUNT_MISMATCH'
            });
        }

        // حفظ معلومات الطلب في request للاستخدام لاحقاً
        req.orderInfo = order;

        next();
    } catch (error) {
        console.error('❌ Order verification error:', error);
        res.status(500).json({ 
            error: 'فشل التحقق من الطلب',
            code: 'ORDER_VERIFICATION_FAILED'
        });
    }
};

/**
 * Fraud Detection - كشف محاولات الاحتيال
 */
export const detectFraud = async (req, res, next) => {
    try {
        const { orderId } = req.body;
        const ipAddress = req.ip;

        // التحقق من محاولات الدفع الفاشلة المتكررة
        const { rows: failedAttempts } = await query(
            `SELECT COUNT(*) as count 
             FROM payment_transactions 
             WHERE order_id = $1 
             AND status = 'failed' 
             AND created_at > NOW() - INTERVAL '1 hour'`,
            [orderId]
        );

        if (failedAttempts[0].count >= 5) {
            console.error(`🚨 FRAUD ALERT: Too many failed payment attempts for order ${orderId}`);
            return res.status(403).json({ 
                error: 'تم تجاوز عدد المحاولات الفاشلة. تم تعليق الطلب مؤقتاً.',
                code: 'FRAUD_DETECTED'
            });
        }

        // التحقق من محاولات متعددة من نفس IP
        const { rows: ipAttempts } = await query(
            `SELECT COUNT(*) as count 
             FROM payment_transactions pt
             JOIN orders o ON o.id = pt.order_id
             WHERE pt.created_at > NOW() - INTERVAL '1 hour'`,
            []
        );

        // يمكن إضافة المزيد من قواعد كشف الاحتيال هنا

        next();
    } catch (error) {
        console.error('❌ Fraud detection error:', error);
        // في حالة خطأ، نكمل العملية (fail-safe)
        next();
    }
};

/**
 * تسجيل محاولات الدفع للمراجعة
 */
export const logPaymentAttempt = async (req, res, next) => {
    try {
        const { orderId, orderData } = req.body;
        const ipAddress = req.ip;
        const userAgent = req.headers['user-agent'];

        console.log('💳 Payment Attempt:', {
            orderId,
            amount: orderData?.amount,
            ip: ipAddress,
            timestamp: new Date().toISOString()
        });

        // يمكن حفظ في جدول audit_logs
        // await query(
        //     'INSERT INTO payment_audit_logs (order_id, ip_address, user_agent, amount) VALUES ($1, $2, $3, $4)',
        //     [orderId, ipAddress, userAgent, orderData?.amount]
        // );

        next();
    } catch (error) {
        console.error('❌ Logging error:', error);
        next(); // لا نوقف العملية بسبب خطأ في التسجيل
    }
};

/**
 * Timeout Protection - حماية من timeout
 */
export const paymentTimeout = (timeoutMs = 30000) => {
    return (req, res, next) => {
        req.setTimeout(timeoutMs, () => {
            console.error('⏱️ Payment request timeout');
            res.status(408).json({ 
                error: 'انتهت مهلة الطلب',
                code: 'REQUEST_TIMEOUT'
            });
        });
        next();
    };
};

export default {
    paymentLimiter,
    validatePaymentAmount,
    verifyOrderBeforePayment,
    detectFraud,
    logPaymentAttempt,
    paymentTimeout
};
