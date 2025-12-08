import { query } from './database.js';
import { notifyDriverNewOrder, notifyCustomerOrderUpdate, notifyDistributorsNewOrder } from './socket.js';

// =============================================
// Scheduler للمهام الدورية
// =============================================

let schedulerInterval = null;

/**
 * فحص الطلبات المنتهية مهلة قبولها
 * يتم تشغيلها كل دقيقة
 */
const checkExpiredOrderAssignments = async () => {
    try {
        // جلب الطلبات التي انتهت مهلة قبولها
        const { rows: expiredOrders } = await query(`
            SELECT oa.id, oa.order_id, oa.delivery_staff_id, o.branch_id
            FROM order_assignments oa
            JOIN orders o ON oa.order_id = o.id
            WHERE oa.status = 'assigned' 
              AND oa.accept_deadline IS NOT NULL 
              AND oa.accept_deadline < NOW()
        `);

        for (const order of expiredOrders) {
            try {
                await query('BEGIN');

                // إلغاء التعيين
                await query(`
                    UPDATE order_assignments 
                    SET status = 'expired', 
                        delivery_staff_id = NULL
                    WHERE id = $1
                `, [order.id]);

                // إرجاع الطلب لحالة "جاهز"
                await query("UPDATE orders SET status = 'ready' WHERE id = $1", [order.order_id]);

                // تحديث إحصائيات الديليفري
                if (order.delivery_staff_id) {
                    await query(`
                        UPDATE delivery_staff 
                        SET current_orders = GREATEST(0, current_orders - 1),
                            expired_orders = expired_orders + 1
                        WHERE id = $1
                    `, [order.delivery_staff_id]);
                }

                await query('COMMIT');

                console.log(`⏰ Order #${order.order_id} expired - returned to ready status`);

                // إشعار الموزعين بأن الطلب متاح مرة أخرى
                notifyDistributorsNewOrder(order.branch_id, {
                    orderId: order.order_id,
                    type: 'order_returned',
                    message: `الطلب #${order.order_id} عاد للتوزيع - انتهت مهلة السائق`
                });

                // إشعار العميل
                notifyCustomerOrderUpdate(order.order_id, 'ready', {
                    message: 'جاري البحث عن سائق جديد'
                });

            } catch (err) {
                await query('ROLLBACK');
                console.error(`Error expiring order ${order.order_id}:`, err);
            }
        }

        if (expiredOrders.length > 0) {
            console.log(`⏰ Processed ${expiredOrders.length} expired order assignments`);
        }
    } catch (err) {
        console.error('Error in checkExpiredOrderAssignments:', err);
    }
};

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

    // تشغيل فحص الطلبات المنتهية كل دقيقة
    schedulerInterval = setInterval(async () => {
        await checkExpiredOrderAssignments();
        await checkLateOrders();
    }, 60 * 1000); // كل دقيقة

    // تنظيف البيانات القديمة يومياً (كل 24 ساعة)
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

    // تشغيل فوري عند البدء
    checkExpiredOrderAssignments();
    checkLateOrders();

    console.log('✅ Order scheduler started');
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
