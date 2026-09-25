import mongoose from 'mongoose';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

import {
    STORAGE_ROOT,
    STORAGE_BASE_URL,
    STORAGE_TYPES,
    initStorageDirectories,
} from '../src/config/storage.js';
import {
    processAndSaveImage,
    processAndSaveDocument,
    normalizeEntityType,
} from '../src/utils/sharpProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
const MANIFEST_PATH = path.join(UPLOADS_DIR, 'cloudinary_download_manifest.json');
const AUDIT_LOG_PATH = path.join(STORAGE_ROOT, 'migration_audit_log.json');

const isDryRun = process.argv.includes('--dry-run');

console.log('====================================================');
console.log('    CLOUDINARY TO VPS STORAGE MIGRATION SCRIPT     ');
console.log('====================================================');
console.log(`Execution Mode: ${isDryRun ? 'DRY RUN (Read-Only Preview)' : 'LIVE MIGRATION'}`);
console.log(`Storage Root: ${STORAGE_ROOT}`);
console.log(`Storage Base URL: ${STORAGE_BASE_URL}`);
console.log(`Local Uploads Cache: ${UPLOADS_DIR}`);

// Initialize storage folders
initStorageDirectories();

// Load manifest if available
let manifest = {};
if (fs.existsSync(MANIFEST_PATH)) {
    try {
        manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        console.log(`Loaded Cloudinary manifest with ${Object.keys(manifest).length} records.`);
    } catch {
        console.warn('Could not parse manifest, falling back to disk path lookup.');
    }
}

/**
 * Locate local file on disk matching a Cloudinary URL
 */
const findLocalFileForUrl = (url = '') => {
    if (!url || typeof url !== 'string') return null;

    // Direct manifest match
    for (const [pubId, item] of Object.entries(manifest)) {
        if (item.url === url || item.secure_url === url) {
            if (fs.existsSync(item.full_path)) return item.full_path;
        }
    }

    // Extract path after /upload/ (e.g. v1788644630/categories/ll6hqs7rlp0godqyrydv.png)
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match) return null;

    const relPath = match[1].split('?')[0];
    const directPath = path.join(UPLOADS_DIR, relPath.split('/').join(path.sep));
    if (fs.existsSync(directPath)) return directPath;

    // Check with extensions if missing
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '.pdf']) {
        const withExt = path.join(UPLOADS_DIR, `${relPath.split('/').join(path.sep)}${ext}`);
        if (fs.existsSync(withExt)) return withExt;
    }

    // Also check vendor_documents without prefix
    const baseName = path.basename(relPath);
    for (const sub of ['vendor_documents', 'vendors/documents', 'categories', 'products', 'brands', 'banners']) {
        const candidate = path.join(UPLOADS_DIR, sub.split('/').join(path.sep), baseName);
        if (fs.existsSync(candidate)) return candidate;
    }

    return null;
};

// In-memory cache to prevent duplicate processing of identical URLs
const migratedUrlCache = new Map();
const auditLog = [];

/**
 * Migrate a single URL to VPS storage
 */
const migrateUrl = async (url, entityType = 'general') => {
    if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) {
        return url;
    }

    if (migratedUrlCache.has(url)) {
        return migratedUrlCache.get(url);
    }

    const localFilePath = findLocalFileForUrl(url);
    if (!localFilePath) {
        console.warn(`[WARNING] No local downloaded file found for URL: ${url}`);
        return null;
    }

    if (isDryRun) {
        const dummyUrl = `${STORAGE_BASE_URL}/images/${normalizeEntityType(entityType)}/2026/09/preview-uuid.webp`;
        migratedUrlCache.set(url, dummyUrl);
        return dummyUrl;
    }

    try {
        const buffer = await fsp.readFile(localFilePath);
        const originalname = path.basename(localFilePath);
        const ext = path.extname(localFilePath).toLowerCase();
        const isDoc = ext === '.pdf' || ext === '.doc' || ext === '.docx' || entityType.includes('document');

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
                entityType,
                originalname,
            });
        }

        migratedUrlCache.set(url, result.url);
        return result.url;
    } catch (err) {
        console.error(`[ERROR] Failed to migrate ${url}:`, err.message);
        return null;
    }
};

async function main() {
    console.log('\nConnecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    console.log('Connected to MongoDB.\n');

    const stats = {
        categories: { found: 0, updated: 0 },
        products: { found: 0, updated: 0 },
        brands: { found: 0, updated: 0 },
        banners: { found: 0, updated: 0 },
        users: { found: 0, updated: 0 },
        vendors: { found: 0, updated: 0 },
        vendordocuments: { found: 0, updated: 0 },
    };

    // 1. Categories
    console.log('--- Migrating Categories ---');
    const categories = await db.collection('categories').find({
        $or: [{ image: /cloudinary\.com/ }, { icon: /cloudinary\.com/ }],
    }).toArray();
    stats.categories.found = categories.length;

    for (const cat of categories) {
        const updates = {};
        if (cat.image && cat.image.includes('cloudinary.com')) {
            const newUrl = await migrateUrl(cat.image, 'categories');
            if (newUrl && newUrl !== cat.image) updates.image = newUrl;
        }
        if (cat.icon && cat.icon.includes('cloudinary.com')) {
            const newUrl = await migrateUrl(cat.icon, 'categories');
            if (newUrl && newUrl !== cat.icon) updates.icon = newUrl;
        }

        if (Object.keys(updates).length > 0) {
            if (!isDryRun) {
                await db.collection('categories').updateOne({ _id: cat._id }, { $set: updates });
            }
            stats.categories.updated++;
            auditLog.push({ collection: 'categories', id: cat._id, updates });
        }
    }
    console.log(`Categories: ${stats.categories.updated} / ${stats.categories.found} updated.`);

    // 2. Products
    console.log('\n--- Migrating Products ---');
    const products = await db.collection('products').find({
        $or: [{ image: /cloudinary\.com/ }, { images: /cloudinary\.com/ }],
    }).toArray();
    stats.products.found = products.length;

    for (const prod of products) {
        const updates = {};
        if (prod.image && prod.image.includes('cloudinary.com')) {
            const newUrl = await migrateUrl(prod.image, 'products');
            if (newUrl && newUrl !== prod.image) updates.image = newUrl;
        }
        if (Array.isArray(prod.images) && prod.images.length > 0) {
            const newImages = [];
            let changed = false;
            for (const img of prod.images) {
                if (img && img.includes('cloudinary.com')) {
                    const newUrl = await migrateUrl(img, 'products');
                    if (newUrl) {
                        newImages.push(newUrl);
                        changed = true;
                    } else {
                        newImages.push(img);
                    }
                } else {
                    newImages.push(img);
                }
            }
            if (changed) updates.images = newImages;
        }

        if (Object.keys(updates).length > 0) {
            if (!isDryRun) {
                await db.collection('products').updateOne({ _id: prod._id }, { $set: updates });
            }
            stats.products.updated++;
            auditLog.push({ collection: 'products', id: prod._id, updates });
        }
    }
    console.log(`Products: ${stats.products.updated} / ${stats.products.found} updated.`);

    // 3. Brands
    console.log('\n--- Migrating Brands ---');
    const brands = await db.collection('brands').find({ logo: /cloudinary\.com/ }).toArray();
    stats.brands.found = brands.length;

    for (const brand of brands) {
        if (brand.logo && brand.logo.includes('cloudinary.com')) {
            const newUrl = await migrateUrl(brand.logo, 'brands');
            if (newUrl && newUrl !== brand.logo) {
                if (!isDryRun) {
                    await db.collection('brands').updateOne({ _id: brand._id }, { $set: { logo: newUrl } });
                }
                stats.brands.updated++;
                auditLog.push({ collection: 'brands', id: brand._id, updates: { logo: newUrl } });
            }
        }
    }
    console.log(`Brands: ${stats.brands.updated} / ${stats.brands.found} updated.`);

    // 4. Banners
    console.log('\n--- Migrating Banners ---');
    const banners = await db.collection('banners').find({ image: /cloudinary\.com/ }).toArray();
    stats.banners.found = banners.length;

    for (const banner of banners) {
        if (banner.image && banner.image.includes('cloudinary.com')) {
            const newUrl = await migrateUrl(banner.image, 'banners');
            if (newUrl && newUrl !== banner.image) {
                if (!isDryRun) {
                    await db.collection('banners').updateOne({ _id: banner._id }, { $set: { image: newUrl } });
                }
                stats.banners.updated++;
                auditLog.push({ collection: 'banners', id: banner._id, updates: { image: newUrl } });
            }
        }
    }
    console.log(`Banners: ${stats.banners.updated} / ${stats.banners.found} updated.`);

    // 5. Users (Avatars)
    console.log('\n--- Migrating Users Avatars ---');
    const users = await db.collection('users').find({ avatar: /cloudinary\.com/ }).toArray();
    stats.users.found = users.length;

    for (const user of users) {
        if (user.avatar && user.avatar.includes('cloudinary.com')) {
            const newUrl = await migrateUrl(user.avatar, 'users');
            if (newUrl && newUrl !== user.avatar) {
                if (!isDryRun) {
                    await db.collection('users').updateOne({ _id: user._id }, { $set: { avatar: newUrl } });
                }
                stats.users.updated++;
                auditLog.push({ collection: 'users', id: user._id, updates: { avatar: newUrl } });
            }
        }
    }
    console.log(`Users: ${stats.users.updated} / ${stats.users.found} updated.`);

    // 6. Vendors (Logos & Inline Documents)
    console.log('\n--- Migrating Vendors ---');
    const vendors = await db.collection('vendors').find({
        $or: [
            { logo: /cloudinary\.com/ },
            { 'documents.gst': /cloudinary\.com/ },
            { 'documents.pan': /cloudinary\.com/ },
            { 'documents.tradeLicense.url': /cloudinary\.com/ },
            { 'documents.businessLicense': /cloudinary\.com/ },
        ],
    }).toArray();
    stats.vendors.found = vendors.length;

    for (const v of vendors) {
        const updates = {};
        if (v.logo && v.logo.includes('cloudinary.com')) {
            const newUrl = await migrateUrl(v.logo, 'vendors');
            if (newUrl) updates.logo = newUrl;
        }

        if (v.documents) {
            for (const [docKey, docVal] of Object.entries(v.documents)) {
                if (typeof docVal === 'string' && docVal.includes('cloudinary.com')) {
                    const newUrl = await migrateUrl(docVal, 'documents');
                    if (newUrl) updates[`documents.${docKey}`] = newUrl;
                } else if (docVal && typeof docVal === 'object' && docVal.url && docVal.url.includes('cloudinary.com')) {
                    const newUrl = await migrateUrl(docVal.url, 'documents');
                    if (newUrl) updates[`documents.${docKey}.url`] = newUrl;
                }
            }
        }

        if (Object.keys(updates).length > 0) {
            if (!isDryRun) {
                await db.collection('vendors').updateOne({ _id: v._id }, { $set: updates });
            }
            stats.vendors.updated++;
            auditLog.push({ collection: 'vendors', id: v._id, updates });
        }
    }
    console.log(`Vendors: ${stats.vendors.updated} / ${stats.vendors.found} updated.`);

    // 7. Vendor Documents Collection
    console.log('\n--- Migrating Vendor Documents Collection ---');
    const vendorDocuments = await db.collection('vendordocuments').find({
        fileUrl: /cloudinary\.com/,
    }).toArray();
    stats.vendordocuments.found = vendorDocuments.length;

    for (const vdoc of vendorDocuments) {
        if (vdoc.fileUrl && vdoc.fileUrl.includes('cloudinary.com')) {
            const newUrl = await migrateUrl(vdoc.fileUrl, 'documents');
            if (newUrl && newUrl !== vdoc.fileUrl) {
                const relativePath = newUrl.replace(`${STORAGE_BASE_URL}/images/`, '');
                const updates = {
                    fileUrl: newUrl,
                    filePublicId: relativePath,
                };
                if (!isDryRun) {
                    await db.collection('vendordocuments').updateOne({ _id: vdoc._id }, { $set: updates });
                }
                stats.vendordocuments.updated++;
                auditLog.push({ collection: 'vendordocuments', id: vdoc._id, updates });
            }
        }
    }
    console.log(`Vendor Documents: ${stats.vendordocuments.updated} / ${stats.vendordocuments.found} updated.`);

    // Save migration audit log
    if (!isDryRun) {
        await fsp.mkdir(STORAGE_ROOT, { recursive: true });
        await fsp.writeFile(AUDIT_LOG_PATH, JSON.stringify({
            migratedAt: new Date().toISOString(),
            stats,
            uniqueUrlsMigrated: migratedUrlCache.size,
            auditLog,
        }, null, 2));
        console.log(`\nAudit log saved to: ${AUDIT_LOG_PATH}`);
    }

    console.log('\n====================================================');
    console.log('              MIGRATION SUMMARY                     ');
    console.log('====================================================');
    console.log(`Unique URLs Processed: ${migratedUrlCache.size}`);
    console.log('Updates by Collection:');
    for (const [col, s] of Object.entries(stats)) {
        console.log(`  ${col}: ${s.updated} / ${s.found} records updated`);
    }
    console.log(`Mode: ${isDryRun ? 'DRY RUN COMPLETE' : 'LIVE MIGRATION COMPLETE'}`);

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Migration script failed:', err);
    process.exit(1);
});
