/**
 * Quick Commerce — Phase 5 Delivery Location Migration
 *
 * Backfills the GeoJSON `location` field from the legacy `currentLocation`
 * `{lat, lng}` field, and builds the 2dsphere index rider assignment needs.
 *
 * This is the ONE breaking shape change in the Quick Commerce module, and it is
 * handled as a dual-write migration rather than a cutover:
 *
 *   1. `location` was ADDED alongside `currentLocation` — never in place.
 *   2. `PATCH /api/delivery/location` writes BOTH on every ping (already live).
 *   3. This script backfills historical rows.            ← you are here
 *   4. Reads switch to `location` (assignment already uses it; nothing else does).
 *   5. `currentLocation` is dropped only after a full release cycle.
 *
 * Rollback stays trivial at every step because the legacy field is never
 * stopped or mutated.
 *
 * ⚠️  AXIS ORDER: GeoJSON is [longitude, latitude] — the reverse of how the
 *     legacy field stores it, and the single most common source of silent geo
 *     bugs. Coordinates that fail bounds validation are skipped and reported
 *     rather than written, because a swapped pair is usually still "valid".
 *
 * Safe to run multiple times.
 *
 * Usage: node backend/scripts/migrateDeliveryBoyLocation.js
 *        node backend/scripts/migrateDeliveryBoyLocation.js --dry-run
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import DeliveryBoy from '../src/models/DeliveryBoy.model.js';
import { LATITUDE_BOUNDS, LONGITUDE_BOUNDS } from '../src/constants/quickCommerce.js';
import { EXPERIENCES } from '../src/constants/experiences.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const DRY_RUN = process.argv.includes('--dry-run');

const isValidCoordinate = (lat, lng) =>
    Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= LATITUDE_BOUNDS.min && lat <= LATITUDE_BOUNDS.max
    && lng >= LONGITUDE_BOUNDS.min && lng <= LONGITUDE_BOUNDS.max
    // A rider is never legitimately at exactly [0,0] (the Gulf of Guinea);
    // that value is what an uninitialised record looks like.
    && !(lat === 0 && lng === 0);

async function main() {
    if (!MONGO_URI) {
        console.error('❌ MONGO_URI not set in .env');
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log(`✅ Connected to MongoDB${DRY_RUN ? '  (DRY RUN — no writes)' : ''}`);

    // ── 1. Backfill experiences ───────────────────────────────────────────────
    // Existing riders serve the Marketplace only. Nobody is silently enrolled
    // into Quick Commerce — an admin opts each rider in.
    const experienceBackfill = DRY_RUN
        ? { modifiedCount: await DeliveryBoy.countDocuments({ experiences: { $exists: false } }) }
        : await DeliveryBoy.updateMany(
            { experiences: { $exists: false } },
            { $set: { experiences: [EXPERIENCES.MARKETPLACE] } }
        );
    console.log(`📦 ${DRY_RUN ? 'Would backfill' : 'Backfilled'} experiences on ${experienceBackfill.modifiedCount} rider(s).`);

    // ── 2. Normalise activeOrderId ────────────────────────────────────────────
    const activeOrderBackfill = DRY_RUN
        ? { modifiedCount: await DeliveryBoy.countDocuments({ activeOrderId: { $exists: false } }) }
        : await DeliveryBoy.updateMany(
            { activeOrderId: { $exists: false } },
            { $set: { activeOrderId: null } }
        );
    console.log(`📦 ${DRY_RUN ? 'Would set' : 'Set'} activeOrderId=null on ${activeOrderBackfill.modifiedCount} rider(s).`);

    // ── 3. Backfill GeoJSON location from the legacy field ────────────────────
    const riders = await DeliveryBoy.find({
        'currentLocation.lat': { $ne: null, $exists: true },
        'currentLocation.lng': { $ne: null, $exists: true },
        location: { $exists: false },
    })
        .select('_id name currentLocation updatedAt')
        .lean();

    console.log(`🔎 Found ${riders.length} rider(s) with a legacy location and no GeoJSON location.`);

    let migrated = 0;
    const skipped = [];

    for (const rider of riders) {
        const lat = Number(rider.currentLocation?.lat);
        const lng = Number(rider.currentLocation?.lng);

        if (!isValidCoordinate(lat, lng)) {
            skipped.push({ id: String(rider._id), name: rider.name, lat, lng });
            continue;
        }

        if (!DRY_RUN) {
            await DeliveryBoy.updateOne(
                { _id: rider._id },
                {
                    $set: {
                        // [lng, lat] — reversed relative to the source field.
                        location: { type: 'Point', coordinates: [lng, lat] },
                        // No historical timestamp exists, so fall back to the
                        // document's own updatedAt. Assignment treats stale pins
                        // as unassignable, which is the safe direction: a rider
                        // simply re-appears on their next ping.
                        lastLocationAt: rider.updatedAt || new Date(0),
                    },
                }
            );
        }
        migrated += 1;
    }

    console.log(`📍 ${DRY_RUN ? 'Would migrate' : 'Migrated'} ${migrated} rider location(s) to GeoJSON.`);

    if (skipped.length > 0) {
        console.log(`⚠️  Skipped ${skipped.length} rider(s) with out-of-range or placeholder coordinates:`);
        skipped.slice(0, 20).forEach((row) => {
            console.log(`     - ${row.name || row.id}: lat=${row.lat} lng=${row.lng}`);
        });
        if (skipped.length > 20) console.log(`     … and ${skipped.length - 20} more.`);
        console.log('     These riders will self-heal on their next location ping.');
    }

    // ── 4. Build the 2dsphere index ───────────────────────────────────────────
    if (DRY_RUN) {
        console.log('ℹ️  Skipping index build in dry-run mode.');
    } else {
        await DeliveryBoy.syncIndexes();
        const indexes = await DeliveryBoy.collection.indexes();
        const geoIndex = indexes.find((index) => index.key?.location === '2dsphere');
        console.log(
            geoIndex
                ? '✅ 2dsphere index on `location` is in place.'
                : '⚠️  2dsphere index on `location` NOT found — check the DeliveryBoy model.'
        );
    }

    console.log('\n✅ Migration complete. `currentLocation` is untouched and still dual-written.');
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('❌ Migration failed:', err);
    await mongoose.disconnect().catch(() => null);
    process.exit(1);
});
