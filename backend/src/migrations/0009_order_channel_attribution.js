import Order from '../models/Order.model.js';

/**
 * Reconcile order channel attribution.
 *
 * `fulfillmentType` (written by the OrderSplitterEngine) and `orderType` (an
 * older field defaulting to 'retail') were never reconciled. Measured on the
 * production dataset before this migration:
 *
 *   orderType=retail    fulfillmentType=quick_commerce    54
 *   orderType=retail    fulfillmentType=wholesale         31
 *   orderType=retail    fulfillmentType=null/missing      14
 *   (both missing)                                        32
 *
 * The vendor order list matched on either field while the status update gated
 * on `orderType` alone, so those 85 orders were listed in one workspace and
 * refused in it — or, for Quick Commerce, actionable from Retail under the
 * retail state machine.
 *
 * This migration makes `orderType` agree with `fulfillmentType` wherever
 * fulfilment is known, and backfills `fulfillmentType` from `orderType` where
 * it is not. It is deliberately NON-DESTRUCTIVE: the pre-migration value is
 * preserved in `channelAttributionBackfill` so the change is auditable and
 * reversible.
 */

const CHANNELS = ['retail', 'wholesale', 'quick_commerce'];

/** Pure: what this order's two fields should become. Exported for tests. */
export const reconcileOrderChannel = (order) => {
    const fulfillment = String(order?.fulfillmentType ?? '').trim().toLowerCase();
    const legacyRaw = String(order?.orderType ?? '').trim().toLowerCase();
    const legacy = legacyRaw === 'marketplace' ? 'retail' : legacyRaw;

    // 'mixed' is a legitimate multi-channel aggregate on the parent order and
    // must not be rewritten to a single channel.
    if (legacy === 'mixed') return null;

    if (CHANNELS.includes(fulfillment)) {
        if (legacy === fulfillment) return null;
        return { orderType: fulfillment, fulfillmentType: fulfillment, source: 'fulfillmentType' };
    }

    if (CHANNELS.includes(legacy)) {
        return { orderType: legacy, fulfillmentType: legacy, source: 'orderType' };
    }

    // Neither field is usable: documents predating both default to retail,
    // which is what every read path already assumed.
    return { orderType: 'retail', fulfillmentType: 'retail', source: 'default' };
};

export default {
    id: '0009_order_channel_attribution',
    description: 'Reconcile order orderType/fulfillmentType channel attribution',
    async up() {
        const cursor = Order.collection.find(
            { channelAttributionBackfill: { $exists: false } },
            { projection: { orderType: 1, fulfillmentType: 1, experience: 1 } }
        );

        let reconciled = 0;
        let alreadyConsistent = 0;
        const bySource = { fulfillmentType: 0, orderType: 0, default: 0 };
        let operations = [];

        const flush = async () => {
            if (!operations.length) return;
            const result = await Order.collection.bulkWrite(operations, { ordered: false });
            reconciled += result.modifiedCount;
            operations = [];
        };

        for await (const order of cursor) {
            const outcome = reconcileOrderChannel(order);
            if (!outcome) { alreadyConsistent += 1; continue; }
            bySource[outcome.source] += 1;
            operations.push({
                updateOne: {
                    filter: { _id: order._id, channelAttributionBackfill: { $exists: false } },
                    update: {
                        $set: {
                            orderType: outcome.orderType,
                            fulfillmentType: outcome.fulfillmentType,
                            // Audit trail: exactly what was overwritten and why.
                            channelAttributionBackfill: {
                                previousOrderType: order.orderType ?? null,
                                previousFulfillmentType: order.fulfillmentType ?? null,
                                resolvedFrom: outcome.source,
                                migratedAt: new Date(),
                            },
                        },
                    },
                },
            });
            if (operations.length >= 500) await flush();
        }
        await flush();

        return { reconciled, alreadyConsistent, bySource };
    },
    async verify() {
        // Every order must now resolve to the same channel from either field.
        const mismatched = await Order.countDocuments({
            orderType: { $nin: ['mixed', null] },
            fulfillmentType: { $in: CHANNELS },
            $expr: { $ne: ['$orderType', '$fulfillmentType'] },
        });
        const unattributed = await Order.countDocuments({
            fulfillmentType: { $nin: CHANNELS },
            orderType: { $nin: [...CHANNELS, 'mixed'] },
        });
        return {
            ok: mismatched === 0 && unattributed === 0,
            detail: `mismatched=${mismatched}; unattributed=${unattributed}`,
        };
    },
};
