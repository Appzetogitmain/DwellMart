/**
 * Migration: backfill `vendorItems[].fulfillmentType` on existing orders.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `vendorItems[]` recorded only `orderType`, which the OrderSplitterEngine
 * writes from `deriveOrderType()` — a PRICING type ('retail' | 'wholesale' |
 * 'mixed') with no concept of Quick Commerce. Every Quick Commerce order
 * therefore carries `vendorItems[0].orderType === 'retail'`.
 *
 * `resolveOrderChannel(order, vendorId)` consulted that slice before the
 * order's own authoritative `fulfillmentType`, so a vendor-scoped lookup of a
 * genuine Quick Commerce order answered 'retail'. Two things followed from
 * that, both live:
 *
 *   - the retail state machine governed Quick Commerce orders in the vendor
 *     workspace, which is precisely the bleed migration 0009 set out to end;
 *   - once a courier integration existed, a Quick Commerce parcel resolved to
 *     DTDC rather than to an internal rider.
 *
 * The resolver's precedence is fixed in code, and the splitter now stamps the
 * slice. This migration repairs the documents already written, so historical
 * orders resolve the same way new ones do rather than relying on the fallback
 * chain forever.
 *
 * Non-destructive: it only fills a field that is currently absent, and only
 * from the order's own channel. Nothing is overwritten and no order changes
 * channel.
 */

import mongoose from 'mongoose';
import Order from '../models/Order.model.js';

export const id = '0012_vendor_item_fulfillment_type';
export const description = 'Backfill vendorItems[].fulfillmentType from the order channel';

const CHANNELS = ['quick_commerce', 'retail', 'wholesale'];

/**
 * The order-level channel, using the same precedence the resolver applies
 * MINUS the vendor slice — which is the field being repaired and so cannot be
 * trusted as its own source.
 */
const orderChannelOf = (order) => {
    const normalize = (value) => {
        const raw = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
        if (raw === 'marketplace') return 'retail';
        if (raw === 'quickcommerce' || raw === 'qc') return 'quick_commerce';
        return CHANNELS.includes(raw) ? raw : null;
    };
    return normalize(order.fulfillmentType)
        || normalize(order.orderType)
        || normalize(order.experience)
        || 'retail';
};

export const up = async () => {
    const cursor = Order.collection.find(
        { vendorItems: { $exists: true, $ne: [] } },
        { projection: { fulfillmentType: 1, orderType: 1, experience: 1, vendorItems: 1 } }
    );

    const operations = [];
    let scanned = 0;
    let repaired = 0;

    const flush = async () => {
        if (!operations.length) return;
        await Order.collection.bulkWrite(operations, { ordered: false });
        operations.length = 0;
    };

    for await (const order of cursor) {
        scanned += 1;
        const channel = orderChannelOf(order);

        const setters = {};
        (order.vendorItems || []).forEach((slice, index) => {
            // Only fill what is genuinely absent. A slice that already names a
            // channel is left exactly as it is, even if it disagrees — silently
            // rewriting a recorded value would destroy the evidence of any
            // disagreement rather than surface it.
            if (!CHANNELS.includes(slice?.fulfillmentType)) {
                setters[`vendorItems.${index}.fulfillmentType`] = channel;
            }
        });

        if (Object.keys(setters).length === 0) continue;

        repaired += 1;
        operations.push({ updateOne: { filter: { _id: order._id }, update: { $set: setters } } });
        if (operations.length >= 500) await flush();
    }

    await flush();
    console.log(`[Migration 0012] scanned ${scanned} order(s); backfilled ${repaired}`);
};

export const verify = async () => {
    // Any slice still missing the field, on an order that has slices at all.
    const missing = await Order.countDocuments({
        vendorItems: { $exists: true, $ne: [] },
        'vendorItems.fulfillmentType': { $in: [null] },
    });

    // The failure this migration exists to prevent: a Quick Commerce order
    // whose slice claims a channel that would route it to a courier.
    const misrouted = await Order.countDocuments({
        fulfillmentType: 'quick_commerce',
        'vendorItems.fulfillmentType': { $in: ['retail', 'wholesale'] },
    });

    if (missing === 0 && misrouted === 0) {
        return { ok: true, detail: 'missingSliceChannel=0; quickCommerceMisrouted=0' };
    }
    return {
        ok: false,
        detail: `missingSliceChannel=${missing}; quickCommerceMisrouted=${misrouted}`,
    };
};

export default { id, description, up, verify };
