/**
 * Backfill Script for Vendor Selling Channels
 *
 * Explicitly persists sellingChannels.retail.enabled=true / sellingChannels.wholesale.enabled=false
 * onto every existing vendor document, so admin analytics can $match on these fields directly
 * instead of relying on Mongoose schema defaults at read time.
 *
 * Safe to run multiple times (only touches vendors missing the field).
 *
 * Usage: node backend/scripts/backfillVendorSellingChannels.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import Vendor from '../src/models/Vendor.model.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI not set in .env');
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const result = await Vendor.updateMany(
        { 'sellingChannels.retail.enabled': { $exists: false } },
        {
            $set: {
                'sellingChannels.retail.enabled': true,
                'sellingChannels.wholesale.enabled': false,
            },
        }
    );

    console.log(`🎉 Done! Backfilled ${result.modifiedCount} vendor(s) as Retail Only.`);
    await mongoose.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
});
