/**
 * 0016 — Backfill vendor trial consumption marker.
 *
 * Scans `VendorSubscription` for any vendor that has activated a zero-price /
 * trial subscription (activationSource === 'zero_price_plan' or association with
 * a ₹0/$0 plan) and sets `hasUsedTrial = true` on their Vendor document.
 *
 * Ensures all existing and future vendors have a defined `hasUsedTrial` boolean,
 * permanently preventing vendors with expired trials from claiming free trials again.
 *
 * Idempotent.
 */

import Vendor from '../models/Vendor.model.js';
import VendorSubscription from '../models/VendorSubscription.model.js';
import SubscriptionPlan from '../models/SubscriptionPlan.model.js';

export default {
    id: '0016_backfill_vendor_trial_used',
    description: 'Backfill hasUsedTrial=true for vendors who previously activated a free trial',

    async up() {
        // 1. Identify all zero-price plans
        const freePlans = await SubscriptionPlan.find({
            price_inr: 0,
            price_usd: 0,
        }).select('_id').lean();

        const freePlanIds = freePlans.map((p) => p._id);

        // 2. Find all subscriptions activated via zero_price_plan or linked to free plans
        const trialSubscriptions = await VendorSubscription.find({
            $or: [
                { activationSource: 'zero_price_plan' },
                { plan: { $in: freePlanIds } },
            ],
        }).select('vendor createdAt').lean();

        let markedCount = 0;
        for (const sub of trialSubscriptions) {
            if (!sub.vendor) continue;
            const res = await Vendor.updateOne(
                { _id: sub.vendor, hasUsedTrial: { $ne: true } },
                {
                    $set: {
                        hasUsedTrial: true,
                        trialUsedAt: sub.createdAt || new Date(),
                    },
                }
            );
            if (res.modifiedCount > 0) {
                markedCount += res.modifiedCount;
            }
        }

        // 3. Ensure any remaining vendors have hasUsedTrial: false rather than undefined
        const defaultedResult = await Vendor.updateMany(
            { hasUsedTrial: { $exists: false } },
            { $set: { hasUsedTrial: false, trialUsedAt: null } }
        );

        return {
            trialVendorsMarked: markedCount,
            defaultedVendors: defaultedResult.modifiedCount,
        };
    },

    async verify() {
        const missing = await Vendor.countDocuments({
            hasUsedTrial: { $exists: false },
        });
        return {
            ok: missing === 0,
            detail: `${missing} vendor(s) still missing hasUsedTrial`,
        };
    },
};
