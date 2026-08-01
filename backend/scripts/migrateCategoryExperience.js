/**
 * Quick Commerce — Phase 1 Category Migration
 *
 * Run ONCE per environment after deploying the Quick Commerce Phase 1 code.
 *
 * Does two things:
 *
 *   1. Backfills `experience: 'marketplace'` on existing categories. Not
 *      required for correctness (the schema default covers reads), but it makes
 *      the new `{ experience, parentId, isActive }` and `{ experience, slug }`
 *      indexes usable and keeps queries index-backed.
 *
 *   2. Drops the legacy single-field unique index on `slug`.
 *      THIS STEP IS REQUIRED. Mongoose creates new indexes but never drops
 *      removed ones, so `slug_1` survives the deploy and would keep enforcing
 *      global slug uniqueness — silently preventing Marketplace and Quick
 *      Commerce from each owning e.g. "beverages", which is the whole point of
 *      the compound `{ experience, slug }` index that replaces it.
 *
 * Safe to run multiple times.
 *
 * Usage: node backend/scripts/migrateCategoryExperience.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import Category from '../src/models/Category.model.js';
import { EXPERIENCES } from '../src/constants/experiences.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const LEGACY_SLUG_INDEX = 'slug_1';

async function main() {
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI not set in .env');
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // ── 1. Backfill experience ────────────────────────────────────────────────
    const backfill = await Category.updateMany(
        { experience: { $exists: false } },
        { $set: { experience: EXPERIENCES.MARKETPLACE } }
    );
    console.log(`📦 Backfilled ${backfill.modifiedCount} category document(s) as "${EXPERIENCES.MARKETPLACE}".`);

    // ── 2. Drop the legacy global-unique slug index ───────────────────────────
    const collection = Category.collection;
    const indexes = await collection.indexes();
    const legacyIndex = indexes.find((index) => index.name === LEGACY_SLUG_INDEX);

    if (!legacyIndex) {
        console.log(`ℹ️  Legacy index "${LEGACY_SLUG_INDEX}" not present — nothing to drop.`);
    } else if (!legacyIndex.unique) {
        console.log(`ℹ️  Index "${LEGACY_SLUG_INDEX}" exists but is not unique — leaving it alone.`);
    } else {
        await collection.dropIndex(LEGACY_SLUG_INDEX);
        console.log(`🗑️  Dropped legacy unique index "${LEGACY_SLUG_INDEX}".`);
    }

    // ── 3. Ensure the new compound index exists ───────────────────────────────
    await Category.syncIndexes();
    const finalIndexes = await collection.indexes();
    const compound = finalIndexes.find(
        (index) => index.key?.experience === 1 && index.key?.slug === 1
    );
    console.log(
        compound?.unique
            ? '✅ Compound unique index { experience, slug } is in place.'
            : '⚠️  Compound unique index { experience, slug } NOT found — check the Category model.'
    );

    console.log('\n🎉 Category experience migration complete.');
    await mongoose.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
});
