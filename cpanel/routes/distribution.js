const express = require('express');
const { query } = require('../database');
const { verifyToken, isAdmin } = require('../middleware/auth');
const { 
    notifyDriverNewOrder, 
    notifyCustomerOrderUpdate, 
    notifyDistributorsNewOrder,
    getDriverLocation,
    isDriverConnected 
} = require('../socket');

const router = express.Router();

// الوقت المتوقع الافتراضي للتوصيل (بالدقائق)
const DEFAULT_EXPECTED_DELIVERY_TIME = 45;

// ============================================
// موظفي التوصيل (Delivery Staff)
// ============================================

// الحصول على جميع موظفي التوصيل
router.get('/delivery-staff', verifyToken, async (req, res) => {
    const { branchId } = req.query;
    
    try {
        let sql = `
            SELECT ds.*, u.email, u.role,
                   ARRAY_AGG(DISTINCT b.id) as branch_ids,
                   ARRAY_AGG(DISTINCT b.name) as branch_names
            FROM delivery_staff ds
            JOIN users u ON ds.user_id = u.id
            LEFT JOIN delivery_staff_branches dsb ON ds.id = dsb.delivery_staff_id
            LEFT JOIN branches b ON dsb.branch_id = b.id
        `;
        
        if (branchId) {
            sql += ` WHERE dsb.branch_id = $1`;
        }
        
        sql += ` GROUP BY ds.id, u.email, u.role ORDER BY ds.name`;
        
        const { rows } = await query(sql, branchId ? [branchId] : []);
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error('Error fetching delivery staff:', err);
        res.status(500).json({ error: err.message });
    }
});

// إضافة موظف توصيل جديد
router.post('/delivery-staff', [verifyToken, isAdmin], async (req, res) => {
    const { name, email, password, phone, phone2, branchIds, maxOrders } = req.body;
    
    try {
        await query('BEGIN');
        
        // إنشاء المستخدم أولاً
        const userSql = `
            INSERT INTO users (name, email, password, role)
            VALUES ($1, $2, $3, 'delivery')
            RETURNING id
        `;
        const { rows: userRows } = await query(userSql, [name, email, password]);
        const userId = userRows[0].id;
        
        // إنشاء سجل موظف التوصيل
        const staffSql = `
            INSERT INTO delivery_staff (user_id, name, phone, phone2, max_orders)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const { rows: staffRows } = await query(staffSql, [userId, name, phone, phone2 || null, maxOrders || 5]);
        const staffId = staffRows[0].id;
        
        // ربط الموظف بالفروع
        if (branchIds && branchIds.length > 0) {
            for (const branchId of branchIds) {
                await query(
                    'INSERT INTO delivery_staff_branches (delivery_staff_id, branch_id) VALUES ($1, $2)',
                    [staffId, branchId]
                );
            }
        }
        
        await query('COMMIT');
        res.json({ message: 'success', data: staffRows[0] });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error creating delivery staff:', err);
        res.status(400).json({ error: err.message });
    }
});

// تحديث موظف توصيل
router.put('/delivery-staff/:id', [verifyToken, isAdmin], async (req, res) => {
    const { id } = req.params;
    const { name, phone, phone2, branchIds, maxOrders, isAvailable } = req.body;
    
    try {
        await query('BEGIN');
        
        // تحديث بيانات الموظف
        const updateSql = `
            UPDATE delivery_staff 
            SET name = COALESCE($1, name),
                phone = COALESCE($2, phone),
                phone2 = COALESCE($3, phone2),
                max_orders = COALESCE($4, max_orders),
                is_available = COALESCE($5, is_available)
            WHERE id = $6
            RETURNING *
        `;
        const { rows } = await query(updateSql, [name, phone, phone2, maxOrders, isAvailable, id]);
        
        if (rows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Delivery staff not found' });
        }
        
        // تحديث الفروع إذا تم تمريرها
        if (branchIds !== undefined) {
            await query('DELETE FROM delivery_staff_branches WHERE delivery_staff_id = $1', [id]);
            for (const branchId of branchIds) {
                await query(
                    'INSERT INTO delivery_staff_branches (delivery_staff_id, branch_id) VALUES ($1, $2)',
                    [id, branchId]
                );
            }
        }
        
        await query('COMMIT');
        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error updating delivery staff:', err);
        res.status(400).json({ error: err.message });
    }
});

// حذف موظف توصيل
router.delete('/delivery-staff/:id', [verifyToken, isAdmin], async (req, res) => {
    const { id } = req.params;
    
    try {
        // جلب user_id قبل الحذف
        const { rows: staffRows } = await query('SELECT user_id FROM delivery_staff WHERE id = $1', [id]);
        if (staffRows.length === 0) {
            return res.status(404).json({ error: 'Delivery staff not found' });
        }
        
        // حذف المستخدم (سيحذف موظف التوصيل بسبب CASCADE)
        await query('DELETE FROM users WHERE id = $1', [staffRows[0].user_id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        console.error('Error deleting delivery staff:', err);
        res.status(400).json({ error: err.message });
    }
});

// ============================================
// طلبات موزع الطلبات (Order Distributor)
// ============================================

// الحصول على الطلبات للتحضير (لموزع الطلبات)
router.get('/orders-to-prepare', verifyToken, async (req, res) => {
    const { branchId, status } = req.query;
    
    try {
        let sql = `
            SELECT o.*, u.name as customer_name, u.email as customer_email,
                   b.name as branch_name,
                   oa.id as assignment_id, oa.status as preparation_status,
                   ds.name as delivery_name, ds.phone as delivery_phone
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN branches b ON o.branch_id = b.id
            LEFT JOIN order_assignments oa ON o.id = oa.order_id
            LEFT JOIN delivery_staff ds ON oa.delivery_staff_id = ds.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;
        
        if (branchId) {
            sql += ` AND o.branch_id = $${paramIndex}`;
            params.push(branchId);
            paramIndex++;
        }
        
        if (status) {
            sql += ` AND o.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        } else {
            // بشكل افتراضي، أظهر جميع الطلبات
            sql += ` AND o.status IN ('pending', 'confirmed', 'preparing', 'ready')`;
        }
        
        sql += ` ORDER BY o.date DESC`;
        
        const { rows } = await query(sql, params);
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error('Error fetching orders to prepare:', err);
        res.status(500).json({ error: err.message });
    }
});

// بدء تحضير طلب
router.post('/start-preparation/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    const distributorId = req.user.id;
    
    try {
        await query('BEGIN');
        
        // تحديث حالة الطلب
        await query("UPDATE orders SET status = 'preparing' WHERE id = $1", [orderId]);
        
        // إنشاء سجل التعيين
        const assignSql = `
            INSERT INTO order_assignments (order_id, distributor_id, status)
            VALUES ($1, $2, 'preparing')
            ON CONFLICT (order_id) DO UPDATE SET status = 'preparing', distributor_id = EXCLUDED.distributor_id
            RETURNING *
        `;
        // Note: نحتاج unique constraint على order_id
        
        // جلب عناصر الطلب وإنشاء قائمة التحضير
        const { rows: orderRows } = await query('SELECT items FROM orders WHERE id = $1', [orderId]);
        if (orderRows.length > 0 && orderRows[0].items) {
            const items = typeof orderRows[0].items === 'string' ? JSON.parse(orderRows[0].items) : orderRows[0].items;
            
            // حذف العناصر القديمة إن وجدت
            await query('DELETE FROM order_preparation_items WHERE order_id = $1', [orderId]);
            
            // إضافة عناصر التحضير
            for (const item of items) {
                await query(`
                    INSERT INTO order_preparation_items (order_id, product_id, product_name, quantity)
                    VALUES ($1, $2, $3, $4)
                `, [orderId, item.productId || item.id, item.name || item.title, item.quantity]);
            }
        }
        
        // إنشاء أو تحديث سجل التعيين
        const { rows: existingAssignment } = await query('SELECT id FROM order_assignments WHERE order_id = $1', [orderId]);
        if (existingAssignment.length > 0) {
            await query(`
                UPDATE order_assignments 
                SET status = 'preparing', distributor_id = $1 
                WHERE order_id = $2
            `, [distributorId, orderId]);
        } else {
            await query(`
                INSERT INTO order_assignments (order_id, distributor_id, status)
                VALUES ($1, $2, 'preparing')
            `, [orderId, distributorId]);
        }
        
        await query('COMMIT');
        res.json({ message: 'success', status: 'preparing' });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error starting preparation:', err);
        res.status(400).json({ error: err.message });
    }
});

// الحصول على عناصر تحضير الطلب (Todo List)
router.get('/preparation-items/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    
    try {
        const { rows } = await query(`
            SELECT * FROM order_preparation_items 
            WHERE order_id = $1 
            ORDER BY id
        `, [orderId]);
        
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error('Error fetching preparation items:', err);
        res.status(500).json({ error: err.message });
    }
});

// تحديث حالة عنصر تحضير (checkbox)
router.put('/preparation-items/:itemId', verifyToken, async (req, res) => {
    const { itemId } = req.params;
    const { isPrepared, notes } = req.body;
    const preparedBy = req.user.id;
    
    try {
        const { rows } = await query(`
            UPDATE order_preparation_items 
            SET is_prepared = $1, 
                prepared_at = CASE WHEN $1 = TRUE THEN CURRENT_TIMESTAMP ELSE NULL END,
                prepared_by = CASE WHEN $1 = TRUE THEN $2 ELSE NULL END,
                notes = COALESCE($3, notes)
            WHERE id = $4
            RETURNING *
        `, [isPrepared, preparedBy, notes, itemId]);
        
        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error('Error updating preparation item:', err);
        res.status(400).json({ error: err.message });
    }
});

// إتمام تحضير الطلب
router.post('/complete-preparation/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    
    try {
        await query('BEGIN');
        
        // التحقق من أن جميع العناصر تم تحضيرها
        const { rows: items } = await query(`
            SELECT COUNT(*) as total, SUM(CASE WHEN is_prepared THEN 1 ELSE 0 END) as prepared
            FROM order_preparation_items WHERE order_id = $1
        `, [orderId]);
        
        if (items[0].total > 0 && items[0].total !== items[0].prepared) {
            await query('ROLLBACK');
            return res.status(400).json({ 
                error: 'لم يتم تحضير جميع العناصر بعد',
                remaining: items[0].total - items[0].prepared 
            });
        }
        
        // تحديث حالة الطلب إلى جاهز
        await query("UPDATE orders SET status = 'ready' WHERE id = $1", [orderId]);
        
        // تحديث سجل التعيين
        await query(`
            UPDATE order_assignments SET status = 'ready' WHERE order_id = $1
        `, [orderId]);
        
        await query('COMMIT');
        res.json({ message: 'success', status: 'ready' });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error completing preparation:', err);
        res.status(400).json({ error: err.message });
    }
});

// ============================================
// تعيين الديليفري للطلب
// ============================================

// الحصول على موظفي التوصيل المتاحين لفرع معين
router.get('/available-delivery/:branchId', verifyToken, async (req, res) => {
    const { branchId } = req.params;
    
    try {
        const { rows } = await query(`
            SELECT ds.* 
            FROM delivery_staff ds
            JOIN delivery_staff_branches dsb ON ds.id = dsb.delivery_staff_id
            WHERE dsb.branch_id = $1 
              AND ds.is_available = TRUE 
              AND ds.current_orders < ds.max_orders
            ORDER BY ds.current_orders ASC
        `, [branchId]);
        
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error('Error fetching available delivery staff:', err);
        res.status(500).json({ error: err.message });
    }
});

// تعيين ديليفري للطلب (مع مهلة 5 دقائق للقبول)
router.post('/assign-delivery/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    const { deliveryStaffId, expectedDeliveryTime } = req.body;
    
    try {
        await query('BEGIN');
        
        // حساب الموعد النهائي للقبول (5 دقائق)
        const acceptDeadline = new Date(Date.now() + 5 * 60 * 1000);
        const deliveryTime = expectedDeliveryTime || DEFAULT_EXPECTED_DELIVERY_TIME;
        
        // تحديث سجل التعيين
        await query(`
            UPDATE order_assignments 
            SET delivery_staff_id = $1, 
                status = 'assigned', 
                assigned_at = CURRENT_TIMESTAMP,
                accept_deadline = $3,
                expected_delivery_time = $4
            WHERE order_id = $2
        `, [deliveryStaffId, orderId, acceptDeadline, deliveryTime]);
        
        // تحديث حالة الطلب
        await query("UPDATE orders SET status = 'assigned_to_delivery' WHERE id = $1", [orderId]);
        
        // زيادة عدد الطلبات للديليفري
        await query(`
            UPDATE delivery_staff SET current_orders = current_orders + 1 WHERE id = $1
        `, [deliveryStaffId]);
        
        // جلب بيانات الطلب للإشعار
        const { rows: orderData } = await query(`
            SELECT o.*, u.name as customer_name, b.name as branch_name, b.address as branch_address
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN branches b ON o.branch_id = b.id
            WHERE o.id = $1
        `, [orderId]);
        
        await query('COMMIT');
        
        // إرسال إشعار للسائق
        notifyDriverNewOrder(deliveryStaffId, {
            orderId,
            order: orderData[0],
            acceptDeadline: acceptDeadline.toISOString(),
            expectedDeliveryTime: deliveryTime
        });
        
        // إشعار العميل بتعيين سائق
        notifyCustomerOrderUpdate(orderId, 'assigned_to_delivery', {
            expectedDeliveryTime: deliveryTime
        });
        
        res.json({ message: 'success', status: 'assigned', acceptDeadline });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error assigning delivery:', err);
        res.status(400).json({ error: err.message });
    }
});

// الديليفري يقبل الطلب (خلال 5 دقائق)
router.post('/accept-order/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    
    try {
        // التحقق من أن الطلب لم ينتهِ وقته
        const { rows: assignment } = await query(
            'SELECT * FROM order_assignments WHERE order_id = $1',
            [orderId]
        );
        
        if (assignment.length === 0) {
            return res.status(404).json({ error: 'الطلب غير موجود' });
        }
        
        const order = assignment[0];
        
        if (order.status !== 'assigned') {
            return res.status(400).json({ error: 'لا يمكن قبول هذا الطلب' });
        }
        
        // التحقق من انتهاء الوقت
        if (order.accept_deadline && new Date(order.accept_deadline) < new Date()) {
            return res.status(400).json({ error: 'انتهى وقت قبول الطلب' });
        }
        
        await query(`
            UPDATE order_assignments 
            SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
            WHERE order_id = $1
        `, [orderId]);
        
        await query("UPDATE orders SET status = 'out_for_delivery' WHERE id = $1", [orderId]);
        
        // إشعار العميل
        notifyCustomerOrderUpdate(orderId, 'accepted', {
            expectedDeliveryTime: order.expected_delivery_time
        });
        
        res.json({ message: 'success', status: 'accepted' });
    } catch (err) {
        console.error('Error accepting order:', err);
        res.status(400).json({ error: err.message });
    }
});

// الديليفري وصل الفرع واستلم الطلب
router.post('/pickup-order/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    
    try {
        // جلب وقت القبول لحساب الوقت للفرع
        const { rows: assignment } = await query(
            'SELECT accepted_at FROM order_assignments WHERE order_id = $1',
            [orderId]
        );
        
        let timeToBranch = null;
        if (assignment.length > 0 && assignment[0].accepted_at) {
            timeToBranch = Math.round((Date.now() - new Date(assignment[0].accepted_at).getTime()) / 60000);
        }
        
        await query(`
            UPDATE order_assignments 
            SET status = 'picked_up', 
                picked_up_at = CURRENT_TIMESTAMP,
                branch_arrived_at = CURRENT_TIMESTAMP,
                time_to_branch = $2
            WHERE order_id = $1
        `, [orderId, timeToBranch]);
        
        // إشعار العميل أن السائق استلم الطلب
        notifyCustomerOrderUpdate(orderId, 'picked_up', { timeToBranch });
        
        res.json({ message: 'success', status: 'picked_up', timeToBranch });
    } catch (err) {
        console.error('Error picking up order:', err);
        res.status(400).json({ error: err.message });
    }
});

// الديليفري وصل للعميل - في انتظار
router.post('/arriving-order/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    
    try {
        await query(`
            UPDATE order_assignments 
            SET status = 'arriving', customer_arrived_at = CURRENT_TIMESTAMP
            WHERE order_id = $1
        `, [orderId]);
        
        await query("UPDATE orders SET status = 'arriving' WHERE id = $1", [orderId]);
        
        // إشعار العميل أن السائق وصل
        notifyCustomerOrderUpdate(orderId, 'arriving');
        
        res.json({ message: 'success', status: 'arriving' });
    } catch (err) {
        console.error('Error updating arriving status:', err);
        res.status(400).json({ error: err.message });
    }
});

// الديليفري يسلم الطلب - تم التوصيل
router.post('/deliver-order/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    
    try {
        await query('BEGIN');
        
        // جلب بيانات الطلب والتعيين
        const { rows: orderRows } = await query(
            `SELECT o.*, oa.delivery_staff_id, oa.picked_up_at, oa.accepted_at, oa.expected_delivery_time 
             FROM orders o JOIN order_assignments oa ON o.id = oa.order_id WHERE o.id = $1`,
            [orderId]
        );
        
        if (orderRows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'الطلب غير موجود' });
        }
        
        const order = orderRows[0];
        const deliveryStaffId = order.delivery_staff_id;
        const expectedTime = order.expected_delivery_time || DEFAULT_EXPECTED_DELIVERY_TIME;
        
        // حساب وقت التوصيل
        let timeToCustomer = null;
        let totalDeliveryTime = null;
        
        if (order.picked_up_at) {
            timeToCustomer = Math.round((Date.now() - new Date(order.picked_up_at).getTime()) / 60000);
        }
        if (order.accepted_at) {
            totalDeliveryTime = Math.round((Date.now() - new Date(order.accepted_at).getTime()) / 60000);
        }
        
        // حساب التأخير
        const isLate = totalDeliveryTime && totalDeliveryTime > expectedTime;
        const lateMinutes = isLate ? totalDeliveryTime - expectedTime : 0;
        
        // تحديث سجل التعيين
        await query(`
            UPDATE order_assignments 
            SET status = 'delivered', 
                delivered_at = CURRENT_TIMESTAMP,
                time_to_customer = $2,
                total_delivery_time = $3,
                is_late = $4,
                late_minutes = $5
            WHERE order_id = $1
        `, [orderId, timeToCustomer, totalDeliveryTime, isLate, lateMinutes]);
        
        // تحديث حالة الطلب
        await query("UPDATE orders SET status = 'delivered' WHERE id = $1", [orderId]);
        
        // تحديث إحصائيات الديليفري مع حساب التأخير
        if (deliveryStaffId) {
            const lateUpdate = isLate ? ', late_deliveries = late_deliveries + 1' : ', on_time_deliveries = on_time_deliveries + 1';
            await query(`
                UPDATE delivery_staff 
                SET current_orders = GREATEST(0, current_orders - 1),
                    total_deliveries = total_deliveries + 1,
                    average_delivery_time = CASE 
                        WHEN total_deliveries = 0 THEN $2
                        ELSE (average_delivery_time * total_deliveries + $2) / (total_deliveries + 1)
                    END
                    ${lateUpdate}
                WHERE id = $1
            `, [deliveryStaffId, totalDeliveryTime || 30]);
        }
        
        // إضافة نقاط الولاء للعميل
        let pointsAwarded = 0;
        if (order.user_id) {
            const points = Math.floor(Number(order.total) || 0);
            if (points > 0) {
                await query(
                    "UPDATE users SET loyalty_points = COALESCE(loyalty_points, 0) + $1 WHERE id = $2",
                    [points, order.user_id]
                );
                pointsAwarded = points;
            }
        }
        
        await query('COMMIT');
        
        // إشعار العميل بتوصيل الطلب
        notifyCustomerOrderUpdate(orderId, 'delivered', {
            pointsAwarded,
            totalDeliveryTime,
            isLate,
            lateMinutes
        });
        
        res.json({ 
            message: 'success', 
            status: 'delivered', 
            pointsAwarded,
            timeToCustomer,
            totalDeliveryTime
        });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error delivering order:', err);
        res.status(400).json({ error: err.message });
    }
});

// الديليفري يرفض الطلب (العميل لم يستلم)
router.post('/reject-order/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    
    try {
        await query('BEGIN');
        
        const { rows: assignmentRows } = await query(
            'SELECT delivery_staff_id FROM order_assignments WHERE order_id = $1',
            [orderId]
        );
        
        // تحديث سجل التعيين
        await query(`
            UPDATE order_assignments 
            SET status = 'rejected', 
                rejection_reason = $2, 
                rejected_at = CURRENT_TIMESTAMP
            WHERE order_id = $1
        `, [orderId, reason]);
        
        // تحديث حالة الطلب - يرجع للموزع
        await query("UPDATE orders SET status = 'ready' WHERE id = $1", [orderId]);
        
        // تحديث إحصائيات الديليفري
        if (assignmentRows.length > 0 && assignmentRows[0].delivery_staff_id) {
            await query(`
                UPDATE delivery_staff 
                SET current_orders = GREATEST(0, current_orders - 1),
                    rejected_orders = rejected_orders + 1
                WHERE id = $1
            `, [assignmentRows[0].delivery_staff_id]);
        }
        
        await query('COMMIT');
        res.json({ message: 'success', status: 'rejected' });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error rejecting order:', err);
        res.status(400).json({ error: err.message });
    }
});

// انتهاء وقت قبول الطلب - يرجع للموزع (يُستدعى من cron job أو من الفرونت)
router.post('/expire-order/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    
    try {
        await query('BEGIN');
        
        const { rows: assignmentRows } = await query(
            'SELECT delivery_staff_id, status FROM order_assignments WHERE order_id = $1',
            [orderId]
        );
        
        if (assignmentRows.length === 0 || assignmentRows[0].status !== 'assigned') {
            await query('ROLLBACK');
            return res.status(400).json({ error: 'الطلب غير متاح للإلغاء' });
        }
        
        // إلغاء التعيين
        await query(`
            UPDATE order_assignments 
            SET status = 'expired', 
                delivery_staff_id = NULL
            WHERE order_id = $1
        `, [orderId]);
        
        // إرجاع الطلب للموزع
        await query("UPDATE orders SET status = 'ready' WHERE id = $1", [orderId]);
        
        // تحديث إحصائيات الديليفري
        if (assignmentRows[0].delivery_staff_id) {
            await query(`
                UPDATE delivery_staff 
                SET current_orders = GREATEST(0, current_orders - 1),
                    expired_orders = expired_orders + 1
                WHERE id = $1
            `, [assignmentRows[0].delivery_staff_id]);
        }
        
        await query('COMMIT');
        res.json({ message: 'success', status: 'expired' });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error expiring order:', err);
        res.status(400).json({ error: err.message });
    }
});

// ============================================
// صفحة الديليفري
// ============================================

// جلب طلبات الديليفري الحالي
router.get('/my-delivery-orders', verifyToken, async (req, res) => {
    try {
        const { rows: staffRows } = await query(
            'SELECT id FROM delivery_staff WHERE user_id = $1',
            [req.user.id]
        );
        
        if (staffRows.length === 0) {
            return res.json({ message: 'success', data: [] });
        }
        
        const staffId = staffRows[0].id;
        
        const { rows } = await query(`
            SELECT o.*, oa.status as assignment_status, oa.assigned_at, oa.accept_deadline,
                   oa.accepted_at, oa.picked_up_at, oa.customer_arrived_at, oa.delivered_at,
                   oa.time_to_branch, oa.time_to_customer, oa.total_delivery_time,
                   u.name as customer_name, u.email as customer_email,
                   b.name as branch_name, b.address as branch_address, b.maps_link as branch_maps_link
            FROM orders o
            JOIN order_assignments oa ON o.id = oa.order_id
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN branches b ON o.branch_id = b.id
            WHERE oa.delivery_staff_id = $1 
              AND oa.status IN ('assigned', 'accepted', 'picked_up', 'arriving')
            ORDER BY oa.assigned_at DESC
        `, [staffId]);
        
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error('Error fetching delivery orders:', err);
        res.status(500).json({ error: err.message });
    }
});

// تقييم الديليفري من العميل
router.post('/rate-delivery/:orderId', verifyToken, async (req, res) => {
    const { orderId } = req.params;
    const { orderRating, deliveryRating, speedRating, comment } = req.body;
    
    // التقييم الأساسي هو deliveryRating أو rating القديم للتوافق
    const mainRating = deliveryRating || req.body.rating;
    
    if (!mainRating || mainRating < 1 || mainRating > 5) {
        return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و 5' });
    }
    
    try {
        await query('BEGIN');
        
        // جلب معرف الديليفري والتأكد من أن الطلب للمستخدم الحالي
        const { rows: orderRows } = await query(`
            SELECT o.user_id, oa.delivery_staff_id 
            FROM orders o
            LEFT JOIN order_assignments oa ON o.id = oa.order_id
            WHERE o.id = $1
        `, [orderId]);
        
        if (orderRows.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'الطلب غير موجود' });
        }
        
        if (orderRows[0].user_id !== req.user.id) {
            await query('ROLLBACK');
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        // حساب متوسط التقييم
        const avgRating = Math.round((
            (orderRating || mainRating) + 
            (deliveryRating || mainRating) + 
            (speedRating || mainRating)
        ) / 3);
        
        // تحديث التقييم في التعيين
        await query(`
            UPDATE order_assignments 
            SET delivery_rating = $2, 
                rating_notes = $3, 
                rated_at = CURRENT_TIMESTAMP,
                order_rating = $4,
                speed_rating = $5
            WHERE order_id = $1
        `, [orderId, mainRating, comment || null, orderRating || mainRating, speedRating || mainRating]);
        
        // تحديث إحصائيات الديليفري
        const deliveryStaffId = orderRows[0].delivery_staff_id;
        if (deliveryStaffId) {
            await query(`
                UPDATE delivery_staff 
                SET total_rating_sum = total_rating_sum + $2,
                    total_ratings_count = total_ratings_count + 1,
                    average_rating = (total_rating_sum + $2) / (total_ratings_count + 1)
                WHERE id = $1
            `, [deliveryStaffId, avgRating]);
        }
        
        await query('COMMIT');
        res.json({ message: 'success', message: 'تم تسجيل التقييم بنجاح' });
    } catch (err) {
        await query('ROLLBACK');
        console.error('Error rating delivery:', err);
        res.status(400).json({ error: err.message });
    }
});

// جلب الطلبات المعلقة للتقييم (بعد 15 دقيقة من التوصيل)
router.get('/pending-ratings', verifyToken, async (req, res) => {
    try {
        // جلب الطلبات التي تم توصيلها من أكثر من 15 دقيقة ولم يتم تقييمها بعد
        const { rows } = await query(`
            SELECT o.id, o.total, o.date, o.status,
                   oa.delivered_at, oa.delivery_rating
            FROM orders o
            LEFT JOIN order_assignments oa ON o.id = oa.order_id
            WHERE o.user_id = $1
              AND o.status = 'delivered'
              AND (oa.delivery_rating IS NULL OR oa.delivery_rating = 0)
              AND oa.delivered_at IS NOT NULL
              AND oa.delivered_at < NOW() - INTERVAL '15 minutes'
            ORDER BY oa.delivered_at DESC
            LIMIT 3
        `, [req.user.id]);
        
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error('Error fetching pending ratings:', err);
        res.status(500).json({ error: err.message });
    }
});

// جلب إحصائيات الديليفري
router.get('/delivery-stats', verifyToken, async (req, res) => {
    try {
        const { rows: staffRows } = await query(
            'SELECT * FROM delivery_staff WHERE user_id = $1',
            [req.user.id]
        );
        
        if (staffRows.length === 0) {
            return res.status(404).json({ error: 'لم يتم العثور على بيانات الموظف' });
        }
        
        const staff = staffRows[0];
        
        // جلب آخر التقييمات
        const { rows: recentRatings } = await query(`
            SELECT oa.delivery_rating, oa.rating_notes, oa.rated_at, o.id as order_id
            FROM order_assignments oa
            JOIN orders o ON oa.order_id = o.id
            WHERE oa.delivery_staff_id = $1 AND oa.delivery_rating IS NOT NULL
            ORDER BY oa.rated_at DESC
            LIMIT 10
        `, [staff.id]);
        
        res.json({
            message: 'success',
            data: {
                id: staff.id,
                name: staff.name,
                phone: staff.phone,
                totalDeliveries: staff.total_deliveries,
                averageRating: parseFloat(staff.average_rating) || 0,
                totalRatings: staff.total_ratings_count,
                averageDeliveryTime: staff.average_delivery_time,
                onTimeDeliveries: staff.on_time_deliveries,
                lateDeliveries: staff.late_deliveries,
                rejectedOrders: staff.rejected_orders,
                expiredOrders: staff.expired_orders,
                currentOrders: staff.current_orders,
                maxOrders: staff.max_orders,
                isAvailable: staff.is_available,
                recentRatings
            }
        });
    } catch (err) {
        console.error('Error fetching delivery stats:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// تتبع الديليفري للموزع
// ============================================

// جلب جميع التوصيلات النشطة
router.get('/active-deliveries', verifyToken, async (req, res) => {
    const { branchId } = req.query;
    
    try {
        let queryStr = `
            SELECT oa.*, o.total, o.shipping_info, o.date as order_date, o.status as order_status,
                   ds.name as staff_name, ds.phone as staff_phone, ds.id as delivery_staff_id,
                   u.name as customer_name
            FROM order_assignments oa
            JOIN orders o ON oa.order_id = o.id
            LEFT JOIN delivery_staff ds ON oa.delivery_staff_id = ds.id
            LEFT JOIN users u ON o.user_id = u.id
            WHERE oa.status IN ('assigned', 'accepted', 'picked_up', 'arriving')
        `;
        
        const params = [];
        if (branchId) {
            params.push(branchId);
            queryStr += ` AND o.branch_id = $${params.length}`;
        }
        
        queryStr += ` ORDER BY oa.assigned_at DESC`;
        
        const { rows } = await query(queryStr, params);
        
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error('Error fetching active deliveries:', err);
        res.status(500).json({ error: err.message });
    }
});

// جلب جميع موظفي التوصيل مع إحصائياتهم
router.get('/all-delivery-staff', verifyToken, async (req, res) => {
    const { branchId } = req.query;
    
    try {
        let queryStr = `
            SELECT ds.*, 
                   (SELECT COUNT(*) FROM order_assignments oa WHERE oa.delivery_staff_id = ds.id AND oa.status IN ('assigned', 'accepted', 'picked_up', 'arriving')) as active_orders
            FROM delivery_staff ds
        `;
        
        const params = [];
        if (branchId) {
            queryStr = `
                SELECT ds.*, 
                       (SELECT COUNT(*) FROM order_assignments oa WHERE oa.delivery_staff_id = ds.id AND oa.status IN ('assigned', 'accepted', 'picked_up', 'arriving')) as active_orders
                FROM delivery_staff ds
                JOIN delivery_staff_branches dsb ON ds.id = dsb.delivery_staff_id
                WHERE dsb.branch_id = $1
            `;
            params.push(branchId);
        }
        
        queryStr += ` ORDER BY ds.is_available DESC, ds.name`;
        
        const { rows } = await query(queryStr, params);
        
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error('Error fetching delivery staff:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// الفروع مع بيانات التواصل
// ============================================

// تحديث بيانات الفرع (إضافة أرقام التواصل والموقع)
router.put('/branches/:id/contact', [verifyToken, isAdmin], async (req, res) => {
    const { id } = req.params;
    const { phone, phone2, mapsLink, address } = req.body;
    
    try {
        const { rows } = await query(`
            UPDATE branches 
            SET phone = COALESCE($1, phone),
                phone2 = COALESCE($2, phone2),
                maps_link = COALESCE($3, maps_link),
                address = COALESCE($4, address)
            WHERE id = $5
            RETURNING *
        `, [phone, phone2, mapsLink, address, id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Branch not found' });
        }
        
        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error('Error updating branch contact:', err);
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
