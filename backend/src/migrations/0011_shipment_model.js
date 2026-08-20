/**
 * Migration: Create the Shipment collection and reconcile its indexes.
 *
 * The Shipment model is the persistence layer for DTDC and any future
 * delivery-provider integration.
 *
 * `syncIndexes()` both creates the schema's indexes and DROPS any index the
 * schema no longer declares — which is what makes this migration re-runnable
 * against an environment that already received the first cut of the model.
 * That first cut carried a unique index on (orderId, deliveryProvider), and a
 * marketplace order split across two sellers could therefore only ever book
 * one parcel: the second vendor's booking died on a duplicate-key error. The
 * uniqueness now lives on (orderId, vendorId, deliveryProvider).
 */

import Shipment from '../models/Shipment.model.js';

export const id = '0011_shipment_model';
export const description = 'Create Shipment collection and sync indexes for DTDC delivery integration';

const keyOf = (idx) => JSON.stringify(idx.key);

export const up = async () => {
    await Shipment.syncIndexes();
    console.log('[Migration 0011] Shipment collection indexes synced');
};

export const verify = async () => {
    const indexes = await Shipment.collection.indexes();

    const uniqueBookingSlot = indexes.find((idx) =>
        keyOf(idx) === JSON.stringify({ orderId: 1, vendorId: 1, deliveryProvider: 1 })
    );
    const awbIndex = indexes.find((idx) => idx.key?.awbNumber !== undefined);
    const bookingIdIndex = indexes.find((idx) => idx.key?.bookingId !== undefined);

    // The superseded index must be gone, not merely outnumbered: while it
    // exists, multi-vendor booking stays broken however correct the code is.
    const staleUnique = indexes.find((idx) =>
        keyOf(idx) === JSON.stringify({ orderId: 1, deliveryProvider: 1 }) && idx.unique === true
    );

    const problems = [];
    if (!uniqueBookingSlot?.unique) problems.push('missing unique (orderId, vendorId, deliveryProvider) index');
    if (!awbIndex?.unique) problems.push('missing unique awbNumber index');
    if (!bookingIdIndex?.unique) problems.push('missing unique bookingId index');
    if (staleUnique) problems.push('stale unique (orderId, deliveryProvider) index still present');

    if (problems.length === 0) {
        return { ok: true, detail: `${indexes.length} indexes present on Shipment collection` };
    }
    return { ok: false, detail: problems.join('; ') };
};

export default { id, description, up, verify };
