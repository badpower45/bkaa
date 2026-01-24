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
const isSafeIdentifier = (value = '') => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);

const getLimit = (value, fallback = 10, max = 50) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
};

const tableExists = async (tableName) => {
    if (!isSafeIdentifier(tableName)) return false;
    const { rows } = await query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [tableName]
    );
    return rows.length > 0;
};

const columnExists = async (tableName, columnName) => {
    if (!isSafeIdentifier(tableName) || !isSafeIdentifier(columnName)) return false;
    const { rows } = await query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
        [tableName, columnName]
    );
    return rows.length > 0;
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

router.get('/storage-report', async (req, res) => {
    try {
        const topLimit = getLimit(req.query.limit, 10, 25);
        const { rows: tableRows } = await query(
            `
            SELECT
                relname AS table_name,
                pg_total_relation_size(relid) AS size_bytes,
                pg_size_pretty(pg_total_relation_size(relid)) AS size_pretty,
                reltuples::bigint AS est_rows
            FROM pg_catalog.pg_statio_user_tables
            ORDER BY size_bytes DESC
            LIMIT $1
            `,
            [topLimit]
        );

        const base64Targets = [
            { table: 'products', columns: ['image'] },
            { table: 'brands', columns: ['logo_url', 'banner_url', 'image', 'logo', 'banner'] },
            { table: 'brand_offers', columns: ['image_url', 'brand_logo_url', 'image'] },
            { table: 'hot_deals', columns: ['image'] },
            { table: 'magazine_offers', columns: ['image'] },
            { table: 'magazine_pages', columns: ['image_url'] },
            { table: 'category_banners', columns: ['image_url', 'mobile_image_url'] },
            { table: 'categories', columns: ['image', 'icon', 'banner_image'] },
            { table: 'stories', columns: ['media_url'] },
            { table: 'hero_sections', columns: ['image_url', 'mobile_image_url'] },
            { table: 'home_sections', columns: ['banner_image'] },
            { table: 'popups', columns: ['image_url'] },
            { table: 'cta_banners', columns: ['image_url'] },
            { table: 'facebook_reels', columns: ['thumbnail_url', 'video_url'] },
            { table: 'notifications', columns: ['image_url'] }
        ];

        const base64Findings = [];
        for (const target of base64Targets) {
            if (!(await tableExists(target.table))) continue;
            for (const column of target.columns) {
                if (!(await columnExists(target.table, column))) continue;
                if (!isSafeIdentifier(target.table) || !isSafeIdentifier(column)) continue;
                const { rows } = await query(
                    `SELECT COUNT(*) AS total, MAX(LENGTH("${column}")) AS max_length
                     FROM "${target.table}"
                     WHERE "${column}" LIKE 'data:%'`
                );
                const total = parseInt(rows[0]?.total || '0', 10);
                const maxLength = parseInt(rows[0]?.max_length || '0', 10);
                if (total > 0) {
                    base64Findings.push({
                        table: target.table,
                        column,
                        total,
                        max_length: maxLength
                    });
                }
            }
        }

        res.json({
            checked_at: new Date().toISOString(),
            tables: tableRows,
            base64: base64Findings
        });
    } catch (err) {
        console.error('Storage report error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
