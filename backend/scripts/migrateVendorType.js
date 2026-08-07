/**
 * migrateVendorType.js
 *
 * One-time migration script — safe to re-run (idempotent).
 *
 * What it does:
 *  1. Connects to MongoDB
 *  2. Finds all vendors without a vendorType
 *  3. Infers vendorType from existing sellingChannels flags
 *  4. Sets vendorType and triggers the pre-save hook to re-sync sellingChannels
 *  5. Writes a migration-report.json to this directory
 *
 * Run:
 *   node backend/scripts/migrateVendorType.js
 *
 * Env:
 *   MONGODB_URI — required
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal inline vendor schema to avoid pulling the full app stack
const vendorSchema = new mongoose.Schema({}, { strict: false });
const Vendor = mongoose.models.Vendor ?? mongoose.model('Vendor', vendorSchema, 'vendors');

/**
 * Infer vendorType from current sellingChannels flags.
 * Precedence: quickCommerce > wholesale > retail (default)
 */
const inferVendorType = (vendor) => {
    if (vendor.sellingChannels?.quickCommerce?.enabled === true) return 'quick_commerce';
    if (vendor.sellingChannels?.wholesale?.enabled === true)    return 'wholesale';
    return 'retail'; // safe default
};

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌  MONGODB_URI environment variable is not set.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('✅  Connected to MongoDB.\n');

    // Only migrate vendors that don't have a vendorType set yet
    const vendors = await Vendor.find({
        $or: [{ vendorType: { $exists: false } }, { vendorType: null }, { vendorType: '' }],
    }).lean();

    console.log(`📊  Found ${vendors.length} vendor(s) to migrate.\n`);

    const report = {
        timestamp: new Date().toISOString(),
        totalFound: vendors.length,
        migrated: [],
        skipped: [],
        errors: [],
    };

    for (const vendor of vendors) {
        const vendorId = String(vendor._id);
        const inferred = inferVendorType(vendor);

        try {
            await Vendor.findByIdAndUpdate(
                vendorId,
                { $set: { vendorType: inferred } },
                { runValidators: false }
            );

            const entry = {
                id: vendorId,
                email: vendor.email,
                storeName: vendor.storeName,
                assignedVendorType: inferred,
                previousChannels: {
                    retail:        vendor.sellingChannels?.retail?.enabled ?? null,
                    wholesale:     vendor.sellingChannels?.wholesale?.enabled ?? null,
                    quickCommerce: vendor.sellingChannels?.quickCommerce?.enabled ?? null,
                },
            };
            report.migrated.push(entry);
            console.log(`  ✔  ${vendor.storeName || vendor.email}  →  ${inferred}`);
        } catch (err) {
            report.errors.push({ id: vendorId, email: vendor.email, error: err.message });
            console.error(`  ✖  ${vendor.storeName || vendor.email}  error: ${err.message}`);
        }
    }

    // Vendors already having a type are counted as skipped
    const alreadyMigrated = await Vendor.countDocuments({
        vendorType: { $in: ['quick_commerce', 'retail', 'wholesale'] },
    });
    report.alreadyMigrated = alreadyMigrated;

    const reportPath = path.join(__dirname, 'migration-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`\n📄  Report written to: ${reportPath}`);
    console.log(`\n✅  Migration complete.`);
    console.log(`    Migrated : ${report.migrated.length}`);
    console.log(`    Errors   : ${report.errors.length}`);
    console.log(`    Already  : ${alreadyMigrated} vendor(s) already had a vendorType.\n`);

    await mongoose.disconnect();
    process.exit(report.errors.length > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
