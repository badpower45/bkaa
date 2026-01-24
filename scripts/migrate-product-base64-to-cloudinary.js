import cloudinary from 'cloudinary';
import { query, closePool } from '../database.js';

const cloudinaryV2 = cloudinary.v2;

const requireEnv = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing ${name} in environment`);
    }
    return value;
};

const formatBytes = (bytes) => {
    if (!bytes || Number.isNaN(bytes)) return 'unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let idx = 0;
    while (size >= 1024 && idx < sizes.length - 1) {
        size /= 1024;
        idx++;
    }
    return `${size.toFixed(2)} ${sizes[idx]}`;
};

const isBase64Image = (value = '') => value.startsWith('data:image/');

const migrateProducts = async () => {
    const dryRun = process.env.DRY_RUN === 'true';
    const batchSize = Number(process.env.BATCH_SIZE) || 10;
    const onlyId = process.env.ONLY_ID || null;

    cloudinaryV2.config({
        cloud_name: requireEnv('CLOUDINARY_CLOUD_NAME'),
        api_key: requireEnv('CLOUDINARY_API_KEY'),
        api_secret: requireEnv('CLOUDINARY_API_SECRET')
    });

    const countSql = onlyId
        ? `SELECT COUNT(*) AS total FROM products WHERE id = $1 AND image LIKE 'data:image%'`
        : `SELECT COUNT(*) AS total FROM products WHERE image LIKE 'data:image%'`;
    const countParams = onlyId ? [onlyId] : [];
    const { rows: countRows } = await query(countSql, countParams);
    const total = parseInt(countRows[0]?.total || '0', 10);

    console.log(`🧾 Base64 products to migrate: ${total} (dry run: ${dryRun})`);
    if (total === 0) {
        await closePool();
        return;
    }

    let processed = 0;
    let success = 0;
    let failed = 0;

    while (true) {
        const selectSql = onlyId
            ? `SELECT id, image FROM products WHERE id = $1 AND image LIKE 'data:image%' LIMIT $2`
            : `SELECT id, image FROM products WHERE image LIKE 'data:image%' ORDER BY id LIMIT $1`;
        const selectParams = onlyId ? [onlyId, batchSize] : [batchSize];
        const { rows } = await query(selectSql, selectParams);

        if (!rows || rows.length === 0) break;

        for (const row of rows) {
            processed++;
            const image = row.image || '';
            if (!isBase64Image(image)) {
                console.log(`⏭️  Skip ${row.id} - not base64`);
                continue;
            }

            const sizeEstimate = image.length ? formatBytes(Buffer.byteLength(image, 'utf8')) : 'unknown';
            const publicId = `products/product_${row.id}`;

            try {
                if (dryRun) {
                    console.log(`🧪 Dry run: would upload ${row.id} (${sizeEstimate}) → ${publicId}`);
                    success++;
                    continue;
                }

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
                console.log(`✅ ${row.id} → ${url} (${sizeEstimate})`);
                success++;
            } catch (err) {
                failed++;
                console.error(`❌ Failed ${row.id}:`, err?.message || err);
            }
        }
    }

    console.log(`✅ Done. processed=${processed} success=${success} failed=${failed}`);
    await closePool();
};

migrateProducts().catch((err) => {
    console.error('❌ Migration failed:', err);
    closePool().finally(() => process.exit(1));
});
