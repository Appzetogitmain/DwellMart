/**
 * 0002 — Record how existing subscriptions were activated.
 *
 * Every subscription created before this release was activated by
 * `activateInternalSubscription`, which wrote `status: 'active'` and a
 * `Payment{status:'paid'}` with no payment verification. Those records cannot
 * be distinguished retroactively into "genuinely paid" and "activated for
 * free" — so they are marked `legacy_internal` rather than being asserted as
 * either.
 *
 * Also produces the exposure inventory: priced plans currently active on a
 * legacy activation. That list is a business escalation, not an engineering
 * artefact — this migration reports it and changes nothing about it.
 *
 * Idempotent: only fills `activationSource` where it is absent.
 */

import VendorSubscription from '../models/VendorSubscription.model.js';
import SubscriptionPlan from '../models/SubscriptionPlan.model.js';

export default {
    id: '0002_subscription_activation_source',
    description: 'Backfill activationSource=legacy_internal and report priced legacy activations',

    async up() {
        const result = await VendorSubscription.updateMany(
            { activationSource: { $exists: false } },
            { $set: { activationSource: 'legacy_internal' } }
        );

        // ── Exposure inventory ───────────────────────────────────────────────
        const pricedPlans = await SubscriptionPlan.find({
            $or: [{ price_inr: { $gt: 0 } }, { price_usd: { $gt: 0 } }],
        })
            .select('_id name price_inr price_usd')
            .lean();

        const pricedPlanIds = pricedPlans.map((p) => p._id);
        const planById = new Map(pricedPlans.map((p) => [String(p._id), p]));

        const exposed = await VendorSubscription.find({
            activationSource: 'legacy_internal',
            status: 'active',
            plan: { $in: pricedPlanIds },
        })
            .select('vendor plan current_period_end createdAt')
            .lean();

        if (exposed.length > 0) {
            console.warn(
                `\n[migrate 0002] ⚠️  ${exposed.length} active subscription(s) on PRICED plans were activated `
                + 'without verified payment. Review required — this migration changes none of them.'
            );
            for (const sub of exposed.slice(0, 50)) {
                const plan = planById.get(String(sub.plan));
                console.warn(
                    `  vendor=${sub.vendor} plan="${plan?.name}" `
                    + `inr=${plan?.price_inr} usd=${plan?.price_usd} activated=${sub.createdAt?.toISOString?.() || 'unknown'}`
                );
            }
            if (exposed.length > 50) console.warn(`  ...and ${exposed.length - 50} more`);
        }

        return {
            backfilled: result.modifiedCount,
            pricedLegacyActivations: exposed.length,
        };
    },

    async verify() {
        const missing = await VendorSubscription.countDocuments({
            activationSource: { $exists: false },
        });
        return {
            ok: missing === 0,
            detail: `${missing} subscription(s) still missing activationSource`,
        };
    },
};
