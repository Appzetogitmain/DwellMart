import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import {
    processAndSaveImage,
    processAndSaveDocument,
    normalizeEntityType,
} from '../utils/sharpProcessor.js';
import {
    deleteStoredFile,
    deleteStoredImage,
    deleteStoredDocument,
    deleteStoredFiles,
} from '../utils/fileStorage.js';

/**
 * Save an in-memory or stream image buffer to VPS storage with Sharp WebP optimization.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer
 * @param {string} [params.entityType='general']
 * @param {string} [params.originalname]
 * @param {Object} [params.customOptions]
 */
export const saveImageToStorage = async ({ buffer, entityType = 'general', originalname = '', customOptions = {} }) => {
    return processAndSaveImage({
        buffer,
        entityType,
        originalname,
        customOptions,
    });
};

/**
 * Save a document buffer (PDF, Word, or scanned image) to VPS storage.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer
 * @param {string} [params.originalname='document']
 * @param {string} [params.mimetype='']
 */
export const saveDocumentToStorage = async ({ buffer, originalname = 'document', mimetype = '' }) => {
    return processAndSaveDocument({
        buffer,
        originalname,
        mimetype,
    });
};

/**
 * Backward-compatible helper: Process a local temp file from multer disk storage,
 * store it into VPS storage with Sharp WebP compression, and cleanup the temp file.
 *
 * @param {string} localFilePath - Path to temporary file
 * @param {string} folder - Target entity category (e.g. 'vendors/products', 'categories', 'banners')
 * @param {string} [publicId] - Optional identifier (ignored in favor of secure UUID)
 * @returns {Promise<{url: string, publicId: string, fileName: string, relativePath: string}>}
 */
export const uploadLocalFileToCloudinaryAndCleanup = async (localFilePath, folder = 'general', publicId) => {
    if (!localFilePath || !fs.existsSync(localFilePath)) {
        throw new Error(`File not found at path: ${localFilePath}`);
    }

    try {
        const buffer = await fsp.readFile(localFilePath);
        const originalname = path.basename(localFilePath);
        const result = await processAndSaveImage({
            buffer,
            entityType: folder,
            originalname,
        });

        // Cleanup local temp file
        await fsp.unlink(localFilePath).catch(() => {});

        return {
            url: result.url,
            publicId: result.relativePath,
            fileName: result.fileName,
            relativePath: result.relativePath,
            size: result.size,
            format: result.format,
            width: result.width,
            height: result.height,
        };
    } catch (err) {
        await fsp.unlink(localFilePath).catch(() => {});
        throw err;
    }
};

/**
 * Backward-compatible helper with configurable resource type:
 * Handles images, PDFs, and Word documents, saving to VPS storage and cleaning temp file.
 */
export const uploadLocalFileToCloudinaryAndCleanupWithType = async (
    localFilePath,
    folder = 'documents',
    resourceType = 'auto',
    publicId
) => {
    if (!localFilePath || !fs.existsSync(localFilePath)) {
        throw new Error(`File not found at path: ${localFilePath}`);
    }

    try {
        const buffer = await fsp.readFile(localFilePath);
        const originalname = path.basename(localFilePath);
        const ext = path.extname(localFilePath).toLowerCase();
        const isDoc = ext === '.pdf' || ext === '.doc' || ext === '.docx' || folder.includes('document');

        let result;
        if (isDoc && ext !== '.jpg' && ext !== '.png' && ext !== '.webp') {
            result = await processAndSaveDocument({
                buffer,
                originalname,
                mimetype: ext === '.pdf' ? 'application/pdf' : 'application/octet-stream',
            });
        } else {
            result = await processAndSaveImage({
                buffer,
                entityType: folder,
                originalname,
            });
        }

        await fsp.unlink(localFilePath).catch(() => {});

        return {
            url: result.url,
            publicId: result.relativePath,
            fileName: result.fileName,
            relativePath: result.relativePath,
            size: result.size,
            format: result.format,
        };
    } catch (err) {
        await fsp.unlink(localFilePath).catch(() => {});
        throw err;
    }
};

/**
 * Backward-compatible alias for deleting a file from storage.
 */
export const deleteFromCloudinary = async (publicIdOrUrl) => {
    return deleteStoredFile(publicIdOrUrl);
};

/**
 * Cleanup helper for a single local file.
 */
export const cleanupLocalFile = async (localFilePath) => {
    if (!localFilePath) return false;
    try {
        await fsp.unlink(localFilePath);
        return true;
    } catch {
        return false;
    }
};

/**
 * Cleanup helper for multiple local files.
 */
export const cleanupLocalFiles = async (paths = []) => {
    const uniquePaths = [...new Set((paths || []).filter(Boolean))];
    await Promise.allSettled(uniquePaths.map((p) => cleanupLocalFile(p)));
};

export {
    deleteStoredFile,
    deleteStoredImage,
    deleteStoredDocument,
    deleteStoredFiles,
};

export default {
    saveImageToStorage,
    saveDocumentToStorage,
    uploadLocalFileToCloudinaryAndCleanup,
    uploadLocalFileToCloudinaryAndCleanupWithType,
    deleteFromCloudinary,
    deleteStoredFile,
    deleteStoredImage,
    deleteStoredDocument,
    deleteStoredFiles,
    cleanupLocalFile,
    cleanupLocalFiles,
};
