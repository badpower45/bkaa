import express from 'express';
import { query } from '../database.js';
import { verifyToken, optionalAuth } from '../middleware/auth.js';
import { 
    initializePayment, 
    verifyPaymobCallback, 
    isPaymobConfigured 
} from '../services/paymob.js';
import {
    paymentLimiter,
    validatePaymentAmount,
    verifyOrderBeforePayment,
    detectFraud,
    logPaymentAttempt,
    paymentTimeout
} from '../middleware/paymentSecurity.js';

const router = express.Router();

/**
 * POST /api/payment/initialize
 * يبدأ عملية الدفع الإلكتروني عبر Paymob
 */
router.post('/initialize', 
    paymentLimiter,
    paymentTimeout(30000),
    optionalAuth, 
    validatePaymentAmount,
    verifyOrderBeforePayment,
    detectFraud,
    logPaymentAttempt,
    async (req, res) => {
    try {
        const { orderId, orderData, customerData } = req.body;

        // Validate required fields
        if (!orderId || !orderData || !customerData) {
            return res.status(400).json({ 
                error: 'بيانات الطلب أو العميل ناقصة' 
            });
        }

        // Check if Paymob is configured
        if (!isPaymobConfigured()) {
            return res.status(503).json({ 
                error: 'خدمة الدفع الإلكتروني غير متاحة حالياً',
                message: 'Paymob not configured. Please add API keys to environment variables.'
            });
        }

        console.log('💳 Initializing payment for order:', orderId);

        // Prepare order data for Paymob
        const paymobOrderData = {
            merchant_order_id: orderId,
            amount: orderData.amount || orderData.total,
            items: orderData.items || [],
            delivery_needed: orderData.delivery_needed !== false
        };

        // Initialize payment
        const paymentResult = await initializePayment(paymobOrderData, customerData);

        if (!paymentResult.success) {
            return res.status(500).json({ 
                error: paymentResult.error || 'فشل إنشاء عملية الدفع'
            });
        }

        // Save payment transaction to database with full audit trail
        const { rows } = await query(
            `INSERT INTO payment_transactions 
            (order_id, payment_method, payment_token, paymob_order_id, status, amount, 
             ip_address, user_agent, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) 
            RETURNING id`,
            [
                orderId, 
                'paymob_card', 
                paymentResult.payment_token, 
                paymentResult.paymob_order_id, 
                'pending', 
                orderData.amount,
                req.ip,
                req.headers['user-agent']
            ]
        );

        // Update order to mark payment in progress
        await query(
            `UPDATE orders 
             SET payment_status = 'processing', 
                 updated_at = NOW() 
             WHERE id = $1`,
            [orderId]
        );

        console.log('✅ Payment initialized successfully:', paymentResult.payment_url);

        res.json({
            success: true,
            payment_url: paymentResult.payment_url,
            payment_token: paymentResult.payment_token,
            transaction_id: rows[0].id,
            expires_in: 3600 // ساعة
        });

    } catch (error) {
        console.error('❌ Payment initialization error:', error);
        res.status(500).json({ 
            error: 'حدث خطأ أثناء إنشاء عملية الدفع',
            details: error.message 
        });
    }
});

/**
 * POST /api/payment/callback
 * يستقبل callback من Paymob بعد إتمام/فشل الدفع
 */
router.post('/callback', async (req, res) => {
    try {
        console.log('📥 Received Paymob callback');
        console.log('🔍 Callback data:', JSON.stringify(req.body, null, 2));
        
        const callbackData = req.body;

        // Verify HMAC signature
        const verification = verifyPaymobCallback(callbackData);

        if (!verification.isValid) {
            console.error('❌ Invalid HMAC signature - Possible fraud attempt!');
            console.error('❌ IP Address:', req.ip);
            
            // Log suspicious activity
            await query(
                `INSERT INTO security_logs (event_type, ip_address, details, created_at) 
                 VALUES ($1, $2, $3, NOW())`,
                ['invalid_payment_callback', req.ip, JSON.stringify(callbackData)]
            ).catch(err => console.error('Failed to log security event:', err));
            
            return res.status(400).json({ error: 'Invalid signature' });
        }

        console.log('✅ HMAC verified successfully');

        const { transactionId, success, amount, orderId, is_3d_secure, card_subtype } = verification;

        // Start transaction
        await query('BEGIN');

        try {
            // Update payment transaction status with full details
            const updateResult = await query(
                `UPDATE payment_transactions 
                SET status = $1, 
                    paymob_transaction_id = $2, 
                    completed_at = NOW(), 
                    callback_data = $3,
                    is_3d_secure = $4,
                    card_type = $5
                WHERE payment_token = $6
                RETURNING id, order_id`,
                [
                    success ? 'completed' : 'failed',
                    transactionId,
                    JSON.stringify(callbackData),
                    is_3d_secure || false,
                    card_subtype || 'unknown',
                    callbackData.token || callbackData.payment_token
                ]
            );

            if (updateResult.rows.length === 0) {
                throw new Error('Payment transaction not found');
            }

            const actualOrderId = updateResult.rows[0].order_id;

            // Update order payment status
            if (success) {
                await query(
                    `UPDATE orders 
                    SET payment_status = $1, 
                        payment_transaction_id = $2,
                        updated_at = NOW(),
                        status = CASE 
                            WHEN status = 'pending' THEN 'confirmed' 
                            ELSE status 
                        END
                    WHERE id = $3`,
                    ['paid', transactionId, actualOrderId]
                );

                console.log(`✅ Order ${actualOrderId} marked as PAID`);
                console.log(`💳 Transaction ${transactionId} - Amount: ${amount} EGP`);
                console.log(`🔒 3D Secure: ${is_3d_secure ? 'Yes' : 'No'}`);

                // Send success notification (email/SMS) - يمكن إضافتها لاحقاً
                
            } else {
                await query(
                    `UPDATE orders 
                    SET payment_status = $1, updated_at = NOW()
                    WHERE id = $2`,
                    ['failed', actualOrderId]
                );

                console.log(`❌ Payment failed for order ${actualOrderId}`);
                console.log(`❌ Reason:`, callbackData.data_message || 'Unknown');
            }

            await query('COMMIT');

            res.json({ 
                success: true,
                message: success ? 'Payment successful' : 'Payment failed'
            });

        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('❌ Payment callback error:', error);
        
        // Log critical error
        await query(
            `INSERT INTO error_logs (error_type, error_message, stack_trace, created_at) 
             VALUES ($1, $2, $3, NOW())`,
            ['payment_callback_error', error.message, error.stack]
        ).catch(err => console.error('Failed to log error:', err));
        
        res.status(500).json({ error: 'Callback processing failed' });
    }
});

/**
 * GET /api/payment/status/:orderId
 * يفحص حالة الدفع لطلب معين
 */
router.get('/status/:orderId', optionalAuth, async (req, res) => {
    try {
        const { orderId } = req.params;

        const { rows } = await query(
            `SELECT pt.*, o.order_code, o.payment_status 
            FROM payment_transactions pt
            LEFT JOIN orders o ON o.id = pt.order_id
            WHERE pt.order_id = $1 OR o.order_code = $1
            ORDER BY pt.created_at DESC
            LIMIT 1`,
            [orderId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'لم يتم العثور على معاملة دفع' });
        }

        const transaction = rows[0];

        res.json({
            success: true,
            transaction: {
                id: transaction.id,
                order_id: transaction.order_id,
                order_code: transaction.order_code,
                status: transaction.status,
                payment_status: transaction.payment_status,
                amount: transaction.amount,
                created_at: transaction.created_at,
                completed_at: transaction.completed_at
            }
        });

    } catch (error) {
        console.error('❌ Payment status check error:', error);
        res.status(500).json({ error: 'فشل التحقق من حالة الدفع' });
    }
});

/**
 * GET /api/payment/config
 * يرجع معلومات التكوين (للتحقق من التفعيل)
 */
router.get('/config', async (req, res) => {
    res.json({
        paymob_enabled: isPaymobConfigured(),
        iframe_id: process.env.PAYMOB_IFRAME_ID || null
    });
});

export default router;
