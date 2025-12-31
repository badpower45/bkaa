import express from 'express';
import { query } from '../database.js';
import { authenticateToken, isAdmin } from '../middleware/auth.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

const router = express.Router();

// Configure Cloudinary (using existing config from upload.js)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dwnaacuih',
    api_key: process.env.CLOUDINARY_API_KEY || '618291128553242',
    api_secret: process.env.CLOUDINARY_API_SECRET || '6EAD1r93PVx9iV8KlL9E2vNH8h4'
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif'];
        if (!allowedMimes.includes(file.mimetype)) {
            return cb(new Error('نوع الملف غير مسموح. فقط صور JPEG, PNG, WEBP, GIF'));
        }
        cb(null, true);
    }
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer, folder = 'hero-sections') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: 'image',
                transformation: [
                    { width: 1920, height: 800, crop: 'limit', quality: 'auto:good' }
                ]
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        const readableStream = Readable.from(buffer);
        readableStream.pipe(uploadStream);
    });
};

// ============================================
// GET all hero sections (Public - for frontend)
// ============================================
router.get('/', async (req, res) => {
    try {
        const showAll = req.query.all === 'true'; // Admin can view all
        
        let sql = `
            SELECT 
                id, title_en, title_ar, subtitle_en, subtitle_ar,
                description_en, description_ar, image_url, mobile_image_url,
                image_alt_en, image_alt_ar,
                button1_text_en, button1_text_ar, button1_link, button1_color, button1_enabled,
                button2_text_en, button2_text_ar, button2_link, button2_color, button2_enabled,
                display_order, is_active, show_on_mobile, show_on_desktop,
                background_color, text_color, overlay_opacity,
                animation_type, animation_duration,
                click_count, view_count,
                created_at, updated_at
            FROM hero_sections
        `;
        
        if (!showAll) {
            sql += ' WHERE is_active = true';
        }
        
        sql += ' ORDER BY display_order ASC, created_at DESC';
        
        const result = await query(sql);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching hero sections:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب البيانات',
            error: error.message
        });
    }
});

// ============================================
// GET single hero section by ID
// ============================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            'SELECT * FROM hero_sections WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Hero section not found'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching hero section:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب البيانات',
            error: error.message
        });
    }
});

// ============================================
// POST - Create new hero section (Admin only)
// ============================================
router.post('/', authenticateToken, isAdmin, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'mobile_image', maxCount: 1 }
]), async (req, res) => {
    try {
        const {
            title_en, title_ar, subtitle_en, subtitle_ar,
            description_en, description_ar,
            image_url, mobile_image_url, // Can be provided as URL
            image_alt_en, image_alt_ar,
            button1_text_en, button1_text_ar, button1_link, button1_color, button1_enabled,
            button2_text_en, button2_text_ar, button2_link, button2_color, button2_enabled,
            display_order, is_active, show_on_mobile, show_on_desktop,
            background_color, text_color, overlay_opacity,
            animation_type, animation_duration
        } = req.body;
        
        let finalImageUrl = image_url;
        let finalMobileImageUrl = mobile_image_url;
        
        // Upload main image to Cloudinary if provided
        if (req.files?.image) {
            const uploadResult = await uploadToCloudinary(req.files.image[0].buffer, 'hero-sections');
            finalImageUrl = uploadResult.secure_url;
        }
        
        // Upload mobile image to Cloudinary if provided
        if (req.files?.mobile_image) {
            const uploadResult = await uploadToCloudinary(req.files.mobile_image[0].buffer, 'hero-sections/mobile');
            finalMobileImageUrl = uploadResult.secure_url;
        }
        
        if (!finalImageUrl) {
            return res.status(400).json({
                success: false,
                message: 'Image URL or image file is required'
            });
        }
        
        const result = await query(
            `INSERT INTO hero_sections (
                title_en, title_ar, subtitle_en, subtitle_ar,
                description_en, description_ar,
                image_url, mobile_image_url, image_alt_en, image_alt_ar,
                button1_text_en, button1_text_ar, button1_link, button1_color, button1_enabled,
                button2_text_en, button2_text_ar, button2_link, button2_color, button2_enabled,
                display_order, is_active, show_on_mobile, show_on_desktop,
                background_color, text_color, overlay_opacity,
                animation_type, animation_duration,
                created_by, updated_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27, $28, $29,
                $30, $30
            ) RETURNING *`,
            [
                title_en, title_ar, subtitle_en, subtitle_ar,
                description_en, description_ar,
                finalImageUrl, finalMobileImageUrl, image_alt_en, image_alt_ar,
                button1_text_en, button1_text_ar, button1_link, button1_color || '#FF6B6B', button1_enabled === 'true' || button1_enabled === true,
                button2_text_en, button2_text_ar, button2_link, button2_color || '#4ECDC4', button2_enabled === 'true' || button2_enabled === true,
                display_order || 0, is_active === 'true' || is_active === true || is_active === undefined,
                show_on_mobile === 'true' || show_on_mobile === true || show_on_mobile === undefined,
                show_on_desktop === 'true' || show_on_desktop === true || show_on_desktop === undefined,
                background_color || '#FFFFFF', text_color || '#000000', overlay_opacity || 0.0,
                animation_type || 'fade', animation_duration || 5000,
                req.user.id
            ]
        );
        
        res.status(201).json({
            success: true,
            message: 'تم إنشاء Hero section بنجاح',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating hero section:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إنشاء Hero section',
            error: error.message
        });
    }
});

// ============================================
// PUT - Update hero section (Admin only)
// ============================================
router.put('/:id', authenticateToken, isAdmin, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'mobile_image', maxCount: 1 }
]), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title_en, title_ar, subtitle_en, subtitle_ar,
            description_en, description_ar,
            image_url, mobile_image_url,
            image_alt_en, image_alt_ar,
            button1_text_en, button1_text_ar, button1_link, button1_color, button1_enabled,
            button2_text_en, button2_text_ar, button2_link, button2_color, button2_enabled,
            display_order, is_active, show_on_mobile, show_on_desktop,
            background_color, text_color, overlay_opacity,
            animation_type, animation_duration
        } = req.body;
        
        // Get current hero section
        const current = await query('SELECT * FROM hero_sections WHERE id = $1', [id]);
        
        if (current.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Hero section not found'
            });
        }
        
        let finalImageUrl = image_url || current.rows[0].image_url;
        let finalMobileImageUrl = mobile_image_url || current.rows[0].mobile_image_url;
        
        // Upload new main image if provided
        if (req.files?.image) {
            const uploadResult = await uploadToCloudinary(req.files.image[0].buffer, 'hero-sections');
            finalImageUrl = uploadResult.secure_url;
        }
        
        // Upload new mobile image if provided
        if (req.files?.mobile_image) {
            const uploadResult = await uploadToCloudinary(req.files.mobile_image[0].buffer, 'hero-sections/mobile');
            finalMobileImageUrl = uploadResult.secure_url;
        }
        
        const result = await query(
            `UPDATE hero_sections SET
                title_en = COALESCE($1, title_en),
                title_ar = COALESCE($2, title_ar),
                subtitle_en = COALESCE($3, subtitle_en),
                subtitle_ar = COALESCE($4, subtitle_ar),
                description_en = COALESCE($5, description_en),
                description_ar = COALESCE($6, description_ar),
                image_url = $7,
                mobile_image_url = $8,
                image_alt_en = COALESCE($9, image_alt_en),
                image_alt_ar = COALESCE($10, image_alt_ar),
                button1_text_en = COALESCE($11, button1_text_en),
                button1_text_ar = COALESCE($12, button1_text_ar),
                button1_link = COALESCE($13, button1_link),
                button1_color = COALESCE($14, button1_color),
                button1_enabled = COALESCE($15, button1_enabled),
                button2_text_en = COALESCE($16, button2_text_en),
                button2_text_ar = COALESCE($17, button2_text_ar),
                button2_link = COALESCE($18, button2_link),
                button2_color = COALESCE($19, button2_color),
                button2_enabled = COALESCE($20, button2_enabled),
                display_order = COALESCE($21, display_order),
                is_active = COALESCE($22, is_active),
                show_on_mobile = COALESCE($23, show_on_mobile),
                show_on_desktop = COALESCE($24, show_on_desktop),
                background_color = COALESCE($25, background_color),
                text_color = COALESCE($26, text_color),
                overlay_opacity = COALESCE($27, overlay_opacity),
                animation_type = COALESCE($28, animation_type),
                animation_duration = COALESCE($29, animation_duration),
                updated_by = $30
            WHERE id = $31
            RETURNING *`,
            [
                title_en, title_ar, subtitle_en, subtitle_ar,
                description_en, description_ar,
                finalImageUrl, finalMobileImageUrl, image_alt_en, image_alt_ar,
                button1_text_en, button1_text_ar, button1_link, button1_color,
                button1_enabled === 'true' || button1_enabled === true ? true : button1_enabled === 'false' || button1_enabled === false ? false : null,
                button2_text_en, button2_text_ar, button2_link, button2_color,
                button2_enabled === 'true' || button2_enabled === true ? true : button2_enabled === 'false' || button2_enabled === false ? false : null,
                display_order, 
                is_active === 'true' || is_active === true ? true : is_active === 'false' || is_active === false ? false : null,
                show_on_mobile === 'true' || show_on_mobile === true ? true : show_on_mobile === 'false' || show_on_mobile === false ? false : null,
                show_on_desktop === 'true' || show_on_desktop === true ? true : show_on_desktop === 'false' || show_on_desktop === false ? false : null,
                background_color, text_color, overlay_opacity,
                animation_type, animation_duration,
                req.user.id,
                id
            ]
        );
        
        res.json({
            success: true,
            message: 'تم تحديث Hero section بنجاح',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating hero section:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تحديث Hero section',
            error: error.message
        });
    }
});

// ============================================
// DELETE hero section (Admin only)
// ============================================
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            'DELETE FROM hero_sections WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Hero section not found'
            });
        }
        
        res.json({
            success: true,
            message: 'تم حذف Hero section بنجاح',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error deleting hero section:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف Hero section',
            error: error.message
        });
    }
});

// ============================================
// POST - Update display order (Admin only)
// ============================================
router.post('/reorder', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { orders } = req.body; // Array of { id, display_order }
        
        if (!Array.isArray(orders)) {
            return res.status(400).json({
                success: false,
                message: 'Orders must be an array'
            });
        }
        
        // Update each hero section's display order
        for (const item of orders) {
            await query(
                'UPDATE hero_sections SET display_order = $1 WHERE id = $2',
                [item.display_order, item.id]
            );
        }
        
        res.json({
            success: true,
            message: 'تم تحديث الترتيب بنجاح'
        });
    } catch (error) {
        console.error('Error reordering hero sections:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تحديث الترتيب',
            error: error.message
        });
    }
});

// ============================================
// POST - Track click on hero section button
// ============================================
router.post('/:id/track-click', async (req, res) => {
    try {
        const { id } = req.params;
        
        await query(
            'UPDATE hero_sections SET click_count = click_count + 1 WHERE id = $1',
            [id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error tracking click:', error);
        res.status(500).json({ success: false });
    }
});

// ============================================
// POST - Track view on hero section
// ============================================
router.post('/:id/track-view', async (req, res) => {
    try {
        const { id } = req.params;
        
        await query(
            'UPDATE hero_sections SET view_count = view_count + 1 WHERE id = $1',
            [id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error tracking view:', error);
        res.status(500).json({ success: false });
    }
});

export default router;
