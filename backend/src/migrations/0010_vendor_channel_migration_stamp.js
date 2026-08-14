import Vendor from '../models/Vendor.model.js';
import { buildChannelsForLegacyVendor } from './0008_vendor_channels.js';

/**
 * Catch-up stamp for databases where 0008 ran under its original code.
 *
 * 0008 originally selected vendors with `$exists` checks on the channel
 * sub-documents. Once the Mongoose schema shipped, every saved vendor already
 * carried defaults (`status: 'disabled'`, `channelsRevision: 0`), so such a
 * vendor matched nothing and was silently skipped while `verify()` still
 * reported success. 0008 was corrected to select on an explicit
 * `channelMigrationVersion` marker instead.
 *
 * Migrations are append-only: 0008 is already recorded as applied on existing
 * databases, so the runner will never execute its corrected `up()` there and
 * the marker would never be written. This migration is that catch-up path.
 *
 * It is deliberately conservative:
 *
 *   STAMP ONLY  — a vendor that 0008 genuinely processed. Recognised by either
 *                 holding a non-disabled channel, or having
 *                 `channelsRevision >= 1` (which the original 0008 always
 *                 wrote, including for rejected accounts whose channels
 *                 correctly ended up all-disabled). No data is changed.
 *
 *   BACKFILL    — a vendor still at the schema default (`channelsRevision: 0`
 *                 AND every channel `disabled` AND no channel ever reviewed).
 *                 Only these were actually missed. They receive exactly the
 *                 backfill 0008 would have given them, derived from their
 *                 historical `sellingChannels` / `vendorType`.
 *
 * On a fresh database 0008 stamps every vendor, so this migration finds
 * nothing to do. Re-running it is a no-op.
 */

const MIGRATION_VERSION = 1;
const CHANNEL_PATHS = ['retail', 'wholesale', 'quickCommerce'];

/**
 * Pure classifier. Exported for tests.
 * @returns {'stamp'|'backfill'}
 */
export const classifyVendorForStamp = (vendor) => {
    const holdsRealChannel = CHANNEL_PATHS.some((path) => {
        const status = vendor?.channels?.[path]?.status;
        return status && status !== 'disabled';
    });
    if (holdsRealChannel) return 'stamp';

    // The original 0008 always wrote channelsRevision: 1. A vendor still at 0
    // was never touched by it.
    if (Number(vendor?.channelsRevision) >= 1) return 'stamp';

    // An admin decision that disabled everything must never be undone by a
    // backfill. Any review timestamp means a human acted on this vendor.
    const wasReviewed = CHANNEL_PATHS.some((path) => (
        vendor?.channels?.[path]?.reviewedAt || vendor?.channels?.[path]?.reviewedBy
    ));
    if (wasReviewed) return 'stamp';

    return 'backfill';
};

export default {
    id: '0010_vendor_channel_migration_stamp',
    description: 'Stamp channelMigrationVersion and backfill vendors 0008 originally skipped',
    async up() {
        const cursor = Vendor.collection.find(
            { channelMigrationVersion: { $ne: MIGRATION_VERSION } },
            {
                projection: {
                    vendorType: 1, sellingChannels: 1, status: 1, isActive: 1,
                    suspensionReason: 1, createdAt: 1, channels: 1, channelsRevision: 1,
                },
            }
        );

        let stamped = 0;
        let backfilled = 0;
        let invalidType = 0;
        const backfilledIds = [];
        let operations = [];
        const now = new Date();

        const flush = async () => {
            if (!operations.length) return;
            await Vendor.collection.bulkWrite(operations, { ordered: false });
            operations = [];
        };

        for await (const vendor of cursor) {
            const set = { channelMigrationVersion: MIGRATION_VERSION };

            if (classifyVendorForStamp(vendor) === 'backfill') {
                const { canonicalType, channels } = buildChannelsForLegacyVendor(vendor, now);
                if (canonicalType !== vendor.vendorType) {
                    invalidType += 1;
                    // Non-destructive: keep the original classification.
                    set.legacyVendorTypeBeforeChannelMigration = vendor.vendorType ?? null;
                    set.vendorType = canonicalType;
                }
                set.channels = channels;
                set.sellingChannels = {
                    retail: { enabled: channels.retail.status === 'active' },
                    wholesale: { enabled: channels.wholesale.status === 'active' },
                    quickCommerce: { enabled: channels.quickCommerce.status === 'active' },
                };
                set.channelsRevision = Math.max(Number(vendor.channelsRevision) || 0, 1);
                backfilled += 1;
                backfilledIds.push(String(vendor._id));
            } else {
                stamped += 1;
            }

            operations.push({
                updateOne: {
                    filter: { _id: vendor._id, channelMigrationVersion: { $ne: MIGRATION_VERSION } },
                    update: { $set: set },
                },
            });
            if (operations.length >= 500) await flush();
        }
        await flush();

        return {
            stampedOnly: stamped,
            backfilled,
            invalidTypeDefaultedToRetail: invalidType,
            // Recorded in the ledger so the grant is auditable.
            backfilledVendorIds: backfilledIds.slice(0, 50),
        };
    },
    async verify() {
        const unmigrated = await Vendor.countDocuments({
            channelMigrationVersion: { $ne: MIGRATION_VERSION },
        });
        const stranded = await Vendor.countDocuments({
            status: 'approved',
            isActive: { $ne: false },
            isVerified: true,
            'channels.retail.status': 'disabled',
            'channels.wholesale.status': 'disabled',
            'channels.quickCommerce.status': 'disabled',
        });
        return {
            ok: unmigrated === 0 && stranded === 0,
            detail: `unstamped=${unmigrated}; strandedApproved=${stranded}`,
        };
    },
};
