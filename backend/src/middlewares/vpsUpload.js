import multer from 'multer';
import ApiError from '../utils/ApiError.js';
import {
    processAndSaveImage,
    processAndSaveDocument,
    normalizeEntityType,
} from '../utils/sharpProcessor.js';

// Configuration
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_IMAGE_MIMES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);

const ALLOWED_DOCUMENT_MIMES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);

// Magic number signatures for tamper-proof content verification
const verifyBufferSignature = (buffer, isDocument = false) => {
    if (!buffer || buffer.length < 4) return false;
    const hex = buffer.subarray(0, 12).toString('hex').toLowerCase();

    // JPEG: ffd8ff
    if (hex.startsWith('ffd8ff')) return true;
    // PNG: 89504e47
    if (hex.startsWith('89504e47')) return true;
    // WebP: RIFF....WEBP (52494646....57454250)
    if (hex.startsWith('52494646') && hex.includes('57454250')) return true;

    if (isDocument) {
        // PDF: %PDF (25504446)
        if (hex.startsWith('25504446')) return true;
        // Office DOCX / ZIP: PK.. (504b0304)
        if (hex.startsWith('504b0304')) return true;
        // Legacy Word DOC: d0cf11e0
        if (hex.startsWith('d0cf11e0')) return true;
    }

    return false;
};

// Memory storage keeps file buffers available for Sharp without temp disk files
const memoryStorage = multer.memoryStorage();

// Multer filter for images
const imageFileFilter = (req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase().trim();
    if (ALLOWED_IMAGE_MIMES.has(mime)) {
        cb(null, true);
    } else {
        cb(new ApiError(400, 'Invalid image format. Allowed formats: JPG, JPEG, PNG, WEBP (Max 5MB).'), false);
    }
};

// Multer filter for documents
const documentFileFilter = (req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase().trim();
    if (ALLOWED_DOCUMENT_MIMES.has(mime)) {
        cb(null, true);
    } else {
        cb(new ApiError(400, 'Invalid document format. Allowed formats: PDF, DOC, DOCX, JPG, PNG, WEBP (Max 10MB).'), false);
    }
};

/**
 * Middleware: Single Image Upload with Sharp WebP Conversion
 *
 * @param {string} fieldName - Form field name (e.g. 'image')
 * @param {string} [defaultEntityType='general'] - Entity type (products, categories, banners, etc.)
 */
export const uploadSingleImage = (fieldName = 'image', defaultEntityType = 'general') => {
    const upload = multer({
        storage: memoryStorage,
        fileFilter: imageFileFilter,
        limits: { fileSize: MAX_IMAGE_SIZE },
    }).single(fieldName);

    return (req, res, next) => {
        upload(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                    return next(new ApiError(400, 'Image file size exceeds the 5MB limit.'));
                }
                return next(err);
            }

            if (!req.file) return next();

            // Content signature validation
            if (!verifyBufferSignature(req.file.buffer, false)) {
                return next(new ApiError(400, 'File content does not match allowed image formats.'));
            }

            try {
                const entityType = req.body?.folder || req.body?.entityType || defaultEntityType;
                const processed = await processAndSaveImage({
                    buffer: req.file.buffer,
                    entityType,
                    originalname: req.file.originalname,
                });
                req.processedFile = processed;
                return next();
            } catch (procErr) {
                return next(new ApiError(500, `Image processing error: ${procErr.message}`));
            }
        });
    };
};

/**
 * Middleware: Multiple Images Upload with Sharp WebP Conversion
 *
 * @param {string} fieldName - Form field name (e.g. 'images')
 * @param {string} [defaultEntityType='products'] - Entity type
 * @param {number} [maxCount=10] - Max images count
 */
export const uploadMultipleImages = (fieldName = 'images', defaultEntityType = 'products', maxCount = 10) => {
    const upload = multer({
        storage: memoryStorage,
        fileFilter: imageFileFilter,
        limits: { fileSize: MAX_IMAGE_SIZE },
    }).array(fieldName, maxCount);

    return (req, res, next) => {
        upload(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                    return next(new ApiError(400, 'One or more image files exceed the 5MB limit.'));
                }
                return next(err);
            }

            const files = req.files || [];
            if (files.length === 0) return next();

            // Validate all buffers
            for (const file of files) {
                if (!verifyBufferSignature(file.buffer, false)) {
                    return next(new ApiError(400, `Invalid file content in file "${file.originalname}".`));
                }
            }

            try {
                const entityType = req.body?.folder || req.body?.entityType || defaultEntityType;
                const settled = await Promise.all(
                    files.map((file) =>
                        processAndSaveImage({
                            buffer: file.buffer,
                            entityType,
                            originalname: file.originalname,
                        })
                    )
                );
                req.processedFiles = settled;
                return next();
            } catch (procErr) {
                return next(new ApiError(500, `Batch image processing error: ${procErr.message}`));
            }
        });
    };
};

/**
 * Middleware: Single Document Upload (PDF, Word, or Scanned Image)
 *
 * @param {string} fieldName - Form field name (e.g. 'document')
 */
export const uploadSingleDocument = (fieldName = 'document') => {
    const upload = multer({
        storage: memoryStorage,
        fileFilter: documentFileFilter,
        limits: { fileSize: MAX_DOCUMENT_SIZE },
    }).single(fieldName);

    return (req, res, next) => {
        upload(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                    return next(new ApiError(400, 'Document file size exceeds the 10MB limit.'));
                }
                return next(err);
            }

            if (!req.file) return next();

            if (!verifyBufferSignature(req.file.buffer, true)) {
                return next(new ApiError(400, 'File content does not match allowed document formats.'));
            }

            try {
                const processed = await processAndSaveDocument({
                    buffer: req.file.buffer,
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                });
                req.processedDocument = processed;
                return next();
            } catch (procErr) {
                return next(new ApiError(500, `Document processing error: ${procErr.message}`));
            }
        });
    };
};

export default {
    uploadSingleImage,
    uploadMultipleImages,
    uploadSingleDocument,
};
