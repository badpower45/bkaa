/**
 * Paymob Payment Gateway Integration
 * يدعم الدفع بالفيزا والماستركارد
 * 
 * للحصول على API Keys:
 * 1. سجل حساب على https://paymob.com
 * 2. اذهب للـ Dashboard > Settings > API Keys
 * 3. احصل على: API Key, Integration ID, HMAC Secret
 */

import axios from 'axios';

// Paymob API Configuration
const PAYMOB_CONFIG = {
    API_KEY: process.env.PAYMOB_API_KEY || 'YOUR_API_KEY_HERE',
    INTEGRATION_ID: process.env.PAYMOB_INTEGRATION_ID || 'YOUR_INTEGRATION_ID_HERE',
    IFRAME_ID: process.env.PAYMOB_IFRAME_ID || 'YOUR_IFRAME_ID_HERE',
    HMAC_SECRET: process.env.PAYMOB_HMAC_SECRET || 'YOUR_HMAC_SECRET_HERE',
    BASE_URL: 'https://accept.paymob.com/api'
};

/**
 * Step 1: Authenticate with Paymob
 * يحصل على Auth Token للاستخدام في باقي الـ API calls
 */
export async function authenticatePaymob() {
    try {
        const response = await axios.post(`${PAYMOB_CONFIG.BASE_URL}/auth/tokens`, {
            api_key: PAYMOB_CONFIG.API_KEY
        });
        
        return response.data.token;
    } catch (error) {
        console.error('❌ Paymob Authentication Error:', error.response?.data || error.message);
        throw new Error('فشل الاتصال ببوابة الدفع');
    }
}

/**
 * Step 2: Create Order on Paymob
 * ينشئ طلب جديد على سيرفر Paymob
 */
export async function createPaymobOrder(authToken, orderData) {
    try {
        const response = await axios.post(`${PAYMOB_CONFIG.BASE_URL}/ecommerce/orders`, {
            auth_token: authToken,
            delivery_needed: orderData.delivery_needed || false,
            amount_cents: Math.round(orderData.amount * 100), // تحويل للقروش
            currency: "EGP",
            merchant_order_id: orderData.merchant_order_id, // order ID من قاعدة البيانات
            items: orderData.items || []
        });
        
        return response.data;
    } catch (error) {
        console.error('❌ Paymob Order Creation Error:', error.response?.data || error.message);
        throw new Error('فشل إنشاء طلب الدفع');
    }
}

/**
 * Step 3: Get Payment Key
 * يحصل على مفتاح الدفع للاستخدام في الـ iframe
 */
export async function getPaymentKey(authToken, orderData, customerData) {
    try {
        const response = await axios.post(`${PAYMOB_CONFIG.BASE_URL}/acceptance/payment_keys`, {
            auth_token: authToken,
            amount_cents: Math.round(orderData.amount * 100),
            expiration: 3600, // صلاحية ساعة
            order_id: orderData.paymob_order_id,
            billing_data: {
                apartment: customerData.building || "NA",
                email: customerData.email || "customer@example.com",
                floor: "NA",
                first_name: customerData.firstName || "Customer",
                street: customerData.street || "NA",
                building: customerData.building || "NA",
                phone_number: customerData.phone || "01000000000",
                shipping_method: "PKG",
                postal_code: "NA",
                city: customerData.governorate || "Cairo",
                country: "EG",
                last_name: customerData.lastName || "NA",
                state: customerData.governorate || "Cairo"
            },
            currency: "EGP",
            integration_id: parseInt(PAYMOB_CONFIG.INTEGRATION_ID),
            lock_order_when_paid: true
        });
        
        return response.data.token;
    } catch (error) {
        console.error('❌ Paymob Payment Key Error:', error.response?.data || error.message);
        throw new Error('فشل الحصول على مفتاح الدفع');
    }
}

/**
 * Complete Flow: Initialize Payment
 * يجهز كل شيء ويرجع payment URL للعميل
 */
export async function initializePayment(orderData, customerData) {
    try {
        console.log('🔐 Step 1: Authenticating with Paymob...');
        const authToken = await authenticatePaymob();
        
        console.log('📦 Step 2: Creating Paymob order...');
        const paymobOrder = await createPaymobOrder(authToken, orderData);
        
        console.log('🔑 Step 3: Getting payment key...');
        const paymentToken = await getPaymentKey(authToken, {
            ...orderData,
            paymob_order_id: paymobOrder.id
        }, customerData);
        
        // Build payment URL
        const paymentUrl = `https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_CONFIG.IFRAME_ID}?payment_token=${paymentToken}`;
        
        return {
            success: true,
            payment_url: paymentUrl,
            payment_token: paymentToken,
            paymob_order_id: paymobOrder.id
        };
    } catch (error) {
        console.error('❌ Payment Initialization Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Verify Payment Callback
 * يتحقق من صحة callback من Paymob باستخدام HMAC
 */
export function verifyPaymobCallback(callbackData) {
    try {
        const crypto = require('crypto'); // Use require instead of await import
        
        const {
            amount_cents,
            created_at,
            currency,
            error_occured,
            has_parent_transaction,
            id,
            integration_id,
            is_3d_secure,
            is_auth,
            is_capture,
            is_refunded,
            is_standalone_payment,
            is_voided,
            order,
            owner,
            pending,
            source_data_pan,
            source_data_sub_type,
            source_data_type,
            success,
            hmac
        } = callbackData;

        // Build HMAC string (ORDER IS CRITICAL!)
        const hmacString = [
            amount_cents,
            created_at,
            currency,
            error_occured,
            has_parent_transaction,
            id,
            integration_id,
            is_3d_secure,
            is_auth,
            is_capture,
            is_refunded,
            is_standalone_payment,
            is_voided,
            order?.id || order,
            owner,
            pending,
            source_data_pan,
            source_data_sub_type,
            source_data_type,
            success
        ].join('');

        // Calculate HMAC (synchronous import)
        const crypto = require('crypto');
        const calculatedHmac = crypto
            .createHmac('sha512', PAYMOB_CONFIG.HMAC_SECRET)
            .update(hmacString)
            .digest('hex');

        const isValid = calculatedHmac === hmac;
        
        return {
            isValid,
            transactionId: id,
            success: success === 'true' || success === true,
            amount: amount_cents / 100,
            orderId: order?.merchant_order_id || order,
            is_3d_secure,
            card_subtype: source_data_sub_type
        };
    } catch (error) {
        console.error('❌ HMAC Verification Error:', error);
        return { isValid: false, error: error.message };
    }
}

/**
 * Check if Paymob is configured
 */
export function isPaymobConfigured() {
    return (
        PAYMOB_CONFIG.API_KEY !== 'YOUR_API_KEY_HERE' &&
        PAYMOB_CONFIG.INTEGRATION_ID !== 'YOUR_INTEGRATION_ID_HERE' &&
        PAYMOB_CONFIG.IFRAME_ID !== 'YOUR_IFRAME_ID_HERE' &&
        PAYMOB_CONFIG.HMAC_SECRET !== 'YOUR_HMAC_SECRET_HERE'
    );
}

export default {
    authenticatePaymob,
    createPaymobOrder,
    getPaymentKey,
    initializePayment,
    verifyPaymobCallback,
    isPaymobConfigured
};
