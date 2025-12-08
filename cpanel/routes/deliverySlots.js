const express = require('express');
const { query } = require('../database');
const { verifyToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Get available delivery slots for a branch
router.get('/:branchId', async (req, res) => {
    const { branchId } = req.params;
    const { date, available } = req.query;

    try {
        let sql = `
            SELECT * FROM delivery_slots
            WHERE branch_id = $1 AND is_active = TRUE
        `;
        const params = [branchId];
        let paramIndex = 2;

        if (date) {
            sql += ` AND date = $${paramIndex}`;
            params.push(date);
            paramIndex++;
        } else {
            // Default: show slots for next 7 days
            sql += ` AND date >= CURRENT_DATE AND date <= CURRENT_DATE + INTERVAL '7 days'`;
        }

        if (available === 'true') {
            sql += ` AND current_orders < max_orders`;
        }

        sql += ' ORDER BY date, start_time';

        const { rows } = await query(sql, params);
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error("Error fetching delivery slots:", err);
        res.status(500).json({ error: err.message });
    }
});

// Create delivery slot (Admin only)
router.post('/', [verifyToken, isAdmin], async (req, res) => {
    const { branchId, date, startTime, endTime, maxOrders, deliveryFee } = req.body;

    if (!branchId || !date || !startTime || !endTime) {
        return res.status(400).json({ error: "Branch ID, date, start time, and end time are required" });
    }

    try {
        const sql = `
            INSERT INTO delivery_slots (branch_id, date, start_time, end_time, max_orders, delivery_fee)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;

        const { rows } = await query(sql, [
            branchId,
            date,
            startTime,
            endTime,
            maxOrders || 20,
            deliveryFee || 15.00
        ]);

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error("Error creating delivery slot:", err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Slot already exists for this time' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Update delivery slot
router.put('/:slotId', [verifyToken, isAdmin], async (req, res) => {
    const { slotId } = req.params;
    const { maxOrders, deliveryFee, isActive } = req.body;

    try {
        const sql = `
            UPDATE delivery_slots
            SET max_orders = COALESCE($1, max_orders),
                delivery_fee = COALESCE($2, delivery_fee),
                is_active = COALESCE($3, is_active)
            WHERE id = $4
            RETURNING *
        `;

        const { rows } = await query(sql, [maxOrders, deliveryFee, isActive, slotId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Slot not found' });
        }

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error("Error updating delivery slot:", err);
        res.status(500).json({ error: err.message });
    }
});

// Delete delivery slot
router.delete('/:slotId', [verifyToken, isAdmin], async (req, res) => {
    const { slotId } = req.params;

    try {
        const result = await query("DELETE FROM delivery_slots WHERE id = $1", [slotId]);
        res.json({ message: 'deleted', rowCount: result.rowCount });
    } catch (err) {
        console.error("Error deleting delivery slot:", err);
        res.status(500).json({ error: err.message });
    }
});

// Reserve a slot (increment current_orders)
router.post('/:slotId/reserve', async (req, res) => {
    const { slotId } = req.params;

    try {
        await query('BEGIN');

        // Lock the row for update
        const { rows: slots } = await query(
            "SELECT * FROM delivery_slots WHERE id = $1 FOR UPDATE",
            [slotId]
        );

        if (slots.length === 0) {
            await query('ROLLBACK');
            return res.status(404).json({ error: 'Slot not found' });
        }

        const slot = slots[0];

        if (slot.current_orders >= slot.max_orders) {
            await query('ROLLBACK');
            return res.status(400).json({ error: 'Slot is full' });
        }

        if (!slot.is_active) {
            await query('ROLLBACK');
            return res.status(400).json({ error: 'Slot is not active' });
        }

        // Increment current_orders
        const { rows } = await query(
            "UPDATE delivery_slots SET current_orders = current_orders + 1 WHERE id = $1 RETURNING *",
            [slotId]
        );

        await query('COMMIT');
        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        await query('ROLLBACK');
        console.error("Error reserving slot:", err);
        res.status(500).json({ error: err.message });
    }
});

// Release a slot (decrement current_orders - used when order is cancelled)
router.post('/:slotId/release', async (req, res) => {
    const { slotId } = req.params;

    try {
        const { rows } = await query(
            "UPDATE delivery_slots SET current_orders = GREATEST(current_orders - 1, 0) WHERE id = $1 RETURNING *",
            [slotId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Slot not found' });
        }

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error("Error releasing slot:", err);
        res.status(500).json({ error: err.message });
    }
});

// Bulk create slots (e.g., for a week)
router.post('/bulk-create', [verifyToken, isAdmin], async (req, res) => {
    const { branchId, startDate, endDate, slots } = req.body;
    // slots: [{ startTime, endTime, maxOrders, deliveryFee }]

    if (!branchId || !startDate || !endDate || !slots || !Array.isArray(slots)) {
        return res.status(400).json({ error: "Invalid parameters" });
    }

    try {
        await query('BEGIN');

        const results = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];

            for (const slot of slots) {
                const { rows } = await query(
                    `INSERT INTO delivery_slots (branch_id, date, start_time, end_time, max_orders, delivery_fee)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (branch_id, date, start_time) DO NOTHING
                     RETURNING *`,
                    [branchId, dateStr, slot.startTime, slot.endTime, slot.maxOrders || 20, slot.deliveryFee || 15.00]
                );

                if (rows.length > 0) {
                    results.push(rows[0]);
                }
            }
        }

        await query('COMMIT');
        res.json({ message: 'success', created: results.length });
    } catch (err) {
        await query('ROLLBACK');
        console.error("Error bulk creating slots:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
