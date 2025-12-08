import multer from 'multer';
import path from 'path';

// Allowed file types and their mime types
const ALLOWED_IMAGE_TYPES = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/svg+xml': ['.svg']
};

const ALLOWED_EXCEL_TYPES = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-excel': ['.xls'],
    'text/csv': ['.csv']
};

// Maximum file sizes (in bytes)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_EXCEL_SIZE = 10 * 1024 * 1024; // 10MB

// Magic bytes for file type verification
const FILE_SIGNATURES = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4B, 0x03, 0x04]], // ZIP
    'application/vnd.ms-excel': [[0xD0, 0xCF, 0x11, 0xE0]] // OLE
};

/**
 * Verify file signature (magic bytes)
 * This helps prevent malicious files with spoofed extensions
 */
const verifyFileSignature = (buffer, mimeType) => {
    const signatures = FILE_SIGNATURES[mimeType];
    if (!signatures) return true; // No signature check available
    
    const fileHeader = [...buffer.slice(0, 8)];
    
    return signatures.some(signature => 
        signature.every((byte, index) => fileHeader[index] === byte)
    );
};

/**
 * Sanitize filename to prevent path traversal attacks
 */
const sanitizeFilename = (filename) => {
    // Remove path components
    const basename = path.basename(filename);
    // Remove special characters except . - _
    return basename.replace(/[^a-zA-Z0-9.\-_]/g, '_').toLowerCase();
};

/**
 * Create secure multer configuration for image uploads
 */
export const createImageUploader = (options = {}) => {
    const {
        maxSize = MAX_IMAGE_SIZE,
        allowedTypes = Object.keys(ALLOWED_IMAGE_TYPES),
        fieldName = 'image'
    } = options;
    
    const storage = multer.memoryStorage();
    
    const fileFilter = (req, file, cb) => {
        // Check mime type
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`), false);
        }
        
        // Check extension
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExtensions = allowedTypes.flatMap(type => ALLOWED_IMAGE_TYPES[type] || []);
        
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error(`Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`), false);
        }
        
        cb(null, true);
    };
    
    return multer({
        storage,
        limits: {
            fileSize: maxSize,
            files: 1
        },
        fileFilter
    });
};

/**
 * Create secure multer configuration for Excel uploads
 */
export const createExcelUploader = (options = {}) => {
    const {
        maxSize = MAX_EXCEL_SIZE,
        allowedTypes = Object.keys(ALLOWED_EXCEL_TYPES)
    } = options;
    
    const storage = multer.memoryStorage();
    
    const fileFilter = (req, file, cb) => {
        // Check mime type
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error(`Invalid file type. Allowed: Excel files (.xlsx, .xls, .csv)`), false);
        }
        
        // Check extension
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExtensions = allowedTypes.flatMap(type => ALLOWED_EXCEL_TYPES[type] || []);
        
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error(`Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`), false);
        }
        
        cb(null, true);
    };
    
    return multer({
        storage,
        limits: {
            fileSize: maxSize,
            files: 1
        },
        fileFilter
    });
};

/**
 * Middleware to verify file content after upload
 * Use after multer middleware
 */
export const verifyFileContent = (allowedMimeTypes) => {
    return (req, res, next) => {
        if (!req.file) {
            return next();
        }
        
        const { buffer, mimetype } = req.file;
        
        // Verify file signature
        if (!verifyFileSignature(buffer, mimetype)) {
            return res.status(400).json({
                error: 'File content does not match its type. File may be corrupted or malicious.'
            });
        }
        
        // Sanitize filename
        req.file.sanitizedName = sanitizeFilename(req.file.originalname);
        
        next();
    };
};

/**
 * Error handling middleware for multer errors
 */
export const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large. Maximum size exceeded.'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Too many files. Maximum file count exceeded.'
            });
        }
        return res.status(400).json({
            error: `Upload error: ${err.message}`
        });
    }
    
    if (err.message && err.message.includes('Invalid file')) {
        return res.status(400).json({
            error: err.message
        });
    }
    
    next(err);
};

/**
 * Pre-configured uploaders for common use cases
 */
export const imageUpload = createImageUploader();
export const excelUpload = createExcelUploader();

// Export single file upload middleware
export const uploadSingleImage = imageUpload.single('image');
export const uploadSingleExcel = excelUpload.single('file');

export default {
    createImageUploader,
    createExcelUploader,
    verifyFileContent,
    handleUploadError,
    imageUpload,
    excelUpload,
    uploadSingleImage,
    uploadSingleExcel,
    sanitizeFilename,
    MAX_IMAGE_SIZE,
    MAX_EXCEL_SIZE,
    ALLOWED_IMAGE_TYPES,
    ALLOWED_EXCEL_TYPES
};
