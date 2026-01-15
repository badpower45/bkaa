import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dqfqixbbf',
    api_key: process.env.CLOUDINARY_API_KEY || '867814954623845',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'kHKCYwXx_tUCrXcqaWXIgPmOCpA'
});

// Cloudinary storage for product frames
export const frameStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'allosh/frames',
        allowed_formats: ['png'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }],
        public_id: (req, file) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            return `frame-${uniqueSuffix}`;
        }
    }
});

export default cloudinary;
