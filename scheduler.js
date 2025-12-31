import { query } from './database.js';
import { notifyCustomerOrderUpdate } from './socket.js';

// =============================================
// Scheduler للمهام الدورية
// =============================================

let schedulerInterval = null;

// ملاحظة: تم إلغاء sendPendingOrderReminders و checkExpiredOrderAssignments
// لأن القبول يتم تلقائياً عند تعيين الطلب للديليفري

/**
 * فحص الطلبات المتأخرة وإرسال تنبيهات
 */
const checkLateOrders = async () => {
    try {
        // جلب الطلبات التي تجاوزت الوقت المتوقع ولم يتم تسليمها
        const { rows: lateOrders } = await query(`
            SELECT oa.order_id, oa.delivery_staff_id, oa.expected_delivery_time, oa.accepted_at,
                   ds.name as driver_name,
                   EXTRACT(EPOCH FROM (NOW() - oa.accepted_at))/60 as elapsed_minutes
            FROM order_assignments oa
            LEFT JOIN delivery_staff ds ON oa.delivery_staff_id = ds.id
            WHERE oa.status IN ('accepted', 'picked_up', 'arriving')
              AND oa.expected_delivery_time IS NOT NULL
              AND oa.accepted_at IS NOT NULL
              AND EXTRACT(EPOCH FROM (NOW() - oa.accepted_at))/60 > oa.expected_delivery_time
              AND (oa.is_late IS NULL OR oa.is_late = FALSE)
        `);

        for (const order of lateOrders) {
            try {
                // تحديث حالة التأخير
                const lateMinutes = Math.round(order.elapsed_minutes - order.expected_delivery_time);
                await query(`
                    UPDATE order_assignments 
                    SET is_late = TRUE, late_minutes = $2
                    WHERE order_id = $1
                `, [order.order_id, lateMinutes]);

                console.log(`⚠️ Order #${order.order_id} is late by ${lateMinutes} minutes`);

                // يمكن إضافة إشعار للإدارة هنا
            } catch (err) {
                console.error(`Error marking order ${order.order_id} as late:`, err);
            }
        }
    } catch (err) {
        console.error('Error in checkLateOrders:', err);
    }
};

/**
 * تنظيف البيانات القديمة (اختياري)
 */
const cleanupOldData = async () => {
    try {
        // حذف سجلات المواقع القديمة (أكثر من 7 أيام)
        await query(`
            DELETE FROM driver_location_history 
            WHERE recorded_at < NOW() - INTERVAL '7 days'
        `);

        // حذف الإشعارات المقروءة القديمة (أكثر من 30 يوم)
        await query(`
            DELETE FROM order_notifications 
            WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '30 days'
        `);
    } catch (err) {
        // الجداول قد لا تكون موجودة بعد
        if (!err.message.includes('does not exist')) {
            console.error('Error in cleanupOldData:', err);
        }
    }
};

/**
 * بدء الـ Scheduler
 */
export const startScheduler = () => {
    console.log('🕐 Starting order scheduler...');

    // تشغيل فحص الطلبات المتأخرة كل دقيقة
    schedulerInterval = setInterval(async () => {
        await checkLateOrders();
    }, 60 * 1000); // كل دقيقة

    // تنظيف البيانات القديمة يومياً (كل 24 ساعة)
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

    // تشغيل فوري عند البدء
    checkLateOrders();

    console.log('✅ Order scheduler started (auto-accept enabled)');
};

/**
 * إيقاف الـ Scheduler
 */
export const stopScheduler = () => {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('🛑 Order scheduler stopped');
    }
};

export default { startScheduler, stopScheduler };
