import sharp from 'sharp';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
    STORAGE_ROOT,
    STORAGE_BASE_URL,
    STORAGE_TYPES,
    RESIZE_PRESETS,
} from '../config/storage.js';

/**
 * Normalize input entity type to valid storage folder name.
 * e.g., 'vendors/products' -> 'products', 'vendor_documents' -> 'documents'
 */
export const normalizeEntityType = (rawType = 'general') => {
    const cleaned = String(rawType || '').toLowerCase().trim();
    if (cleaned.includes('product')) return STORAGE_TYPES.PRODUCTS;
    if (cleaned.includes('categor')) return STORAGE_TYPES.CATEGORIES;
    if (cleaned.includes('brand')) return STORAGE_TYPES.BRANDS;
    if (cleaned.includes('banner')) return STORAGE_TYPES.BANNERS;
    if (cleaned.includes('user') || cleaned.includes('avatar')) return STORAGE_TYPES.USERS;
    if (cleaned.includes('vendor') && !cleaned.includes('document')) return STORAGE_TYPES.VENDORS;
    if (cleaned.includes('document') || cleaned.includes('license') || cleaned.includes('tax')) {
        return STORAGE_TYPES.DOCUMENTS;
    }
    return STORAGE_TYPES.GENERAL;
};

/**
 * Returns zero-padded date partitioning path: YYYY/MM
 */
export const getDatePartition = (dateInput = new Date()) => {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
    const year = String(validDate.getUTCFullYear());
    const month = String(validDate.getUTCMonth() + 1).padStart(2, '0');
    return {
        year,
        month,
        subPath: path.join(year, month),
        urlSubPath: `${year}/${month}`,
    };
};

/**
 * Process and convert image to WebP with entity-specific resizing and compression
 *
 * @param {Object} options
 * @param {Buffer} options.buffer - Raw image buffer
 * @param {string} [options.entityType='general'] - Entity category (products, categories, etc.)
 * @param {string} [options.originalname] - Original file name for logging
 * @param {Object} [options.customOptions] - Custom Sharp resize/webp options
 * @param {Date} [options.customDate] - Custom date for folder partitioning
 * @returns {Promise<{fileName: string, relativePath: string, url: string, absolutePath: string, format: string, width: number, height: number, size: number}>}
 */
export const processAndSaveImage = async ({
    buffer,
    entityType = 'general',
    originalname = '',
    customOptions = {},
    customDate = new Date(),
}) => {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('Valid image buffer is required for processing.');
    }

    const type = normalizeEntityType(entityType);
    const preset = { ...(RESIZE_PRESETS[type] || RESIZE_PRESETS.general), ...customOptions };
    const { year, month, subPath, urlSubPath } = getDatePartition(customDate);

    // Target directory: STORAGE_ROOT/<type>/<YYYY>/<MM>
    const targetDir = path.join(STORAGE_ROOT, type, subPath);
    await fsp.mkdir(targetDir, { recursive: true });

    // Generate unique UUID
    const uuid = crypto.randomUUID();
    const fileName = `${uuid}.webp`;
    const absolutePath = path.join(targetDir, fileName);

    // Process with Sharp
    const sharpInstance = sharp(buffer)
        .rotate() // Auto-orient based on EXIF
        .resize({
            width: preset.width,
            height: preset.height,
            fit: preset.fit || 'inside',
            withoutEnlargement: preset.withoutEnlargement ?? true,
        })
        .webp({
            quality: preset.quality || 80,
            effort: 4,
            lossless: false,
        });

    const outputBuffer = await sharpInstance.toBuffer();
    const metadata = await sharp(outputBuffer).metadata();

    // Atomic write
    const tempPath = `${absolutePath}.tmp_${Date.now()}`;
    await fsp.writeFile(tempPath, outputBuffer);
    await fsp.rename(tempPath, absolutePath);

    // URL format: https://api.domain.com/images/<type>/<YYYY>/<MM>/<uuid>.webp
    const relativePath = `${type}/${urlSubPath}/${fileName}`;
    const url = `${STORAGE_BASE_URL}/images/${relativePath}`;

    return {
        fileName,
        relativePath,
        url,
        absolutePath,
        format: 'webp',
        width: metadata.width,
        height: metadata.height,
        size: outputBuffer.length,
        originalName: originalname,
        entityType: type,
    };
};

/**
 * Process and save documents (PDF, DOC, DOCX, or raster document images)
 *
 * @param {Object} options
 * @param {Buffer} options.buffer - Raw document buffer
 * @param {string} options.originalname - Original file name with extension
 * @param {string} [options.mimetype] - Declared MIME type
 * @param {Date} [options.customDate] - Custom date for folder partitioning
 * @returns {Promise<{fileName: string, relativePath: string, url: string, absolutePath: string, format: string, size: number, isImage: boolean}>}
 */
export const processAndSaveDocument = async ({
    buffer,
    originalname = 'document',
    mimetype = '',
    customDate = new Date(),
}) => {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('Valid document buffer is required.');
    }

    const { year, month, subPath, urlSubPath } = getDatePartition(customDate);
    const targetDir = path.join(STORAGE_ROOT, STORAGE_TYPES.DOCUMENTS, subPath);
    await fsp.mkdir(targetDir, { recursive: true });

    const uuid = crypto.randomUUID();
    const isRasterImage = mimetype.startsWith('image/') || /\.(jpg|jpeg|png|webp|tiff)$/i.test(originalname);

    if (isRasterImage) {
        // Compress document image using Sharp
        const preset = RESIZE_PRESETS.documents;
        const processed = await sharp(buffer)
            .rotate()
            .resize({
                width: preset.width,
                height: preset.height,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality: preset.quality || 85, effort: 4 })
            .toBuffer();

        const fileName = `${uuid}.webp`;
        const absolutePath = path.join(targetDir, fileName);
        await fsp.writeFile(absolutePath, processed);

        const relativePath = `${STORAGE_TYPES.DOCUMENTS}/${urlSubPath}/${fileName}`;
        const url = `${STORAGE_BASE_URL}/images/${relativePath}`;

        return {
            fileName,
            relativePath,
            url,
            absolutePath,
            format: 'webp',
            size: processed.length,
            isImage: true,
            originalName: originalname,
        };
    }

    // PDF / Word / non-image documents: preserve binary integrity
    let ext = path.extname(originalname).toLowerCase().replace(/^\./, '');
    if (!ext) {
        ext = mimetype === 'application/pdf' ? 'pdf' : (mimetype.includes('word') ? 'docx' : 'bin');
    }

    const fileName = `${uuid}.${ext}`;
    const absolutePath = path.join(targetDir, fileName);
    await fsp.writeFile(absolutePath, buffer);

    const relativePath = `${STORAGE_TYPES.DOCUMENTS}/${urlSubPath}/${fileName}`;
    const url = `${STORAGE_BASE_URL}/images/${relativePath}`;

    return {
        fileName,
        relativePath,
        url,
        absolutePath,
        format: ext,
        size: buffer.length,
        isImage: false,
        originalName: originalname,
    };
};

export default {
    processAndSaveImage,
    processAndSaveDocument,
    normalizeEntityType,
    getDatePartition,
};
