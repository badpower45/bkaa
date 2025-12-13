import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

const router = Router();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dwnaacuih',
    api_key: process.env.CLOUDINARY_API_KEY || '618291128553242',
    api_secret: process.env.CLOUDINARY_API_SECRET || '6EAD1r93PVx9iV8KlL9E2vNH8h4'
});

// Configure multer for memory storage (no disk storage needed)
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max file size
    },
    fileFilter: (req, file, cb) => {
        // Allow only images
        const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed.'));
        }
    }
});

/**
 * Upload single image to Cloudinary
 * POST /api/upload/image
 */
router.post('/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No image file provided' 
            });
        }

        // Get optional product ID or generate unique identifier
        const productId = req.body.productId || `product_${Date.now()}`;
        
        // Upload to Cloudinary using buffer
        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'products',
                    public_id: productId,
                    resource_type: 'image',
                    transformation: [
                        { width: 800, height: 800, crop: 'limit' },
                        { quality: 'auto:good' },
                        { fetch_format: 'auto' }
                    ]
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );

            // Create readable stream from buffer
            const bufferStream = Readable.from(req.file.buffer);
            bufferStream.pipe(uploadStream);
        });

        res.json({
            success: true,
            message: 'Image uploaded successfully',
            data: {
                url: uploadResult.secure_url,
                public_id: uploadResult.public_id,
                width: uploadResult.width,
                height: uploadResult.height,
                format: uploadResult.format,
                size: uploadResult.bytes
            }
        });

    } catch (error) {
        console.error('❌ Image upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload image',
            message: error.message
        });
    }
});

/**
 * Upload multiple images to Cloudinary
 * POST /api/upload/images
 */
router.post('/images', upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No image files provided' 
            });
        }

        const uploadPromises = req.files.map((file, index) => {
            return new Promise((resolve, reject) => {
                const productId = req.body[`productId_${index}`] || `product_${Date.now()}_${index}`;
                
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        folder: 'products',
                        public_id: productId,
                        resource_type: 'image',
                        transformation: [
                            { width: 800, height: 800, crop: 'limit' },
                            { quality: 'auto:good' },
                            { fetch_format: 'auto' }
                        ]
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve({
                            url: result.secure_url,
                            public_id: result.public_id,
                            originalName: file.originalname
                        });
                    }
                );

                const bufferStream = Readable.from(file.buffer);
                bufferStream.pipe(uploadStream);
            });
        });

        const results = await Promise.all(uploadPromises);

        res.json({
            success: true,
            message: `${results.length} images uploaded successfully`,
            data: results
        });

    } catch (error) {
        console.error('❌ Multiple images upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload images',
            message: error.message
        });
    }
});

/**
 * Delete image from Cloudinary
 * DELETE /api/upload/image/:publicId
 */
router.delete('/image/:publicId(*)', async (req, res) => {
    try {
        const publicId = req.params.publicId;

        if (!publicId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Public ID is required' 
            });
        }

        const result = await cloudinary.uploader.destroy(publicId);

        if (result.result === 'ok') {
            res.json({
                success: true,
                message: 'Image deleted successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Image not found or already deleted'
            });
        }

    } catch (error) {
        console.error('❌ Image deletion error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete image',
            message: error.message
        });
    }
});

/**
 * Get Cloudinary configuration (for debugging)
 * GET /api/upload/config
 */
router.get('/config', (req, res) => {
    res.json({
        success: true,
        config: {
            cloud_name: cloudinary.config().cloud_name,
            api_key_set: !!cloudinary.config().api_key,
            api_secret_set: !!cloudinary.config().api_secret
        }
    });
});

export default router;
