import mongoose from 'mongoose';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

process.env.STORAGE_BASE_URL = 'https://dwellmart.in';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
    STORAGE_ROOT,
    STORAGE_BASE_URL,
    STORAGE_TYPES,
    initStorageDirectories,
} from '../src/config/storage.js';
import {
    processAndSaveImage,
    processAndSaveDocument,
} from '../src/utils/sharpProcessor.js';

const UPLOADS_DIR = path.resolve(__dirname, '../uploads/vendor_documents');
const isDryRun = process.argv.includes('--dry-run');

console.log('====================================================');
console.log('     MIGRATE VENDOR DOCUMENTS TO VPS STORAGE        ');
console.log('====================================================');
console.log(`Execution Mode: ${isDryRun ? 'DRY RUN (Preview)' : 'LIVE MIGRATION'}`);
console.log(`Storage Root: ${STORAGE_ROOT}`);
console.log(`Storage Base URL: ${STORAGE_BASE_URL}`);
console.log(`Uploads Cache: ${UPLOADS_DIR}`);

initStorageDirectories();

async function migrate() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    // 1. Find all vendors with Cloudinary or localhost:5000 documents
    const vendors = await db.collection('vendors').find({
        $or: [
            { 'documents.msme': { $regex: /cloudinary\.com|localhost:5000/ } },
            { 'documents.aadhar': { $regex: /cloudinary\.com|localhost:5000/ } },
            { 'documents.aadhar.url': { $regex: /cloudinary\.com|localhost:5000/ } },
            { 'documents.uin': { $regex: /cloudinary\.com|localhost:5000/ } },
            { 'documents.enrolmentId': { $regex: /cloudinary\.com|localhost:5000/ } },
            { 'documents.tradeLicense.url': { $regex: /cloudinary\.com|localhost:5000/ } },
            { 'documents.gst': { $regex: /cloudinary\.com|localhost:5000/ } },
            { 'documents.pan': { $regex: /cloudinary\.com|localhost:5000/ } },
            { 'documents.pan.url': { $regex: /cloudinary\.com|localhost:5000/ } },
            { 'documents.businessLicense': { $regex: /cloudinary\.com|localhost:5000/ } },
        ]
    }).toArray();

    console.log(`\nFound ${vendors.length} vendors requiring document URL migration/normalization.`);

    let updatedVendorsCount = 0;
    const processedFiles = [];

    for (const vendor of vendors) {
        const updates = {};
        const docs = vendor.documents || {};

        for (const [key, val] of Object.entries(docs)) {
            let currentUrl = typeof val === 'string' ? val : val?.url;
            if (!currentUrl || typeof currentUrl !== 'string') continue;

            // Handle localhost:5000 normalization
            if (currentUrl.includes('localhost:5000')) {
                const normalized = currentUrl.replace(/https?:\/\/localhost:5000/, 'https://dwellmart.in');
                if (typeof val === 'string') {
                    updates[`documents.${key}`] = normalized;
                } else {
                    updates[`documents.${key}.url`] = normalized;
                }
                continue;
            }

            // Handle Cloudinary migration
            if (currentUrl.includes('cloudinary.com')) {
                const baseName = path.basename(currentUrl.split('?')[0]);
                const localFilePath = path.join(UPLOADS_DIR, baseName);

                if (!fs.existsSync(localFilePath)) {
                    console.warn(`[WARNING] Missing local file for ${vendor.name} (${key}): ${baseName}`);
                    continue;
                }

                if (isDryRun) {
                    console.log(`[DRY RUN] Would migrate ${vendor.name} (${key}): ${baseName} -> VPS storage`);
                    updates[`documents.${key}`] = `https://dwellmart.in/images/documents/2026/09/preview-${baseName}`;
                    continue;
                }

                try {
                    const buffer = await fsp.readFile(localFilePath);
                    const ext = path.extname(baseName).toLowerCase();
                    const isDoc = ext === '.pdf' || ext === '.doc' || ext === '.docx';

                    let result;
                    if (isDoc && ext !== '.jpg' && ext !== '.png' && ext !== '.webp') {
                        result = await processAndSaveDocument({
                            buffer,
                            originalname: baseName,
                            mimetype: ext === '.pdf' ? 'application/pdf' : 'application/octet-stream',
                        });
                    } else {
                        result = await processAndSaveImage({
                            buffer,
                            entityType: 'documents',
                            originalname: baseName,
                        });
                    }

                    // Force https://dwellmart.in as origin
                    const finalUrl = result.url.replace(/https?:\/\/localhost:5000/, 'https://dwellmart.in');
                    processedFiles.push(result.absolutePath);

                    if (typeof val === 'string') {
                        updates[`documents.${key}`] = finalUrl;
                    } else {
                        updates[`documents.${key}.url`] = finalUrl;
                        updates[`documents.${key}.fileType`] = isDoc ? 'pdf' : 'image';
                    }
                    console.log(`[MIGRATED] ${vendor.name} (${key}): ${baseName} -> ${finalUrl}`);
                } catch (err) {
                    console.error(`[ERROR] Failed migrating ${baseName} for ${vendor.name}:`, err.message);
                }
            }
        }

        if (Object.keys(updates).length > 0) {
            if (!isDryRun) {
                await db.collection('vendors').updateOne({ _id: vendor._id }, { $set: updates });
            }
            updatedVendorsCount++;
        }
    }

    console.log(`\n====================================================`);
    console.log(`Migration Complete:`);
    console.log(`Vendors Updated: ${updatedVendorsCount} / ${vendors.length}`);
    console.log(`New Files Processed: ${processedFiles.length}`);
    console.log(`====================================================`);

    await mongoose.disconnect();
}

migrate().catch(console.error);
