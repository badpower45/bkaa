const express = require('express');
const { query } = require('../database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// التحقق من صحة الكوبون وتطبيقه
router.post('/validate', [verifyToken], async (req, res) => {
    const { code, subtotal } = req.body;
    const userId = req.userId;

    if (!code || !subtotal) {
        return res.status(400).json({ error: 'كود الكوبون والمبلغ الإجمالي مطلوبان' });
    }

    try {
        // جلب معلومات الكوبون
        const { rows: couponRows } = await query(
            `SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND is_active = TRUE`,
            [code]
        );

        if (couponRows.length === 0) {
            return res.status(404).json({
                error: 'كود الكوبون غير صحيح أو منتهي الصلاحية',
                valid: false
            });
        }

        const coupon = couponRows[0];

        // التحقق من صلاحية الكوبون
        const now = new Date();

        // فحص تاريخ البداية
        if (coupon.valid_from && new Date(coupon.valid_from) > now) {
            return res.status(400).json({
                error: 'هذا الكوبون غير صالح للاستخدام بعد',
                valid: false
            });
        }

        // فحص تاريخ الانتهاء
        if (coupon.valid_until && new Date(coupon.valid_until) < now) {
            return res.status(400).json({
                error: 'هذا الكوبون منتهي الصلاحية',
                valid: false
            });
        }

        // فحص الحد الأدنى للطلب
        if (subtotal < coupon.min_order_value) {
            return res.status(400).json({
                error: `الحد الأدنى للطلب ${coupon.min_order_value} جنيه لاستخدام هذا الكوبون`,
                valid: false,
                minOrder: coupon.min_order_value
            });
        }

        // فحص حد الاستخدام الكلي
        if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
            return res.status(400).json({
                error: 'عذراً، تم استنفاد جميع استخدامات هذا الكوبون',
                valid: false
            });
        }

        // فحص استخدام المستخدم للكوبون
        if (coupon.per_user_limit !== null) {
            const { rows: usageRows } = await query(
                `SELECT COUNT(*) as usage_count FROM coupon_usage
                 WHERE coupon_id = $1 AND user_id = $2`,
                [coupon.id, userId]
            );

            const userUsageCount = parseInt(usageRows[0].usage_count);

            if (userUsageCount >= coupon.per_user_limit) {
                return res.status(400).json({
                    error: 'لقد استخدمت هذا الكوبون من قبل',
                    valid: false
                });
            }
        }

        // حساب قيمة الخصم
        let discountAmount = 0;

        if (coupon.discount_type === 'percentage') {
            discountAmount = (subtotal * coupon.discount_value) / 100;

            // تطبيق الحد الأقصى للخصم
            if (coupon.max_discount && discountAmount > coupon.max_discount) {
                discountAmount = coupon.max_discount;
            }
        } else if (coupon.discount_type === 'fixed') {
            discountAmount = coupon.discount_value;

            // التأكد من أن الخصم لا يتجاوز المبلغ الإجمالي
            if (discountAmount > subtotal) {
                discountAmount = subtotal;
            }
        }

        // تقريب لأقرب قرشين
        discountAmount = Math.round(discountAmount * 100) / 100;

        res.json({
            valid: true,
            couponId: coupon.id,
            code: coupon.code,
            description: coupon.description,
            discountType: coupon.discount_type,
            discountValue: coupon.discount_value,
            discountAmount: discountAmount,
            finalTotal: subtotal - discountAmount,
            message: `تم تطبيق الكوبون بنجاح! وفرت ${discountAmount.toFixed(2)} جنيه`
        });

    } catch (err) {
        console.error('Error validating coupon:', err);
        res.status(500).json({ error: err.message, valid: false });
    }
});

// الحصول على جميع الكوبونات (Admin only)
router.get('/', [verifyToken], async (req, res) => {
    // التحقق من أن المستخدم أدمن
    const { rows: userRows } = await query(
        `SELECT role FROM users WHERE id = $1`,
        [req.userId]
    );

    if (userRows.length === 0 || !['admin', 'manager'].includes(userRows[0].role)) {
        return res.status(403).json({ error: 'غير مصرح لك بالوصول' });
    }

    try {
        const { rows } = await query(
            `SELECT c.*,
                    u.name as created_by_name,
                    (SELECT COUNT(*) FROM coupon_usage WHERE coupon_id = c.id) as total_usage,
                    (SELECT COUNT(DISTINCT user_id) FROM coupon_usage WHERE coupon_id = c.id) as unique_users
             FROM coupons c
             LEFT JOIN users u ON c.created_by = u.id
             ORDER BY c.created_at DESC`
        );

        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error('Error fetching coupons:', err);
        res.status(500).json({ error: err.message });
    }
});

// إنشاء كوبون جديد (Admin only)
router.post('/', [verifyToken], async (req, res) => {
    // التحقق من أن المستخدم أدمن
    const { rows: userRows } = await query(
        `SELECT role FROM users WHERE id = $1`,
        [req.userId]
    );

    if (userRows.length === 0 || !['admin', 'manager'].includes(userRows[0].role)) {
        return res.status(403).json({ error: 'غير مصرح لك بالوصول' });
    }

    const {
        code,
        description,
        discountType,
        discountValue,
        minOrderValue,
        maxDiscount,
        usageLimit,
        perUserLimit,
        validFrom,
        validUntil,
        isActive
    } = req.body;

    if (!code || !discountType || !discountValue) {
        return res.status(400).json({ error: 'الكود ونوع الخصم وقيمة الخصم مطلوبة' });
    }

    try {
        // التحقق من عدم وجود كوبون بنفس الكود
        const { rows: existingRows } = await query(
            `SELECT id FROM coupons WHERE UPPER(code) = UPPER($1)`,
            [code]
        );

        if (existingRows.length > 0) {
            return res.status(400).json({ error: 'يوجد كوبون بنفس الكود بالفعل' });
        }

        const result = await query(
            `INSERT INTO coupons (
                code, description, discount_type, discount_value,
                min_order_value, max_discount, usage_limit, per_user_limit,
                valid_from, valid_until, is_active, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                code.toUpperCase(),
                description,
                discountType,
                discountValue,
                minOrderValue || 0,
                maxDiscount || null,
                usageLimit || null,
                perUserLimit || 1,
                validFrom || new Date(),
                validUntil || null,
                isActive !== false,
                req.userId
            ]
        );

        res.json({ message: 'تم إنشاء الكوبون بنجاح', data: result.rows[0] });
    } catch (err) {
        console.error('Error creating coupon:', err);
        res.status(500).json({ error: err.message });
    }
});

// تحديث كوبون (Admin only)
router.put('/:id', [verifyToken], async (req, res) => {
    const { id } = req.params;

    // التحقق من أن المستخدم أدمن
    const { rows: userRows } = await query(
        `SELECT role FROM users WHERE id = $1`,
        [req.userId]
    );

    if (userRows.length === 0 || !['admin', 'manager'].includes(userRows[0].role)) {
        return res.status(403).json({ error: 'غير مصرح لك بالوصول' });
    }

    const {
        code,
        description,
        discountType,
        discountValue,
        minOrderValue,
        maxDiscount,
        usageLimit,
        perUserLimit,
        validFrom,
        validUntil,
        isActive
    } = req.body;

    try {
        const result = await query(
            `UPDATE coupons
             SET code = COALESCE($1, code),
                 description = COALESCE($2, description),
                 discount_type = COALESCE($3, discount_type),
                 discount_value = COALESCE($4, discount_value),
                 min_order_value = COALESCE($5, min_order_value),
                 max_discount = COALESCE($6, max_discount),
                 usage_limit = COALESCE($7, usage_limit),
                 per_user_limit = COALESCE($8, per_user_limit),
                 valid_from = COALESCE($9, valid_from),
                 valid_until = COALESCE($10, valid_until),
                 is_active = COALESCE($11, is_active),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $12
             RETURNING *`,
            [
                code ? code.toUpperCase() : null,
                description,
                discountType,
                discountValue,
                minOrderValue,
                maxDiscount,
                usageLimit,
                perUserLimit,
                validFrom,
                validUntil,
                isActive,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'الكوبون غير موجود' });
        }

        res.json({ message: 'تم تحديث الكوبون بنجاح', data: result.rows[0] });
    } catch (err) {
        console.error('Error updating coupon:', err);
        res.status(500).json({ error: err.message });
    }
});

// حذف كوبون (Admin only)
router.delete('/:id', [verifyToken], async (req, res) => {
    const { id } = req.params;

    // التحقق من أن المستخدم أدمن
    const { rows: userRows } = await query(
        `SELECT role FROM users WHERE id = $1`,
        [req.userId]
    );

    if (userRows.length === 0 || !['admin', 'manager'].includes(userRows[0].role)) {
        return res.status(403).json({ error: 'غير مصرح لك بالوصول' });
    }

    try {
        const result = await query(
            `DELETE FROM coupons WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'الكوبون غير موجود' });
        }

        res.json({ message: 'تم حذف الكوبون بنجاح' });
    } catch (err) {
        console.error('Error deleting coupon:', err);
        res.status(500).json({ error: err.message });
    }
});

// الحصول على إحصائيات استخدام كوبون (Admin only)
router.get('/usage/:code', [verifyToken], async (req, res) => {
    const { code } = req.params;

    // التحقق من أن المستخدم أدمن
    const { rows: userRows } = await query(
        `SELECT role FROM users WHERE id = $1`,
        [req.userId]
    );

    if (userRows.length === 0 || !['admin', 'manager'].includes(userRows[0].role)) {
        return res.status(403).json({ error: 'غير مصرح لك بالوصول' });
    }

    try {
        // جلب معلومات الكوبون
        const { rows: couponRows } = await query(
            `SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)`,
            [code]
        );

        if (couponRows.length === 0) {
            return res.status(404).json({ error: 'الكوبون غير موجود' });
        }

        const coupon = couponRows[0];

        // جلب إحصائيات الاستخدام
        const { rows: usageRows } = await query(
            `SELECT
                cu.*,
                u.name as user_name,
                u.email as user_email,
                o.total as order_total,
                o.date as order_date
             FROM coupon_usage cu
             JOIN users u ON cu.user_id = u.id
             JOIN orders o ON cu.order_id = o.id
             WHERE cu.coupon_id = $1
             ORDER BY cu.used_at DESC`,
            [coupon.id]
        );

        // إحصائيات عامة
        const { rows: statsRows } = await query(
            `SELECT
                COUNT(*) as total_uses,
                COUNT(DISTINCT user_id) as unique_users,
                SUM(discount_amount) as total_discount,
                AVG(discount_amount) as avg_discount,
                MIN(used_at) as first_use,
                MAX(used_at) as last_use
             FROM coupon_usage
             WHERE coupon_id = $1`,
            [coupon.id]
        );

        res.json({
            message: 'success',
            coupon: coupon,
            stats: statsRows[0],
            usage: usageRows
        });
    } catch (err) {
        console.error('Error fetching coupon usage:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
