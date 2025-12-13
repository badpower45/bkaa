import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all addresses for a user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.query.userId || req.user.id;
        const result = await db.query(
            'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
            [userId]
        );
        res.json({ data: result.rows });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.status(500).json({ error: 'Failed to fetch addresses' });
    }
});

// Create new address
router.post('/', authenticateToken, async (req, res) => {
    try {
        const {
            user_id,
            type,
            address_line1,
            address_line2,
            city,
            governorate,
            postal_code,
            phone,
            is_default
        } = req.body;

        const userId = user_id || req.user.id;

        // If this is set as default, unset all other defaults for this user
        if (is_default) {
            await db.query(
                'UPDATE addresses SET is_default = false WHERE user_id = $1',
                [userId]
            );
        }

        const result = await db.query(
            `INSERT INTO addresses 
            (user_id, type, address_line1, address_line2, city, governorate, postal_code, phone, is_default)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [userId, type, address_line1, address_line2, city, governorate, postal_code, phone, is_default || false]
        );

        res.status(201).json({ data: result.rows[0] });
    } catch (error) {
        console.error('Error creating address:', error);
        res.status(500).json({ error: 'Failed to create address' });
    }
});

// Update address
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            type,
            address_line1,
            address_line2,
            city,
            governorate,
            postal_code,
            phone,
            is_default
        } = req.body;

        // Verify address belongs to user
        const checkResult = await db.query(
            'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Address not found' });
        }

        // If setting as default, unset all other defaults
        if (is_default) {
            await db.query(
                'UPDATE addresses SET is_default = false WHERE user_id = $1',
                [req.user.id]
            );
        }

        const result = await db.query(
            `UPDATE addresses 
            SET type = $1, address_line1 = $2, address_line2 = $3, city = $4, 
                governorate = $5, postal_code = $6, phone = $7, is_default = $8
            WHERE id = $9
            RETURNING *`,
            [type, address_line1, address_line2, city, governorate, postal_code, phone, is_default || false, id]
        );

        res.json({ data: result.rows[0] });
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({ error: 'Failed to update address' });
    }
});

// Delete address
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify address belongs to user
        const checkResult = await db.query(
            'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Address not found' });
        }

        await db.query('DELETE FROM addresses WHERE id = $1', [id]);
        res.json({ message: 'Address deleted successfully' });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ error: 'Failed to delete address' });
    }
});

// Set default address
router.put('/:id/set-default', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify address belongs to user
        const checkResult = await db.query(
            'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Address not found' });
        }

        // Unset all defaults for this user
        await db.query(
            'UPDATE addresses SET is_default = false WHERE user_id = $1',
            [req.user.id]
        );

        // Set this one as default
        await db.query(
            'UPDATE addresses SET is_default = true WHERE id = $1',
            [id]
        );

        res.json({ message: 'Default address updated successfully' });
    } catch (error) {
        console.error('Error setting default address:', error);
        res.status(500).json({ error: 'Failed to set default address' });
    }
});

export default router;
