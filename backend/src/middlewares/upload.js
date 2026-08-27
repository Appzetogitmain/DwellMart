import multer from 'multer';
import ApiError from '../utils/ApiError.js';
import fs from 'fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { canonicalExtension, verifyFileContent } from '../utils/fileSignature.js';

const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/x-png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/svg+xml',
];
const ALLOWED_DOCUMENT_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/x-png',
    'image/webp',
    'image/gif',
    'image/avif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/tmp');
const DELIVERY_DOCS_DIR = path.resolve(__dirname, '../../uploads/delivery-docs');
fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DELIVERY_DOCS_DIR, { recursive: true });

/**
 * Build a stored filename.
 *
 * The extension comes from the DECLARED TYPE's canonical mapping, never from
 * the uploaded filename. Previously `path.extname(file.originalname)` was
 * preserved verbatim, so `payload.html` declared as `image/png` was written to
 * disk as `.html` — and `/uploads` is served by `express.static`, which infers
 * `text/html` from the extension. That is stored XSS on the app origin.
 *
 * If the declared type has no canonical extension the file gets `.bin`, which
 * is inert however it is served. Content is verified separately after the write
 * (see `verifyUploadedFiles`), because disk storage gives no buffer to sniff
 * during multer's `fileFilter`.
 */
const buildStoredFilename = (file, fallbackBase = 'file') => {
    const safeBaseName = (file.originalname || fallbackBase)
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9-_]/g, '_')
        .slice(0, 60) || fallbackBase;

    const ext = canonicalExtension(file.mimetype) || '.bin';
    return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBaseName}${ext}`;
};

const imageDiskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TMP_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, buildStoredFilename(file, 'file'));
    }
});

const csvMemoryStorage = multer.memoryStorage();

const deliveryDocumentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, DELIVERY_DOCS_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, buildStoredFilename(file, 'document'));
    }
});

/**
 * Post-upload content verification.
 *
 * multer's `fileFilter` sees only the client's `Content-Type` header, and disk
 * storage gives it no buffer, so the real check has to happen after the file
 * is written. Any file whose leading bytes contradict its declared type is
 * DELETED and the request rejected.
 *
 * @param {string[]} allowedMimeTypes
 */
export const verifyUploadedFiles = (allowedMimeTypes) => async (req, res, next) => {
    const collected = [
        ...(req.file ? [req.file] : []),
        ...(Array.isArray(req.files) ? req.files : []),
        ...(req.files && !Array.isArray(req.files)
            ? Object.values(req.files).flat()
            : []),
    ].filter((f) => f?.path);

    if (collected.length === 0) return next();

    for (const file of collected) {
        const result = await verifyFileContent(file.path, allowedMimeTypes);
        if (!result.ok) {
            // Remove every file from this request — a rejected upload must not
            // leave anything reachable on disk.
            await Promise.all(
                collected.map((f) => fsp.unlink(f.path).catch(() => {}))
            );
            return next(new ApiError(
                400,
                `${result.reason} The file's contents do not match its type, so it was rejected.`
            ));
        }
        // Record what it actually is, for any downstream consumer.
        file.detectedMimeType = result.detected.mime;
    }

    return next();
};

const fileFilter = (req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase().trim();
    if (ALLOWED_MIME_TYPES.includes(mime)) {
        cb(null, true);
    } else {
        cb(new ApiError(400, 'Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed.'), false);
    }
};

// Single image upload.
//
// Returns [multer, contentVerifier]. Express flattens middleware arrays, so
// every existing `uploadSingle('image')` call site gains content verification
// with no change at the call site — the MIME allowlist alone only ever checked
// a client-supplied header.
export const uploadSingle = (fieldName) => [
    multer({ storage: imageDiskStorage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } }).single(fieldName),
    verifyUploadedFiles(ALLOWED_MIME_TYPES),
];

// Multiple images upload (max 5)
export const uploadMultiple = (fieldName, maxCount = 5) => [
    multer({ storage: imageDiskStorage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } }).array(fieldName, maxCount),
    verifyUploadedFiles(ALLOWED_MIME_TYPES),
];

// Single document upload (pdf or image)
export const uploadDocumentSingle = (fieldName) => [
    multer({
        storage: imageDiskStorage,
        fileFilter: (req, file, cb) => {
            if (ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(
                    new ApiError(
                        400,
                        'Invalid file type. Only PDF, Word, JPEG, PNG, WEBP, and GIF are allowed.'
                    ),
                    false
                );
            }
        },
        limits: { fileSize: MAX_DOCUMENT_FILE_SIZE },
    }).single(fieldName),
    verifyUploadedFiles(ALLOWED_DOCUMENT_MIME_TYPES),
];

// Multiple named document uploads (used for delivery registration docs).
// These carry rider Aadhaar and driving licences, so content verification
// matters more here than anywhere else.
export const uploadDeliveryDocuments = (fields) => [
    multer({
        storage: deliveryDocumentStorage,
        fileFilter: (req, file, cb) => {
            if (ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(
                    new ApiError(
                        400,
                        'Invalid file type. Only PDF, Word, JPEG, PNG, WEBP, and GIF are allowed.'
                    ),
                    false
                );
            }
        },
        limits: { fileSize: MAX_DOCUMENT_FILE_SIZE },
    }).fields(fields),
    verifyUploadedFiles(ALLOWED_DOCUMENT_MIME_TYPES),
];

// CSV upload for bulk operations
export const uploadCSV = multer({
    storage: csvMemoryStorage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new ApiError(400, 'Only CSV files are allowed for bulk upload.'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for CSV
}).single('file');
