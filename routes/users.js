import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get All Users (Admin only)
router.get('/', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { rows } = await query("SELECT id, name, email, role, loyalty_points FROM users");
        res.json({
            "message": "success",
            "data": rows.map(u => ({ ...u, loyaltyPoints: u.loyalty_points }))
        });
    } catch (err) {
        res.status(400).json({ "error": err.message });
    }
});

// Create User (Admin only - for adding employees)
router.post('/', [verifyToken, isAdmin], async (req, res) => {
    const { name, email, password, role, phone, phone2, branchId, assigned_branch_id } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 8);

    try {
        // أولاً: إنشاء المستخدم
        const { rows } = await query(
            `INSERT INTO users (name, email, password, role, assigned_branch_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [name, email, hashedPassword, role || 'employee', branchId || assigned_branch_id || null]
        );
        
        const userId = rows[0].id;
        
        // إذا كان ديليفري، أنشئ سجل في delivery_staff
        if (role === 'delivery' && branchId) {
            // إنشاء سجل في جدول delivery_staff
            const { rows: staffRows } = await query(
                `INSERT INTO delivery_staff (user_id, name, phone, phone2, is_available, max_orders) 
                 VALUES ($1, $2, $3, $4, true, 5) RETURNING id`,
                [userId, name, phone || '', phone2 || '']
            );
            
            // ربط الديليفري بالفرع
            if (staffRows.length > 0) {
                await query(
                    `INSERT INTO delivery_staff_branches (delivery_staff_id, branch_id) VALUES ($1, $2)`,
                    [staffRows[0].id, branchId]
                );
            }
        }
        
        res.status(200).send({ message: "User created successfully", userId });
    } catch (err) {
        console.error('Error creating user:', err);
        if (err.code === '23505') {
            return res.status(500).send({ error: "Email already exists." });
        }
        res.status(500).send({ error: "There was a problem registering the user." });
    }
});

// Get Current User Profile (must be before /:id route)
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const { rows } = await query(
            "SELECT id, name, email, role, loyalty_points, created_at FROM users WHERE id = $1",
            [req.user.userId]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = rows[0];
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            loyalty_points: user.loyalty_points || 0,
            created_at: user.created_at
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get Single User (Admin or self)
router.get('/:id', verifyToken, async (req, res) => {
    try {
        // Allow users to view their own profile or admin to view any
        if (req.user.role !== 'admin' && req.user.userId !== parseInt(req.params.id)) {
            return res.status(403).json({ error: "Access denied" });
        }

        const { rows } = await query(
            "SELECT id, name, email, role, loyalty_points, created_at FROM users WHERE id = $1",
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = rows[0];
        res.json({
            message: "success",
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                loyaltyPoints: user.loyalty_points,
                createdAt: user.created_at
            }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update User (Admin or self)
router.put('/:id', verifyToken, async (req, res) => {
    try {
        // Allow users to update their own profile or admin to update any
        if (req.user.role !== 'admin' && req.user.userId !== parseInt(req.params.id)) {
            return res.status(403).json({ error: "Access denied" });
        }

        const { name, email, role } = req.body;
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (email) {
            updates.push(`email = $${paramCount++}`);
            values.push(email);
        }
        // Only admin can change role
        if (role && req.user.role === 'admin') {
            updates.push(`role = $${paramCount++}`);
            values.push(role);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: "No fields to update" });
        }

        values.push(req.params.id);
        const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, name, email, role, loyalty_points`;
        
        const { rows } = await query(sql, values);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({
            message: "User updated successfully",
            data: {
                id: rows[0].id,
                name: rows[0].name,
                email: rows[0].email,
                role: rows[0].role,
                loyaltyPoints: rows[0].loyalty_points
            }
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: "Email already exists" });
        }
        res.status(400).json({ error: err.message });
    }
});

// Update Loyalty Points (Admin only)
router.put('/:id/loyalty-points', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { points, operation } = req.body; // operation: 'add', 'subtract', 'set'
        
        if (!points && operation !== 'reset') {
            return res.status(400).json({ error: "Points value required" });
        }

        let sql;
        let values;

        switch (operation) {
            case 'add':
                sql = "UPDATE users SET loyalty_points = loyalty_points + $1 WHERE id = $2 RETURNING id, loyalty_points";
                values = [points, req.params.id];
                break;
            case 'subtract':
                sql = "UPDATE users SET loyalty_points = GREATEST(loyalty_points - $1, 0) WHERE id = $2 RETURNING id, loyalty_points";
                values = [points, req.params.id];
                break;
            case 'set':
                sql = "UPDATE users SET loyalty_points = $1 WHERE id = $2 RETURNING id, loyalty_points";
                values = [points, req.params.id];
                break;
            case 'reset':
                sql = "UPDATE users SET loyalty_points = 0 WHERE id = $1 RETURNING id, loyalty_points";
                values = [req.params.id];
                break;
            default:
                return res.status(400).json({ error: "Invalid operation. Use: add, subtract, set, or reset" });
        }

        const { rows } = await query(sql, values);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({
            message: "Loyalty points updated successfully",
            data: {
                userId: rows[0].id,
                loyaltyPoints: rows[0].loyalty_points
            }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete User
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const result = await query("DELETE FROM users WHERE id = $1", [req.params.id]);
        res.json({ "message": "deleted", rowCount: result.rowCount });
    } catch (err) {
        res.status(400).json({ "error": err.message });
    }
});

export default router;
