const express = require('express');
const { query } = require('../database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// حساب رسوم التوصيل
router.post('/calculate', async (req, res) => {
    const { branchId, subtotal, customerLat, customerLng } = req.body;

    if (!branchId || !subtotal) {
        return res.status(400).json({ error: 'Branch ID and subtotal are required' });
    }

    try {
        // جلب إعدادات رسوم التوصيل للفرع
        const { rows: feeRows } = await query(
            `SELECT * FROM delivery_fees WHERE branch_id = $1 AND is_active = TRUE LIMIT 1`,
            [branchId]
        );

        if (feeRows.length === 0) {
            // إذا لم توجد إعدادات، استخدم القيم الافتراضية
            return res.json({
                deliveryFee: 20,
                freeDelivery: false,
                minOrder: 50,
                canDeliver: subtotal >= 50,
                message: subtotal < 50 ? 'الحد الأدنى للطلب 50 جنيه' : null
            });
        }

        const fee = feeRows[0];

        // فحص الحد الأدنى للطلب
        if (subtotal < fee.min_order) {
            return res.json({
                deliveryFee: 0,
                freeDelivery: false,
                minOrder: fee.min_order,
                canDeliver: false,
                message: `الحد الأدنى للطلب ${fee.min_order} جنيه`
            });
        }

        // فحص التوصيل المجاني
        if (fee.free_delivery_threshold && subtotal >= fee.free_delivery_threshold) {
            return res.json({
                deliveryFee: 0,
                freeDelivery: true,
                minOrder: fee.min_order,
                canDeliver: true,
                message: 'توصيل مجاني! 🎉'
            });
        }

        let totalFee = fee.base_fee;

        // حساب رسوم المسافة إذا توفرت الإحداثيات
        if (customerLat && customerLng) {
            const { rows: branchRows } = await query(
                `SELECT location_lat, location_lng FROM branches WHERE id = $1`,
                [branchId]
            );

            if (branchRows.length > 0 && branchRows[0].location_lat && branchRows[0].location_lng) {
                const distance = calculateDistance(
                    branchRows[0].location_lat,
                    branchRows[0].location_lng,
                    customerLat,
                    customerLng
                );

                // فحص أقصى مسافة
                if (distance > fee.max_distance_km) {
                    return res.json({
                        deliveryFee: 0,
                        freeDelivery: false,
                        minOrder: fee.min_order,
                        canDeliver: false,
                        distance: distance.toFixed(2),
                        maxDistance: fee.max_distance_km,
                        message: `عذراً، أقصى مسافة للتوصيل ${fee.max_distance_km} كم`
                    });
                }

                // إضافة رسوم المسافة (إذا كانت أكثر من 5 كم مثلاً)
                if (distance > 5) {
                    const extraKm = distance - 5;
                    totalFee += extraKm * fee.per_km_fee;
                }
            }
        }

        // فحص ساعات الذروة
        if (fee.peak_hours_start && fee.peak_hours_end) {
            const now = new Date();
            const currentTime = now.toTimeString().slice(0, 8);

            if (currentTime >= fee.peak_hours_start && currentTime <= fee.peak_hours_end) {
                totalFee *= fee.peak_hours_multiplier;
            }
        }

        res.json({
            deliveryFee: Math.round(totalFee * 100) / 100, // تقريب لأقرب قرشين
            freeDelivery: false,
            minOrder: fee.min_order,
            canDeliver: true,
            message: null
        });

    } catch (err) {
        console.error('Error calculating delivery fee:', err);
        res.status(500).json({ error: err.message });
    }
});

// دالة حساب المسافة بين نقطتين (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // نصف قطر الأرض بالكيلومترات
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// الحصول على إعدادات رسوم التوصيل لفرع
router.get('/:branchId', async (req, res) => {
    const { branchId } = req.params;

    try {
        const { rows } = await query(
            `SELECT * FROM delivery_fees WHERE branch_id = $1 AND is_active = TRUE`,
            [branchId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No delivery fees found for this branch' });
        }

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// تحديث إعدادات رسوم التوصيل (Admin only)
router.put('/:id', [verifyToken], async (req, res) => {
    const { id } = req.params;
    const {
        minOrder,
        baseFee,
        freeDeliveryThreshold,
        perKmFee,
        maxDistanceKm,
        peakHoursMultiplier,
        peakHoursStart,
        peakHoursEnd,
        isActive
    } = req.body;

    try {
        const result = await query(
            `UPDATE delivery_fees
             SET min_order = COALESCE($1, min_order),
                 base_fee = COALESCE($2, base_fee),
                 free_delivery_threshold = COALESCE($3, free_delivery_threshold),
                 per_km_fee = COALESCE($4, per_km_fee),
                 max_distance_km = COALESCE($5, max_distance_km),
                 peak_hours_multiplier = COALESCE($6, peak_hours_multiplier),
                 peak_hours_start = COALESCE($7, peak_hours_start),
                 peak_hours_end = COALESCE($8, peak_hours_end),
                 is_active = COALESCE($9, is_active)
             WHERE id = $10
             RETURNING *`,
            [minOrder, baseFee, freeDeliveryThreshold, perKmFee, maxDistanceKm,
             peakHoursMultiplier, peakHoursStart, peakHoursEnd, isActive, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Delivery fee settings not found' });
        }

        res.json({ message: 'success', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
