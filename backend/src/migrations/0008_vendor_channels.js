import Vendor from '../models/Vendor.model.js';
import { vendorChannelPath } from '../constants/vendorChannels.js';

const disabled = () => ({ status: 'disabled', reason: '', requestedBy: 'migration' });

const legacyChannelEnabled = (vendor, channel) => {
    const path = vendorChannelPath(channel);
    return vendor?.sellingChannels?.[path]?.enabled === true;
};

const stateFor = (vendor, channel, now, hasExplicitLegacyChannels) => {
    // `sellingChannels` was the only representation capable of recording a
    // historical multi-select vendor. Prefer it whenever it contains an
    // explicit selection. Older single-channel records fall back to the
    // legacy business classification.
    const enabled = hasExplicitLegacyChannels
        ? legacyChannelEnabled(vendor, channel)
        : channel === vendor.vendorType;
    if (!enabled) return disabled();
    if (vendor.isActive === false) return { ...disabled(), disabledAt: now, reason: 'Account deactivated before channel migration' };
    if (vendor.status === 'approved' || vendor.status === 'suspended') {
        return { status: 'active', activatedAt: now, reviewedAt: now, requestedBy: 'migration', reason: '' };
    }
    if (vendor.status === 'rejected') {
        return { status: 'rejected', rejectedAt: now, reviewedAt: now, requestedBy: 'migration', reason: vendor.suspensionReason || '' };
    }
    return { status: 'requested', requestedAt: vendor.createdAt || now, requestedBy: 'migration', reason: '' };
};

export const buildChannelsForLegacyVendor = (vendor, now = new Date()) => {
    const canonicalType = vendorChannelPath(vendor?.vendorType) ? vendor.vendorType : 'retail';
    const hasExplicitLegacyChannels = ['retail', 'wholesale', 'quickCommerce']
        .some((path) => vendor?.sellingChannels?.[path]?.enabled === true);
    const normalized = { ...vendor, vendorType: canonicalType };
    return {
        canonicalType,
        channels: {
            retail: stateFor(normalized, 'retail', now, hasExplicitLegacyChannels),
            wholesale: stateFor(normalized, 'wholesale', now, hasExplicitLegacyChannels),
            quickCommerce: stateFor(normalized, 'quick_commerce', now, hasExplicitLegacyChannels),
        },
    };
};

/**
 * Selector for vendors this migration still has to process.
 *
 * It must be SEMANTIC, not structural. The original selector tested only
 * `$exists` on `channels.*.status` and `channelsRevision` — but once the
 * Mongoose schema is deployed, every saved vendor already carries default
 * channel sub-documents (`status: 'disabled'`) and `channelsRevision: 0`.
 * Such a vendor matched none of the `$exists` conditions, was silently
 * skipped, and `verify()` then reported success because the fields existed.
 * Four approved vendors in the production dataset were left in exactly that
 * state, created hours before the migration ran.
 *
 * `channelMigrationVersion` is the explicit marker: a vendor is migrated when
 * and only when this migration stamped it.
 */
const MIGRATION_VERSION = 1;

const pendingSelector = () => ({
    channelMigrationVersion: { $ne: MIGRATION_VERSION },
});

export default {
    id: '0008_vendor_channels',
    description: 'Backfill canonical per-channel vendor authorization states',
    async up() {
        const cursor = Vendor.collection.find(
            pendingSelector(),
            { projection: { vendorType: 1, sellingChannels: 1, status: 1, isActive: 1, suspensionReason: 1, createdAt: 1, channels: 1, channelsRevision: 1 } }
        );
        let migrated = 0;
        let invalidType = 0;
        let preservedExistingChannels = 0;
        let operations = [];
        const now = new Date();

        const flush = async () => {
            if (!operations.length) return;
            const result = await Vendor.collection.bulkWrite(operations, { ordered: false });
            migrated += result.modifiedCount;
            operations = [];
        };

        for await (const vendor of cursor) {
            // A vendor may already hold real channel decisions made through the
            // admin API after the schema shipped. Never overwrite those: only
            // vendors whose channels are still entirely at the schema default
            // get a backfill.
            const hasRealChannelState = ['retail', 'wholesale', 'quickCommerce']
                .some((path) => {
                    const status = vendor?.channels?.[path]?.status;
                    return status && status !== 'disabled';
                });

            const set = { channelMigrationVersion: MIGRATION_VERSION };

            if (hasRealChannelState) {
                preservedExistingChannels += 1;
            } else {
                const { canonicalType, channels } = buildChannelsForLegacyVendor(vendor, now);
                if (canonicalType !== vendor.vendorType) {
                    invalidType += 1;
                    // NON-DESTRUCTIVE: keep the original classification so the
                    // change is auditable and recoverable. The previous version
                    // overwrote `vendorType` outright for 23 vendors with no
                    // record of what it had been.
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
            }

            operations.push({
                updateOne: {
                    filter: { _id: vendor._id, ...pendingSelector() },
                    update: { $set: set },
                },
            });
            if (operations.length >= 500) await flush();
        }
        await flush();

        // Additive only: create schema indexes without dropping any index that
        // an older application version may still require during rollback.
        await Vendor.createIndexes();
        return {
            migrated,
            invalidTypeDefaultedToRetail: invalidType,
            preservedExistingChannels,
        };
    },
    async verify() {
        const allowed = ['requested', 'active', 'paused', 'rejected', 'disabled'];

        const unmigrated = await Vendor.countDocuments(pendingSelector());
        const missing = await Vendor.countDocuments({ $or: [
            { channelsRevision: { $exists: false } },
            { 'channels.retail.status': { $exists: false } },
            { 'channels.wholesale.status': { $exists: false } },
            { 'channels.quickCommerce.status': { $exists: false } },
        ] });
        const invalid = await Vendor.countDocuments({ $or: [
            { 'channels.retail.status': { $nin: allowed } },
            { 'channels.wholesale.status': { $nin: allowed } },
            { 'channels.quickCommerce.status': { $nin: allowed } },
        ] });

        // Semantic completeness: an approved, active, verified vendor with no
        // channel in any non-disabled state can log in and then be refused on
        // every workspace-scoped route. Structural checks cannot see this,
        // which is why the original verify() passed while four such vendors
        // existed.
        const strandedApprovedVendors = await Vendor.countDocuments({
            status: 'approved',
            isActive: { $ne: false },
            isVerified: true,
            'channels.retail.status': 'disabled',
            'channels.wholesale.status': 'disabled',
            'channels.quickCommerce.status': 'disabled',
        });

        return {
            ok: unmigrated === 0 && missing === 0 && invalid === 0 && strandedApprovedVendors === 0,
            detail: `unmigrated=${unmigrated}; missing=${missing}; invalid=${invalid}; strandedApproved=${strandedApprovedVendors}`,
        };
    },
};
