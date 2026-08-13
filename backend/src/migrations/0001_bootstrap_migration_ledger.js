/**
 * 0001 — Bootstrap the migration ledger.
 *
 * Records the pre-existing ad-hoc scripts in `backend/scripts/` as `retired`
 * rather than `applied`. The distinction matters: marking them "applied" would
 * assert they ran against this database, which nobody can verify. "Retired"
 * records that they exist, are no longer part of the managed sequence, and that
 * their effect must be confirmed by inspection rather than assumed.
 *
 * Idempotent: re-running upserts the same rows and changes nothing.
 */

import SchemaMigration from '../models/SchemaMigration.model.js';

/**
 * Historical scripts that predate the ledger. Listed so the record is explicit
 * rather than implied by their absence.
 */
const LEGACY_SCRIPTS = [
    'legacy_backfillRiderWallets',
    'legacy_backfillVendorSellingChannels',
    'legacy_grandfatherVendors',
    'legacy_migrateCategoryExperience',
    'legacy_migrateDeliveryBoyLocation',
    'legacy_migrateVendorType',
    'legacy_seedCategories',
];

export default {
    id: '0001_bootstrap_migration_ledger',
    description: 'Create the migration ledger and record pre-existing ad-hoc scripts as retired',

    async up() {
        // Ensure indexes exist before anything else writes to the collection.
        await SchemaMigration.init();

        let recorded = 0;
        for (const migrationId of LEGACY_SCRIPTS) {
            const res = await SchemaMigration.updateOne(
                { migrationId },
                {
                    $setOnInsert: {
                        migrationId,
                        description:
                            'Pre-ledger ad-hoc script in backend/scripts/. Effect NOT verified — confirm by inspection before relying on it.',
                        status: 'retired',
                        appliedAt: null,
                        appliedBy: 'bootstrap',
                    },
                },
                { upsert: true }
            );
            if (res.upsertedCount > 0) recorded += 1;
        }

        return { legacyScriptsRecorded: recorded, legacyScriptsTotal: LEGACY_SCRIPTS.length };
    },

    async verify() {
        const count = await SchemaMigration.countDocuments({
            migrationId: { $in: LEGACY_SCRIPTS },
        });
        return {
            ok: count === LEGACY_SCRIPTS.length,
            detail: `${count}/${LEGACY_SCRIPTS.length} legacy scripts recorded`,
        };
    },
};
