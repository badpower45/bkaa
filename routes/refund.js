import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
import axios from 'axios';

const router = express.Router();

const PAYMOB_CONFIG = {
    API_KEY: process.env.PAYMOB_API_KEY,
    BASE_URL: 'https://accept.paymob.com/api'
};

/**
 * POST /api/refund/initiate
 * بدء عملية استرجاع المبلغ (للأدمن فقط)
 */
router.post('/initiate', verifyToken, isAdmin, async (req, res) => {
    try {
        const { orderId, reason } = req.body;

        if (!orderId) {
            return res.status(400).json({ error: 'رقم الطلب مطلوب' });
        }

        // Get order and transaction details
        const { rows } = await query(
            `SELECT o.*, pt.paymob_transaction_id, pt.amount, pt.status 
             FROM orders o
             LEFT JOIN payment_transactions pt ON pt.order_id = o.id
             WHERE o.id = $1`,
            [orderId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'الطلب غير موجود' });
        }

        const order = rows[0];

        // Validate refund eligibility
        if (order.payment_status !== 'paid') {
            return res.status(400).json({ 
                error: 'لا يمكن استرجاع مبلغ طلب لم يتم دفعه' 
            });
        }

        if (order.payment_status === 'refunded') {
            return res.status(400).json({ 
                error: 'تم استرجاع مبلغ هذا الطلب بالفعل' 
            });
        }

        if (!order.paymob_transaction_id) {
            return res.status(400).json({ 
                error: 'معاملة الدفع غير موجودة' 
            });
        }

        console.log(`💸 Initiating refund for order ${orderId}`);
        console.log(`💳 Transaction ID: ${order.paymob_transaction_id}`);
        console.log(`💰 Amount: ${order.amount} EGP`);

        // Authenticate with Paymob
        const authResponse = await axios.post(`${PAYMOB_CONFIG.BASE_URL}/auth/tokens`, {
            api_key: PAYMOB_CONFIG.API_KEY
        });

        const authToken = authResponse.data.token;

        // Initiate refund
        const refundResponse = await axios.post(
            `${PAYMOB_CONFIG.BASE_URL}/acceptance/void_refund/refund`,
            {
                auth_token: authToken,
                transaction_id: order.paymob_transaction_id,
                amount_cents: Math.round(parseFloat(order.amount) * 100)
            }
        );

        console.log('✅ Refund initiated:', refundResponse.data);

        // Update database
        await query('BEGIN');

        // Update payment transaction
        await query(
            `UPDATE payment_transactions 
             SET status = 'refunded', 
                 refund_initiated_at = NOW(),
                 refund_reason = $1,
                 refund_data = $2
             WHERE paymob_transaction_id = $3`,
            [reason, JSON.stringify(refundResponse.data), order.paymob_transaction_id]
        );

        // Update order
        await query(
            `UPDATE orders 
             SET payment_status = 'refunded',
                 status = 'cancelled',
                 updated_at = NOW()
             WHERE id = $1`,
            [orderId]
        );

        await query('COMMIT');

        res.json({
            success: true,
            message: 'تم بدء عملية الاسترجاع بنجاح',
            refund_id: refundResponse.data.id,
            amount: order.amount
        });

    } catch (error) {
        await query('ROLLBACK').catch(() => {});
        console.error('❌ Refund error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'فشل بدء عملية الاسترجاع',
            details: error.response?.data?.message || error.message
        });
    }
});

/**
 * GET /api/refund/status/:orderId
 * فحص حالة الاسترجاع
 */
router.get('/status/:orderId', verifyToken, isAdmin, async (req, res) => {
    try {
        const { orderId } = req.params;

        const { rows } = await query(
            `SELECT pt.*, o.order_code 
             FROM payment_transactions pt
             JOIN orders o ON o.id = pt.order_id
             WHERE pt.order_id = $1 AND pt.status = 'refunded'`,
            [orderId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ 
                error: 'لم يتم العثور على عملية استرجاع لهذا الطلب' 
            });
        }

        res.json({
            success: true,
            refund: rows[0]
        });

    } catch (error) {
        console.error('❌ Refund status check error:', error);
        res.status(500).json({ error: 'فشل التحقق من حالة الاسترجاع' });
    }
});

export default router;
