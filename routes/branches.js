import express from 'express';
import { query } from '../database.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all branches
router.get('/', async (req, res) => {
    const { active } = req.query;

    try {
        let sql = 'SELECT * FROM branches';
        const params = [];

        if (active === 'true') {
            sql += ' WHERE is_active = TRUE';
        }

        sql += ' ORDER BY name';

        const { rows } = await query(sql, params);
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error("Error fetching branches:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get single branch
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await query("SELECT * FROM branches WHERE id = $1", [req.params.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error("Error fetching branch:", err);
        res.status(500).json({ error: err.message });
    }
});

// Get nearby branches (based on coordinates)
router.get('/nearby', async (req, res) => {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
        return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    const radiusKm = parseFloat(radius) || 10; // Default 10km

    try {
        // Using Haversine formula for distance calculation
        const sql = `
            SELECT *,
            (
                6371 * acos(
                    cos(radians($1)) * cos(radians(location_lat)) *
                    cos(radians(location_lng) - radians($2)) +
                    sin(radians($1)) * sin(radians(location_lat))
                )
            ) AS distance_km
            FROM branches
            WHERE is_active = TRUE
            HAVING distance_km <= $3
            ORDER BY distance_km
        `;

        const { rows } = await query(sql, [parseFloat(lat), parseFloat(lng), radiusKm]);
        res.json({ message: 'success', data: rows });
    } catch (err) {
        console.error("Error finding nearby branches:", err);
        res.status(500).json({ error: err.message });
    }
});

// Create branch (Admin only)
router.post('/', [verifyToken, isAdmin], async (req, res) => {
    const { name, locationLat, locationLng, coverageRadiusKm } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Branch name required' });
    }

    try {
        const sql = `
            INSERT INTO branches (name, location_lat, location_lng, coverage_radius_km)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;

        const { rows } = await query(sql, [
            name,
            locationLat || null,
            locationLng || null,
            coverageRadiusKm || 5.0
        ]);

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error("Error creating branch:", err);
        res.status(500).json({ error: err.message });
    }
});

// Update branch
router.put('/:id', [verifyToken, isAdmin], async (req, res) => {
    const { name, locationLat, locationLng, coverageRadiusKm, isActive } = req.body;

    try {
        const sql = `
            UPDATE branches
            SET name = COALESCE($1, name),
                location_lat = COALESCE($2, location_lat),
                location_lng = COALESCE($3, location_lng),
                coverage_radius_km = COALESCE($4, coverage_radius_km),
                is_active = COALESCE($5, is_active)
            WHERE id = $6
            RETURNING *
        `;

        const { rows } = await query(sql, [
            name,
            locationLat,
            locationLng,
            coverageRadiusKm,
            isActive,
            req.params.id
        ]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error("Error updating branch:", err);
        res.status(500).json({ error: err.message });
    }
});

// Delete branch (soft delete - set is_active to false)
router.delete('/:id', [verifyToken, isAdmin], async (req, res) => {
    try {
        const { rows } = await query(
            "UPDATE branches SET is_active = FALSE WHERE id = $1 RETURNING *",
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        res.json({ message: 'success', data: rows[0] });
    } catch (err) {
        console.error("Error deleting branch:", err);
        res.status(500).json({ error: err.message });
    }
});

// Check if address is within branch coverage
router.post('/:id/check-coverage', async (req, res) => {
    const { lat, lng } = req.body;
    const { id } = req.params;

    if (!lat || !lng) {
        return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    try {
        const { rows } = await query(
            "SELECT *, (6371 * acos(cos(radians($1)) * cos(radians(location_lat)) * cos(radians(location_lng) - radians($2)) + sin(radians($1)) * sin(radians(location_lat)))) AS distance_km FROM branches WHERE id = $3",
            [parseFloat(lat), parseFloat(lng), id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        const branch = rows[0];
        const withinCoverage = branch.distance_km <= branch.coverage_radius_km;

        res.json({
            message: 'success',
            withinCoverage,
            distance: branch.distance_km,
            branch: {
                id: branch.id,
                name: branch.name,
                coverageRadius: branch.coverage_radius_km
            }
        });
    } catch (err) {
        console.error("Error checking coverage:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
