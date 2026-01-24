import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import cloudinary from 'cloudinary';
import { query, closePool } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cloudinaryV2 = cloudinary.v2;

const requireEnv = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing ${name} in environment`);
    }
    return value;
};

const isCloudinaryUrl = (url = '') => url.includes('res.cloudinary.com');
const isFacebookUrl = (url = '') => url.includes('facebook.com') || url.includes('fbcdn.net');
const isHttpUrl = (url = '') => /^https?:\/\//i.test(url);

const getExtFromContentType = (contentType) => {
    if (!contentType) return '.mp4';
    if (contentType.includes('video/mp4')) return '.mp4';
    if (contentType.includes('video/quicktime')) return '.mov';
    if (contentType.includes('video/webm')) return '.webm';
    return '.mp4';
};

const formatBytes = (bytes) => {
    if (!bytes || Number.isNaN(bytes)) return 'unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let size = bytes;
    while (size >= 1024 && idx < sizes.length - 1) {
        size /= 1024;
        idx++;
    }
    return `${size.toFixed(2)} ${sizes[idx]}`;
};

const downloadToTemp = async (url, label) => {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Allosh Reels Migrator)',
            'Accept': '*/*'
        }
    });

    if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
    }

    const contentType = res.headers.get('content-type') || '';
    const contentLength = Number(res.headers.get('content-length') || 0);
    const ext = getExtFromContentType(contentType);
    const tempPath = path.join(os.tmpdir(), `${label}${ext}`);

    await pipeline(res.body, fs.createWriteStream(tempPath));

    return {
        tempPath,
        contentLength,
        contentType
    };
};

const buildOptimizedVideoUrl = (publicId) => (
    cloudinaryV2.url(publicId, {
        resource_type: 'video',
        quality: 'auto:eco',
        fetch_format: 'mp4',
        width: 540,
        height: 960,
        crop: 'limit'
    })
);

const buildThumbnailUrl = (publicId) => (
    cloudinaryV2.url(publicId, {
        resource_type: 'video',
        format: 'jpg',
        width: 540,
        height: 960,
        crop: 'fill',
        quality: 'auto:good'
    })
);

const migrateReels = async () => {
    const dryRun = process.env.DRY_RUN === 'true';
    const limit = process.env.REELS_LIMIT ? Number(process.env.REELS_LIMIT) : null;
    const onlyFacebook = process.env.ONLY_FACEBOOK !== 'false';

    cloudinaryV2.config({
        cloud_name: requireEnv('CLOUDINARY_CLOUD_NAME'),
        api_key: requireEnv('CLOUDINARY_API_KEY'),
        api_secret: requireEnv('CLOUDINARY_API_SECRET')
    });

    const { rows } = await query(`
        SELECT id, title, video_url, facebook_url, thumbnail_url
        FROM facebook_reels
        ORDER BY id
    `);

    const reels = limit ? rows.slice(0, limit) : rows;

    console.log(`🎬 Reels found: ${rows.length}. Processing: ${reels.length}. Dry run: ${dryRun}`);

    for (const reel of reels) {
        const currentVideo = reel.video_url || '';
        const shouldProcess = !currentVideo || !isCloudinaryUrl(currentVideo) || (onlyFacebook && isFacebookUrl(currentVideo));
        if (!shouldProcess) {
            console.log(`⏭️  Skip #${reel.id} (${reel.title}) - already Cloudinary`);
            continue;
        }

        const sourceUrl = isHttpUrl(currentVideo) ? currentVideo : '';
        if (!sourceUrl || (!isHttpUrl(sourceUrl))) {
            console.log(`⚠️  Skip #${reel.id} (${reel.title}) - no direct video_url`);
            continue;
        }

        if (onlyFacebook && !isFacebookUrl(sourceUrl)) {
            console.log(`⏭️  Skip #${reel.id} (${reel.title}) - not Facebook URL`);
            continue;
        }

        console.log(`⬇️  Downloading #${reel.id} (${reel.title})`);
        let tempFile = null;
        try {
            const label = `reel-${reel.id}-${Date.now()}`;
            const download = await downloadToTemp(sourceUrl, label);
            tempFile = download.tempPath;
            console.log(`📦 Size: ${formatBytes(download.contentLength)} | Type: ${download.contentType || 'unknown'}`);

            const publicId = `reels/reel_${reel.id}`;
            if (dryRun) {
                console.log(`🧪 Dry run - would upload to Cloudinary: ${publicId}`);
            } else {
                const uploadResult = await cloudinaryV2.uploader.upload(tempFile, {
                    resource_type: 'video',
                    public_id: publicId,
                    overwrite: true
                });

                const optimizedUrl = buildOptimizedVideoUrl(publicId);
                const thumbnailUrl = buildThumbnailUrl(publicId);

                await query(
                    `UPDATE facebook_reels
                     SET video_url = $1,
                         thumbnail_url = COALESCE(NULLIF(thumbnail_url, ''), $2),
                         updated_at = NOW()
                     WHERE id = $3`,
                    [optimizedUrl, thumbnailUrl, reel.id]
                );

                console.log(`✅ Updated #${reel.id} → ${optimizedUrl}`);
            }
        } catch (error) {
            console.error(`❌ Failed #${reel.id}:`, error.message || error);
        } finally {
            if (tempFile && fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        }
    }

    await closePool();
    console.log('✅ Done.');
};

migrateReels().catch((err) => {
    console.error('❌ Migration failed:', err);
    closePool().finally(() => process.exit(1));
});
