import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { STORAGE_ROOT } from '../config/storage.js';

/**
 * Extract the relative storage path from a full URL, relative URL, or raw path.
 * Examples:
 *   https://api.domain.com/images/products/2026/09/abc.webp -> products/2026/09/abc.webp
 *   /images/categories/2026/09/def.webp -> categories/2026/09/def.webp
 *   /uploads/categories/abc.png -> categories/abc.png
 */
export const extractStorageRelativePath = (urlOrPath = '') => {
    if (!urlOrPath || typeof urlOrPath !== 'string') return '';
    const trimmed = urlOrPath.trim();

    // Match /images/<relativePath>
    const imagesMatch = trimmed.match(/\/images\/(.+)$/);
    if (imagesMatch) return imagesMatch[1].split('?')[0];

    // Match /uploads/<relativePath>
    const uploadsMatch = trimmed.match(/\/uploads\/(.+)$/);
    if (uploadsMatch) return uploadsMatch[1].split('?')[0];

    // If already relative, strip leading slash
    return trimmed.replace(/^\/+/, '').split('?')[0];
};

/**
 * Securely delete a file from VPS storage.
 * Includes path-traversal protection.
 *
 * @param {string} urlOrPath - Full URL or relative path of the file to delete
 * @returns {Promise<{deleted: boolean, path: string, reason?: string}>}
 */
export const deleteStoredFile = async (urlOrPath) => {
    if (!urlOrPath) {
        return { deleted: false, path: '', reason: 'Empty path or URL provided' };
    }

    const relative = extractStorageRelativePath(urlOrPath);
    if (!relative) {
        return { deleted: false, path: '', reason: 'Could not extract relative path' };
    }

    // Security Check: Resolve path and prevent path traversal
    const resolvedPath = path.resolve(STORAGE_ROOT, relative.split('/').join(path.sep));
    const normalizedStorageRoot = path.normalize(STORAGE_ROOT);

    if (!resolvedPath.startsWith(normalizedStorageRoot)) {
        console.warn(`[Security Alert] Path traversal attempt blocked: ${urlOrPath} -> ${resolvedPath}`);
        throw new Error('Access denied: Invalid file path.');
    }

    try {
        if (fs.existsSync(resolvedPath)) {
            await fsp.unlink(resolvedPath);
            return { deleted: true, path: resolvedPath };
        }
        return { deleted: false, path: resolvedPath, reason: 'File does not exist' };
    } catch (err) {
        console.error(`[File Storage] Failed to delete file ${resolvedPath}:`, err.message);
        return { deleted: false, path: resolvedPath, reason: err.message };
    }
};

/**
 * Delete image file alias
 */
export const deleteStoredImage = async (imageUrl) => {
    return deleteStoredFile(imageUrl);
};

/**
 * Delete document file alias
 */
export const deleteStoredDocument = async (documentUrl) => {
    return deleteStoredFile(documentUrl);
};

/**
 * Batch delete multiple stored files
 */
export const deleteStoredFiles = async (urlsOrPaths = []) => {
    const list = Array.isArray(urlsOrPaths) ? urlsOrPaths.filter(Boolean) : [];
    return Promise.allSettled(list.map((item) => deleteStoredFile(item)));
};

export default {
    extractStorageRelativePath,
    deleteStoredFile,
    deleteStoredImage,
    deleteStoredDocument,
    deleteStoredFiles,
};
