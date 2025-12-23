/**
 * Advanced Inventory Management API
 * نظام إدارة المخزون المتقدم
 */

import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ====================================
// 1. Inventory Batches Management
// ====================================

/**
 * POST /api/inventory/batches/receive
 * Receive new inventory batch
 */
router.post('/batches/receive', [verifyToken, isAdmin], async (req, res) => {
    try {
        const {
            product_id,
            location_id = 1,
            quantity,
            unit_cost,
            supplier_id,
            manufacturing_date,
            expiry_date,
            notes
        } = req.body;

        if (!product_id || !quantity || !unit_cost) {
            return res.status(400).json({
                success: false,
                message: 'Product ID, quantity, and unit cost are required'
            });
        }

        // Generate batch number
        const batch_number = `BATCH-${Date.now()}-${product_id}`;

        // Insert new batch
        const { rows: batch } = await query(`
            INSERT INTO inventory_batches (
                product_id, location_id, batch_number,
                quantity_received, quantity_remaining, unit_cost,
                supplier_id, manufacturing_date, expiry_date, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            product_id, location_id, batch_number,
            quantity, quantity, unit_cost,
            supplier_id, manufacturing_date, expiry_date, notes
        ]);

        // Record transaction
        await query(`
            INSERT INTO inventory_transactions (
                product_id, batch_id, location_id, transaction_type,
                quantity, unit_cost, reference_type, notes, performed_by
            ) VALUES ($1, $2, $3, 'IN', $4, $5, 'PURCHASE', $6, $7)
        `, [product_id, batch[0].id, location_id, quantity, unit_cost, notes, req.user.userId]);

        // Check alerts
        await query('SELECT check_inventory_alerts()');

        res.json({
            success: true,
            message: 'تم استلام الدفعة بنجاح',
            data: batch[0]
        });
    } catch (error) {
        console.error('Error receiving batch:', error);
        res.status(500).json({
            success: false,
            message: 'فشل استلام الدفعة',
            error: error.message
        });
    }
});

/**
 * POST /api/inventory/batches/deduct
 * Deduct inventory using FIFO
 */
router.post('/batches/deduct', [verifyToken], async (req, res) => {
    try {
        const {
            product_id,
            location_id = 1,
            quantity,
            reference_type,
            reference_id
        } = req.body;

        if (!product_id || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'Product ID and quantity are required'
            });
        }

        // Use FIFO function to deduct
        await query(`
            SELECT process_inventory_out($1, $2, $3, $4, $5)
        `, [product_id, location_id, quantity, reference_type || 'MANUAL', reference_id]);

        // Check alerts
        await query('SELECT check_inventory_alerts()');

        res.json({
            success: true,
            message: 'تم خصم الكمية بنجاح'
        });
    } catch (error) {
        console.error('Error deducting inventory:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'فشل خصم الكمية',
            error: error.message
        });
    }
});

/**
 * GET /api/inventory/summary
 * Get inventory summary
 */
router.get('/summary', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { location_id, product_id, status } = req.query;

        let whereClause = '1=1';
        const params = [];

        if (location_id) {
            params.push(location_id);
            whereClause += ` AND location_id = $${params.length}`;
        }

        if (product_id) {
            params.push(product_id);
            whereClause += ` AND product_id = $${params.length}`;
        }

        if (status) {
            params.push(status);
            whereClause += ` AND stock_status = $${params.length}`;
        }

        const { rows } = await query(`
            SELECT * FROM inventory_summary
            WHERE ${whereClause}
            ORDER BY stock_status DESC, total_quantity ASC
        `, params);

        res.json({
            success: true,
            data: rows,
            total: rows.length
        });
    } catch (error) {
        console.error('Error fetching inventory summary:', error);
        res.status(500).json({
            success: false,
            message: 'فشل جلب ملخص المخزون',
            error: error.message
        });
    }
});

/**
 * GET /api/inventory/batches
 * Get all batches
 */
router.get('/batches', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { product_id, location_id, active_only = true } = req.query;

        let whereClause = '1=1';
        const params = [];

        if (product_id) {
            params.push(product_id);
            whereClause += ` AND ib.product_id = $${params.length}`;
        }

        if (location_id) {
            params.push(location_id);
            whereClause += ` AND ib.location_id = $${params.length}`;
        }

        if (active_only === 'true') {
            whereClause += ' AND ib.quantity_remaining > 0';
        }

        const { rows } = await query(`
            SELECT 
                ib.*,
                p.name as product_name,
                p.barcode,
                il.name as location_name
            FROM inventory_batches ib
            JOIN products p ON ib.product_id = p.id
            JOIN inventory_locations il ON ib.location_id = il.id
            WHERE ${whereClause}
            ORDER BY ib.received_date ASC
        `, params);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({
            success: false,
            message: 'فشل جلب الدفعات',
            error: error.message
        });
    }
});

/**
 * GET /api/inventory/transactions
 * Get transaction history
 */
router.get('/transactions', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { product_id, location_id, transaction_type, limit = 100 } = req.query;

        let whereClause = '1=1';
        const params = [parseInt(limit)];

        if (product_id) {
            params.push(product_id);
            whereClause += ` AND it.product_id = $${params.length}`;
        }

        if (location_id) {
            params.push(location_id);
            whereClause += ` AND it.location_id = $${params.length}`;
        }

        if (transaction_type) {
            params.push(transaction_type);
            whereClause += ` AND it.transaction_type = $${params.length}`;
        }

        const { rows } = await query(`
            SELECT 
                it.*,
                p.name as product_name,
                p.barcode,
                il.name as location_name,
                ib.batch_number
            FROM inventory_transactions it
            JOIN products p ON it.product_id = p.id
            JOIN inventory_locations il ON it.location_id = il.id
            LEFT JOIN inventory_batches ib ON it.batch_id = ib.id
            WHERE ${whereClause}
            ORDER BY it.created_at DESC
            LIMIT $1
        `, params);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({
            success: false,
            message: 'فشل جلب سجل المعاملات',
            error: error.message
        });
    }
});

/**
 * GET /api/inventory/alerts
 * Get active alerts
 */
router.get('/alerts', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { resolved = false, severity } = req.query;

        let whereClause = 'is_resolved = $1';
        const params = [resolved === 'true'];

        if (severity) {
            params.push(severity);
            whereClause += ` AND severity = $${params.length}`;
        }

        const { rows } = await query(`
            SELECT 
                ia.*,
                p.name as product_name,
                p.barcode,
                il.name as location_name
            FROM inventory_alerts ia
            JOIN products p ON ia.product_id = p.id
            LEFT JOIN inventory_locations il ON ia.location_id = il.id
            WHERE ${whereClause}
            ORDER BY 
                CASE severity
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    ELSE 4
                END,
                ia.created_at DESC
        `, params);

        res.json({
            success: true,
            data: rows,
            total: rows.length
        });
    } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).json({
            success: false,
            message: 'فشل جلب التنبيهات',
            error: error.message
        });
    }
});

/**
 * PUT /api/inventory/alerts/:id/resolve
 * Resolve an alert
 */
router.put('/alerts/:id/resolve', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { id } = req.params;

        await query(`
            UPDATE inventory_alerts
            SET is_resolved = true,
                resolved_at = CURRENT_TIMESTAMP,
                resolved_by = $1
            WHERE id = $2
        `, [req.user.userId, id]);

        res.json({
            success: true,
            message: 'تم حل التنبيه بنجاح'
        });
    } catch (error) {
        console.error('Error resolving alert:', error);
        res.status(500).json({
            success: false,
            message: 'فشل حل التنبيه',
            error: error.message
        });
    }
});

/**
 * POST /api/inventory/adjust
 * Manual inventory adjustment
 */
router.post('/adjust', [verifyToken, isAdmin], async (req, res) => {
    try {
        const {
            product_id,
            location_id = 1,
            adjustment_quantity,
            reason,
            notes
        } = req.body;

        if (!product_id || !adjustment_quantity) {
            return res.status(400).json({
                success: false,
                message: 'Product ID and adjustment quantity are required'
            });
        }

        // Record adjustment transaction
        await query(`
            INSERT INTO inventory_transactions (
                product_id, location_id, transaction_type,
                quantity, reference_type, notes, performed_by
            ) VALUES ($1, $2, 'ADJUSTMENT', $3, 'MANUAL', $4, $5)
        `, [product_id, location_id, adjustment_quantity, `${reason}: ${notes}`, req.user.userId]);

        // Update product stock
        await query(`
            UPDATE products
            SET stock = stock + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [adjustment_quantity, product_id]);

        res.json({
            success: true,
            message: 'تم تعديل المخزون بنجاح'
        });
    } catch (error) {
        console.error('Error adjusting inventory:', error);
        res.status(500).json({
            success: false,
            message: 'فشل تعديل المخزون',
            error: error.message
        });
    }
});

/**
 * GET /api/inventory/low-stock
 * Get products that need reordering
 */
router.get('/low-stock', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT 
                p.id,
                p.name,
                p.barcode,
                p.stock,
                p.reorder_point,
                p.reorder_quantity,
                p.safety_stock,
                p.lead_time_days,
                COALESCE(SUM(ib.quantity_remaining), 0) as available_stock,
                CASE 
                    WHEN COALESCE(SUM(ib.quantity_remaining), 0) = 0 THEN 'OUT_OF_STOCK'
                    WHEN COALESCE(SUM(ib.quantity_remaining), 0) <= p.safety_stock THEN 'CRITICAL'
                    WHEN COALESCE(SUM(ib.quantity_remaining), 0) <= p.reorder_point THEN 'LOW_STOCK'
                END as status
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id = ib.product_id
            WHERE p.is_active = true
            GROUP BY p.id
            HAVING COALESCE(SUM(ib.quantity_remaining), 0) <= p.reorder_point
            ORDER BY 
                CASE 
                    WHEN COALESCE(SUM(ib.quantity_remaining), 0) = 0 THEN 1
                    WHEN COALESCE(SUM(ib.quantity_remaining), 0) <= p.safety_stock THEN 2
                    ELSE 3
                END,
                COALESCE(SUM(ib.quantity_remaining), 0) ASC
        `);

        res.json({
            success: true,
            data: rows,
            total: rows.length
        });
    } catch (error) {
        console.error('Error fetching low stock items:', error);
        res.status(500).json({
            success: false,
            message: 'فشل جلب المنتجات المنخفضة المخزون',
            error: error.message
        });
    }
});

/**
 * GET /api/inventory/analytics/by-branch
 * Get inventory analytics grouped by branch
 */
router.get('/analytics/by-branch', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT 
                b.id as branch_id,
                b.name as branch_name,
                b.city,
                COUNT(DISTINCT bp.product_id) as total_products,
                SUM(bp.stock_quantity) as total_stock,
                SUM(bp.reserved_quantity) as reserved_stock,
                SUM(bp.stock_quantity - COALESCE(bp.reserved_quantity, 0)) as available_stock,
                COUNT(CASE WHEN bp.stock_quantity = 0 THEN 1 END) as out_of_stock_count,
                COUNT(CASE WHEN bp.stock_quantity <= 5 THEN 1 END) as low_stock_count,
                SUM(CASE WHEN bp.discount_price IS NOT NULL THEN bp.discount_price * bp.stock_quantity 
                    ELSE bp.price * bp.stock_quantity END) as inventory_value
            FROM branches b
            LEFT JOIN branch_products bp ON b.id = bp.branch_id
            WHERE b.is_active = TRUE
            GROUP BY b.id, b.name, b.city
            ORDER BY total_stock DESC
        `);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching branch analytics:', error);
        res.status(500).json({
            success: false,
            message: 'فشل جلب تحليلات الفروع',
            error: error.message
        });
    }
});

/**
 * GET /api/inventory/analytics/by-category
 * Get inventory analytics grouped by category
 */
router.get('/analytics/by-category', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { branch_id } = req.query;
        const params = [];
        let branchFilter = '';

        if (branch_id) {
            params.push(branch_id);
            branchFilter = 'AND bp.branch_id = $1';
        }

        const { rows } = await query(`
            SELECT 
                p.category,
                COUNT(DISTINCT p.id) as total_products,
                SUM(bp.stock_quantity) as total_stock,
                SUM(bp.reserved_quantity) as reserved_stock,
                SUM(bp.stock_quantity - COALESCE(bp.reserved_quantity, 0)) as available_stock,
                COUNT(CASE WHEN bp.stock_quantity = 0 THEN 1 END) as out_of_stock_count,
                COUNT(CASE WHEN bp.stock_quantity <= 5 THEN 1 END) as low_stock_count,
                AVG(CASE WHEN bp.discount_price IS NOT NULL THEN bp.discount_price ELSE bp.price END) as avg_price,
                SUM(CASE WHEN bp.discount_price IS NOT NULL THEN bp.discount_price * bp.stock_quantity 
                    ELSE bp.price * bp.stock_quantity END) as inventory_value
            FROM products p
            JOIN branch_products bp ON p.id = bp.product_id
            WHERE p.is_active = TRUE ${branchFilter}
            GROUP BY p.category
            ORDER BY total_stock DESC
        `, params);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching category analytics:', error);
        res.status(500).json({
            success: false,
            message: 'فشل جلب تحليلات التصنيفات',
            error: error.message
        });
    }
});

/**
 * GET /api/inventory/analytics/high-demand
 * Get high demand products based on order history
 * Note: This system stores items as JSONB in orders.items, not in separate order_items table
 */
router.get('/analytics/high-demand', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { days = 30, limit = 50, branch_id } = req.query;
        const params = [parseInt(days), parseInt(limit)];
        let branchFilter = '';
        let branchJoin = '';

        if (branch_id) {
            params.push(branch_id);
            branchFilter = 'AND o.branch_id = $3';
            branchJoin = 'AND bp.branch_id = $3';
        }

        // Extract items from JSONB and analyze demand
        const { rows } = await query(`
            WITH order_items_expanded AS (
                SELECT 
                    o.id as order_id,
                    o.branch_id,
                    o.created_at,
                    o.status,
                    (item->>'productId')::text as product_id,
                    (item->>'name')::text as product_name,
                    COALESCE((item->>'quantity')::int, 1) as quantity,
                    COALESCE((item->>'price')::numeric, 0) as price
                FROM orders o,
                jsonb_array_elements(
                    CASE 
                        WHEN jsonb_typeof(o.items) = 'array' THEN o.items
                        ELSE '[]'::jsonb
                    END
                ) as item
                WHERE o.created_at >= NOW() - INTERVAL '1 day' * $1
                    AND o.status IN ('pending', 'confirmed', 'delivered')
                    ${branchFilter}
            )
            SELECT 
                oi.product_id as id,
                COALESCE(p.name, oi.product_name) as name,
                p.barcode,
                p.category,
                COUNT(DISTINCT oi.order_id) as order_count,
                SUM(oi.quantity) as total_sold,
                ROUND(AVG(oi.quantity::numeric), 1) as avg_quantity_per_order,
                SUM(oi.quantity * oi.price) as total_revenue,
                bp.stock_quantity as current_stock,
                COALESCE(bp.reserved_quantity, 0) as reserved_quantity,
                CASE 
                    WHEN COALESCE(bp.stock_quantity, 0) <= 5 THEN 'LOW_STOCK'
                    WHEN COALESCE(bp.stock_quantity, 0) <= 10 THEN 'MEDIUM_STOCK'
                    ELSE 'GOOD_STOCK'
                END as stock_status,
                CASE 
                    WHEN SUM(oi.quantity) > 0 THEN 
                        ROUND((COALESCE(bp.stock_quantity, 0)::numeric / SUM(oi.quantity)::numeric * $1::numeric), 1)
                    ELSE NULL
                END as days_of_stock_remaining
            FROM order_items_expanded oi
            LEFT JOIN products p ON oi.product_id = p.id::text
            LEFT JOIN branch_products bp ON p.id = bp.product_id 
                ${branch_id ? branchJoin : 'AND bp.branch_id = (SELECT MIN(branch_id) FROM branch_products WHERE product_id = p.id)'}
            GROUP BY oi.product_id, p.name, oi.product_name, p.barcode, p.category, bp.stock_quantity, bp.reserved_quantity
            ORDER BY total_sold DESC NULLS LAST
            LIMIT $2
        `, params);

        res.json({
            success: true,
            data: rows,
            period_days: days
        });
    } catch (error) {
        console.error('Error fetching high demand products:', error);
        res.status(500).json({
            success: false,
            message: 'فشل جلب المنتجات الأكثر طلباً',
            error: error.message
        });
    }
});

/**
 * GET /api/inventory/analytics/dashboard
 * Get comprehensive dashboard statistics
 */
router.get('/analytics/dashboard', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { branch_id } = req.query;
        const params = branch_id ? [branch_id] : [];
        const branchFilter = branch_id ? 'WHERE bp.branch_id = $1' : '';

        // Overall stats
        const { rows: [stats] } = await query(`
            SELECT 
                COUNT(DISTINCT bp.product_id) as total_products,
                COUNT(DISTINCT bp.branch_id) as total_branches,
                SUM(bp.stock_quantity) as total_stock,
                SUM(bp.reserved_quantity) as total_reserved,
                SUM(bp.stock_quantity - COALESCE(bp.reserved_quantity, 0)) as total_available,
                COUNT(CASE WHEN bp.stock_quantity = 0 THEN 1 END) as out_of_stock_count,
                COUNT(CASE WHEN bp.stock_quantity <= 5 AND bp.stock_quantity > 0 THEN 1 END) as low_stock_count,
                COUNT(CASE WHEN bp.stock_quantity > 5 THEN 1 END) as good_stock_count,
                SUM(CASE WHEN bp.discount_price IS NOT NULL THEN bp.discount_price * bp.stock_quantity 
                    ELSE bp.price * bp.stock_quantity END) as total_inventory_value
            FROM branch_products bp
            ${branchFilter}
        `, params);

        // Recent transactions
        const transactionParams = branch_id ? [10, branch_id] : [10];
        const transactionFilter = branch_id ? 'AND it.location_id = $2' : '';
        const { rows: recentTransactions } = await query(`
            SELECT 
                it.transaction_type,
                it.quantity,
                it.created_at,
                p.name as product_name,
                il.name as location_name
            FROM inventory_transactions it
            JOIN products p ON it.product_id = p.id
            LEFT JOIN inventory_locations il ON it.location_id = il.id
            WHERE 1=1 ${transactionFilter}
            ORDER BY it.created_at DESC
            LIMIT $1
        `, transactionParams);

        // Active alerts count
        const alertParams = branch_id ? [branch_id] : [];
        const alertFilter = branch_id ? 'AND ia.location_id = $1' : '';
        const { rows: [alertStats] } = await query(`
            SELECT 
                COUNT(*) as total_alerts,
                COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_alerts,
                COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_alerts,
                COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_alerts
            FROM inventory_alerts ia
            WHERE is_resolved = false ${alertFilter}
        `, alertParams);

        res.json({
            success: true,
            data: {
                statistics: stats,
                alerts: alertStats,
                recent_transactions: recentTransactions
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard analytics:', error);
        res.status(500).json({
            success: false,
            message: 'فشل جلب إحصائيات لوحة التحكم',
            error: error.message
        });
    }
});

export default router;
