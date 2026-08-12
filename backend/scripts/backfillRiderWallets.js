/**
 * Backfill rider wallets.
 *
 * Run once after deploying the rider earnings wallet:
 *   node scripts/backfillRiderWallets.js            # dry run, reports only
 *   node scripts/backfillRiderWallets.js --apply    # writes
 *
 * What it does, and deliberately does NOT do:
 *
 *   • Creates a zero-balance `RiderWallet` for every existing delivery partner,
 *     so no rider hits a missing-wallet path on their first request. Safe and
 *     idempotent — an existing wallet is left untouched.
 *
 *   • Does NOT retroactively credit past deliveries. Riders have already
 *     completed deliveries under no defined rate card, so what those were worth
 *     is a commercial decision, not a technical one. Backfilling silently would
 *     invent a liability nobody approved. Pass `--seed-rate-card` to create a
 *     starting global card, then use the admin adjustment endpoint to credit
 *     historical work with a reason on each entry.
 *
 *   • Rebuilds projections from the ledger for any wallet that already has
 *     transactions, so a partially-migrated environment self-corrects.
 *
 * Backward compatibility: no existing collection is modified. `DeliveryBoy`
 * gains `payoutDetails` by schema default only — untouched rider documents keep
 * working because every read path treats an absent destination as "not set up".
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import DeliveryBoy from '../src/models/DeliveryBoy.model.js';
import RiderWallet from '../src/models/RiderWallet.model.js';
import RiderWalletTransaction from '../src/models/RiderWalletTransaction.model.js';
import RiderRateCard from '../src/models/RiderRateCard.model.js';
import { rebuildWallet } from '../src/services/wallet/riderWallet.service.js';

const APPLY = process.argv.includes('--apply');
const SEED_RATE_CARD = process.argv.includes('--seed-rate-card');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
}

const run = async () => {
    await mongoose.connect(MONGO_URI);
    console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

    const riders = await DeliveryBoy.find({}).select('_id name applicationStatus').lean();
    const existingWallets = await RiderWallet.find({}).select('deliveryBoyId').lean();
    const haveWallet = new Set(existingWallets.map((w) => String(w.deliveryBoyId)));

    const missing = riders.filter((r) => !haveWallet.has(String(r._id)));

    console.log(`Delivery partners:     ${riders.length}`);
    console.log(`Wallets already exist: ${haveWallet.size}`);
    console.log(`Wallets to create:     ${missing.length}\n`);

    if (APPLY && missing.length > 0) {
        // insertMany with ordered:false so one duplicate cannot abort the batch;
        // the unique index on deliveryBoyId makes re-runs harmless.
        const docs = missing.map((r) => ({ deliveryBoyId: r._id, currency: 'INR' }));
        try {
            await RiderWallet.insertMany(docs, { ordered: false });
            console.log(`Created ${docs.length} wallet(s).`);
        } catch (err) {
            const inserted = err?.result?.nInserted ?? 0;
            console.log(`Created ${inserted} wallet(s); ${docs.length - inserted} already existed.`);
        }
    }

    // Rebuild any wallet that already carries ledger history, so a re-run after
    // a partial migration converges rather than leaving drift behind.
    const ridersWithLedger = await RiderWalletTransaction.distinct('deliveryBoyId');
    console.log(`\nWallets with ledger history: ${ridersWithLedger.length}`);

    if (APPLY && ridersWithLedger.length > 0) {
        let drifted = 0;
        for (const riderId of ridersWithLedger) {
            try {
                const result = await rebuildWallet(riderId);
                if (result.hadDrift) {
                    drifted += 1;
                    console.log(`  drift corrected for ${riderId}:`, result.drift);
                }
            } catch (err) {
                console.error(`  rebuild failed for ${riderId}: ${err.message}`);
            }
        }
        console.log(`Rebuilt ${ridersWithLedger.length} wallet(s); ${drifted} had drift.`);
    }

    // Optional starter rate card. Without at least one active card no earning
    // will accrue — the earnings engine refuses to invent a rate — so this is
    // the one piece of configuration the system cannot start without.
    const activeCards = await RiderRateCard.countDocuments({ isActive: true });
    console.log(`\nActive rate cards: ${activeCards}`);

    if (activeCards === 0) {
        if (SEED_RATE_CARD && APPLY) {
            const card = await RiderRateCard.create({
                name: 'Default global rate card',
                scope: 'global',
                baseFarePerDelivery: 25,
                perKmRate: 5,
                freeDistanceKm: 2,
                minimumFare: 25,
                codHandlingFee: 5,
                effectiveFrom: new Date(),
                isActive: true,
                notes: 'Seeded by backfillRiderWallets.js. Review and supersede with approved commercial rates before going live.',
            });
            console.log(`Seeded starter rate card ${card._id}. REVIEW THESE RATES before launch.`);
        } else {
            console.log(
                'WARNING: no active rate card. Delivery earnings will NOT accrue until one is\n'
                + '         created in Admin → Delivery → Rider Payouts, or by re-running this\n'
                + '         script with --seed-rate-card --apply.'
            );
        }
    }

    if (!APPLY) {
        console.log('\nDry run complete. Re-run with --apply to write.');
    }

    await mongoose.disconnect();
    process.exit(0);
};

run().catch(async (err) => {
    console.error('Backfill failed:', err);
    await mongoose.disconnect().catch(() => null);
    process.exit(1);
});
