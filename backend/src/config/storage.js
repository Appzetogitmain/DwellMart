import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Storage root path resolution:
 * - On Linux VPS: defaults to /var/storage (or process.env.STORAGE_ROOT)
 * - On Windows / Local dev: defaults to <project-root>/storage (or process.env.STORAGE_ROOT)
 */
const defaultStorageRoot = process.platform === 'win32'
    ? path.resolve(__dirname, '../../storage')
    : '/var/storage';

export const STORAGE_ROOT = path.resolve(process.env.STORAGE_ROOT || defaultStorageRoot);

/**
 * Base URL for serving assets:
 * e.g. https://api.domain.com or http://localhost:5000 in development
 */
export const STORAGE_BASE_URL = (
    process.env.STORAGE_BASE_URL ||
    process.env.API_URL ||
    `http://localhost:${process.env.PORT || 5000}`
).replace(/\/+$/, '');

/**
 * Supported storage entity categories
 */
export const STORAGE_TYPES = {
    PRODUCTS: 'products',
    CATEGORIES: 'categories',
    BRANDS: 'brands',
    BANNERS: 'banners',
    USERS: 'users',
    VENDORS: 'vendors',
    DOCUMENTS: 'documents',
    GENERAL: 'general',
};

/**
 * Sharp resizing and optimization presets by entity type
 */
export const RESIZE_PRESETS = {
    products: {
        width: 1000,
        height: 1000,
        fit: 'inside',
        withoutEnlargement: true,
        quality: 80,
    },
    categories: {
        width: 600,
        height: 600,
        fit: 'inside',
        withoutEnlargement: true,
        quality: 80,
    },
    banners: {
        width: 1920,
        height: 800,
        fit: 'inside',
        withoutEnlargement: true,
        quality: 82,
    },
    brands: {
        width: 500,
        height: 500,
        fit: 'inside',
        withoutEnlargement: true,
        quality: 80,
    },
    users: {
        width: 400,
        height: 400,
        fit: 'cover',
        withoutEnlargement: true,
        quality: 80,
    },
    vendors: {
        width: 600,
        height: 600,
        fit: 'inside',
        withoutEnlargement: true,
        quality: 80,
    },
    documents: {
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
        quality: 85,
    },
    general: {
        width: 1200,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true,
        quality: 80,
    },
};

/**
 * Automatically create storage root and standard category directories
 */
export const initStorageDirectories = () => {
    try {
        if (!fs.existsSync(STORAGE_ROOT)) {
            fs.mkdirSync(STORAGE_ROOT, { recursive: true });
        }
        for (const type of Object.values(STORAGE_TYPES)) {
            const dir = path.join(STORAGE_ROOT, type);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    } catch (err) {
        console.error('[Storage Init] Failed to initialize storage directories:', err.message);
    }
};

export default {
    STORAGE_ROOT,
    STORAGE_BASE_URL,
    STORAGE_TYPES,
    RESIZE_PRESETS,
    initStorageDirectories,
};
