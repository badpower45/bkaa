import { Router } from 'express';
import cloudinary from 'cloudinary';
import { query } from '../database.js';

const router = Router();
const cloudinaryV2 = cloudinary.v2;

const getToken = (req) => {
    const headerToken = req.headers['x-migration-token'];
    const auth = req.headers.authorization || '';
    if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();
    if (auth.startsWith('Bearer ')) return auth.replace('Bearer ', '').trim();
    return '';
};

const requireEnv = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing ${name}`);
    }
    return value;
};

const isBase64Image = (value = '') => value.startsWith('data:image/');

const getLimit = (value, fallback = 10, max = 50) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
};

router.use((req, res, next) => {
    const expected = process.env.MIGRATION_TOKEN || '';
    const provided = getToken(req);
    if (!expected || provided !== expected) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
});

router.get('/products-base64/status', async (req, res) => {
    try {
        const { onlyId } = req.query;
        const countSql = onlyId
            ? `SELECT COUNT(*) AS total FROM products WHERE id = $1 AND image LIKE 'data:image%'`
            : `SELECT COUNT(*) AS total FROM products WHERE image LIKE 'data:image%'`;
        const countParams = onlyId ? [onlyId] : [];
        const { rows: countRows } = await query(countSql, countParams);
        res.json({ total: parseInt(countRows[0]?.total || '0', 10) });
    } catch (err) {
        console.error('Status error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/products-base64/run', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { onlyId, dryRun } = req.query;
    const limit = getLimit(req.query.limit, 10, 50);

    try {
        cloudinaryV2.config({
            cloud_name: requireEnv('CLOUDINARY_CLOUD_NAME'),
            api_key: requireEnv('CLOUDINARY_API_KEY'),
            api_secret: requireEnv('CLOUDINARY_API_SECRET')
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
        const selectSql = onlyId
            ? `SELECT id, image FROM products WHERE id = $1 AND image LIKE 'data:image%' LIMIT $2`
            : `SELECT id, image FROM products WHERE image LIKE 'data:image%' ORDER BY id LIMIT $1`;
        const selectParams = onlyId ? [onlyId, limit] : [limit];
        const { rows } = await query(selectSql, selectParams);

        for (const row of rows) {
            processed++;
            const image = row.image || '';
            if (!isBase64Image(image)) {
                skipped++;
                continue;
            }

            if (dryRun === 'true') {
                updated++;
                continue;
            }

            try {
                const publicId = `products/product_${row.id}`;
                const uploadResult = await cloudinaryV2.uploader.upload(image, {
                    folder: 'products',
                    public_id: publicId,
                    overwrite: true,
                    resource_type: 'image'
                });
                const url = uploadResult?.secure_url || uploadResult?.url;
                if (!url) {
                    throw new Error('Cloudinary returned no URL');
                }
                await query('UPDATE products SET image = $1 WHERE id = $2', [url, row.id]);
                updated++;
            } catch (err) {
                failed++;
                console.error(`Migration failed for ${row.id}:`, err.message || err);
            }
        }

        const countSql = onlyId
            ? `SELECT COUNT(*) AS total FROM products WHERE id = $1 AND image LIKE 'data:image%'`
            : `SELECT COUNT(*) AS total FROM products WHERE image LIKE 'data:image%'`;
        const countParams = onlyId ? [onlyId] : [];
        const { rows: countRows } = await query(countSql, countParams);

        res.json({
            processed,
            updated,
            skipped,
            failed,
            remaining: parseInt(countRows[0]?.total || '0', 10)
        });
    } catch (err) {
        console.error('Migration error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
