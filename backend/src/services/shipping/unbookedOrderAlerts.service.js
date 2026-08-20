/**
 * Unbooked-order alerts.
 *
 * Courier booking is a manual act: a human opens a retail or wholesale order
 * and presses "Book DTDC Shipment". Nothing in the system creates a consignment
 * on its own — `ORDER_CREATED` only emits notifications, and no worker touches
 * `Shipment`. That is a deliberate gate (the seller should confirm stock and
 * pack the parcel before committing to a billable consignment), but until now
 * it was an INVISIBLE gate: a paid order nobody booked simply sat there.
 *
 * This module makes that state observable. One eligibility definition,
 * expressed once as an aggregation, is shared by four consumers — the sweep,
 * the vendor endpoint, the admin endpoint and the per-order banner — so the
 * number in the alert can never disagree with the number on the screen.
 *
 * Quick Commerce is excluded at the query level, not merely filtered
 * afterwards: QC is delivered by internal riders and has no courier booking to
 * be missing.
 */

import mongoose from 'mongoose';
import Order from '../../models/Order.model.js';
import Settings from '../../models/Settings.model.js';
import { createNotification, notifyAdmins } from '../notification.service.js';
import { VendorChannels } from '../../constants/vendorChannels.js';
import { DeliveryProviders } from './deliveryProvider.js';

// ─── Configuration ─────────────────────────────────────────────────────────

/** Settings key holding the operator-tunable shipping thresholds. */
export const SHIPPING_SETTINGS_KEY = 'shipping';

export const DEFAULT_VENDOR_ALERT_HOURS = 6;
export const DEFAULT_ADMIN_ALERT_HOURS = 24;

/**
 * Read the configurable alert thresholds.
 *
 * Deliberately Settings-backed rather than env-backed: an operator changes a
 * threshold during an incident, and that must not require a deploy. Mirrors
 * how `quickCommerceAlerts.getVendorAckTimeoutSecs` reads its own timeout.
 *
 * @returns {Promise<{vendorHours:number, adminHours:number}>}
 */
export const getAlertThresholds = async () => {
    const doc = await Settings.findOne({ key: SHIPPING_SETTINGS_KEY }).lean();
    const vendorRaw = Number(doc?.value?.unbookedVendorAlertHours);
    const adminRaw = Number(doc?.value?.unbookedAdminAlertHours);

    return {
        vendorHours: Number.isFinite(vendorRaw) && vendorRaw > 0 ? vendorRaw : DEFAULT_VENDOR_ALERT_HOURS,
        adminHours: Number.isFinite(adminRaw) && adminRaw > 0 ? adminRaw : DEFAULT_ADMIN_ALERT_HOURS,
    };
};

// ─── Eligibility ───────────────────────────────────────────────────────────

/**
 * Order statuses that mean "the seller has accepted this and it should be on
 * its way". Taken from the existing retail and wholesale state machines
 * (services/orders/*OrderService.js) — no new states are introduced here.
 *
 * Retail:    pending → confirmed → packed → shipped → out_for_delivery → delivered
 * Wholesale: pending → approved → processing → packed → dispatched → delivered
 *
 * `pending` is excluded on purpose: an unconfirmed order is not yet the
 * seller's to despatch, so chasing it would be noise.
 */
export const DISPATCH_READY_STATUSES = Object.freeze({
    [VendorChannels.RETAIL]: Object.freeze(['confirmed', 'packed', 'processing']),
    [VendorChannels.WHOLESALE]: Object.freeze(['approved', 'processing', 'packed']),
});

/**
 * Statuses after which booking is moot. `shipped`, `dispatched` and
 * `out_for_delivery` are absent from BOTH lists deliberately: reaching them
 * without a shipment means the seller moved the order by hand, which is a data
 * question rather than an alert.
 */
export const TERMINAL_ORDER_STATUSES = Object.freeze(['delivered', 'cancelled', 'returned']);

/** Every status that can qualify, across both courier channels. */
const ALL_DISPATCH_READY = Object.freeze([
    ...new Set([
        ...DISPATCH_READY_STATUSES[VendorChannels.RETAIL],
        ...DISPATCH_READY_STATUSES[VendorChannels.WHOLESALE],
    ]),
]);

/**
 * The aggregation pipeline that defines "awaiting courier booking".
 *
 * ONE definition, four consumers. Built as a pipeline rather than N+1 queries
 * because a busy platform can have thousands of open orders and asking
 * `Shipment` about each one individually is how a 15-minute sweep becomes a
 * 15-minute outage.
 *
 * @param {object}  [options]
 * @param {Date}    [options.olderThan]  only orders that reached dispatch-ready before this
 * @param {string}  [options.vendorId]   restrict to one seller
 * @param {string}  [options.channel]    'retail' | 'wholesale'
 * @param {boolean} [options.notYetAlerted] exclude orders already alerted
 * @param {number}  [options.skip]
 * @param {number}  [options.limit]
 * @returns {object[]} aggregation pipeline
 */
export const buildUnbookedOrderPipeline = ({
    olderThan = null,
    vendorId = null,
    channel = null,
    notYetAlerted = false,
    skip = 0,
    limit = 100,
} = {}) => {
    const match = {
        isDeleted: { $ne: true },
        status: { $in: ALL_DISPATCH_READY, $nin: TERMINAL_ORDER_STATUSES },
    };

    // Quick Commerce is excluded structurally. `fulfillmentType` is the
    // authoritative channel field; `experience` catches legacy documents that
    // predate it and only ever recorded QC there.
    match.fulfillmentType = channel
        ? channel
        : { $in: [VendorChannels.RETAIL, VendorChannels.WHOLESALE] };
    match.experience = { $ne: 'quick_commerce' };

    if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) {
        const oid = new mongoose.Types.ObjectId(String(vendorId));
        match.$or = [{ vendorId: oid }, { 'vendorItems.vendorId': oid }];
    }

    if (olderThan) {
        // `updatedAt` is when the order last moved, which is the closest signal
        // the schema carries for "reached this status". Using `createdAt` would
        // start the clock before the seller had accepted the order.
        match.updatedAt = { $lte: olderThan };
    }

    if (notYetAlerted) {
        match['integration.unbookedAlertedAt'] = { $in: [null] };
    }

    return [
        { $match: match },
        {
            // Left-join only the shipments that actually have an AWB. A
            // Shipment row without one is a failed or in-flight booking
            // attempt, and the order genuinely still needs booking.
            $lookup: {
                from: 'shipments',
                let: { orderId: '$_id' },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ['$orderId', '$$orderId'] },
                            deliveryProvider: DeliveryProviders.DTDC,
                            awbNumber: { $nin: [null, ''] },
                        },
                    },
                    { $project: { _id: 1, vendorId: 1, awbNumber: 1 } },
                ],
                as: 'bookedShipments',
            },
        },
        { $match: { bookedShipments: { $size: 0 } } },
        { $sort: { updatedAt: 1 } },
        { $skip: skip },
        { $limit: limit },
        {
            $project: {
                orderId: 1,
                _id: 1,
                status: 1,
                fulfillmentType: 1,
                total: 1,
                userId: 1,
                vendorId: 1,
                'vendorItems.vendorId': 1,
                'vendorItems.vendorName': 1,
                'integration.unbookedAlertedAt': 1,
                createdAt: 1,
                updatedAt: 1,
            },
        },
    ];
};

/**
 * Orders awaiting courier booking.
 *
 * @param {object} [options] see `buildUnbookedOrderPipeline`
 * @returns {Promise<object[]>}
 */
export const findUnbookedOrders = async (options = {}) =>
    Order.aggregate(buildUnbookedOrderPipeline(options));

/** Count matching orders, reusing the identical eligibility definition. */
export const countUnbookedOrders = async (options = {}) => {
    const pipeline = buildUnbookedOrderPipeline({ ...options, skip: 0, limit: 100000 });
    // Drop $sort/$skip/$limit/$project — a count needs none of them.
    const counted = pipeline.filter(
        (stage) => !('$sort' in stage || '$skip' in stage || '$limit' in stage || '$project' in stage)
    );
    const [result] = await Order.aggregate([...counted, { $count: 'total' }]);
    return result?.total ?? 0;
};

/** Hours an order has been sitting dispatch-ready without a consignment. */
export const hoursAwaiting = (order, now = new Date()) => {
    const since = order?.updatedAt ? new Date(order.updatedAt) : null;
    if (!since || Number.isNaN(since.valueOf())) return 0;
    return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 3_600_000));
};

/** The seller responsible for despatching this order. */
export const vendorOf = (order) =>
    order?.vendorId || order?.vendorItems?.[0]?.vendorId || null;

// ─── Sweep lease ───────────────────────────────────────────────────────────
//
// Identical mechanism to the Quick Commerce sweep, with its own key. Without
// it, every application instance alerts the same seller about the same order
// on every tick.

const SWEEP_LEASE_KEY = '_shipping_sweep_lease';
/** Shorter than the sweep interval, so a crashed owner's lease always expires first. */
const LEASE_SECS = 13 * 60;
const INSTANCE_ID = `${process.pid}-${Date.now()}`;

export const acquireSweepLease = async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LEASE_SECS * 1000);
    try {
        const result = await Settings.findOneAndUpdate(
            {
                key: SWEEP_LEASE_KEY,
                $or: [
                    { 'value.expiresAt': { $lt: now } },  // expired — claim it
                    { 'value.ownerId': INSTANCE_ID },      // renew our own
                ],
            },
            { $set: { key: SWEEP_LEASE_KEY, value: { ownerId: INSTANCE_ID, expiresAt } } },
            { upsert: true, new: true }
        );
        return result?.value?.ownerId === INSTANCE_ID;
    } catch (err) {
        // Upsert race on first boot — another instance won this tick.
        if (err.code === 11000) return false;
        throw err;
    }
};

/** Release the lease so another instance can take the next tick immediately. */
export const releaseSweepLease = async () => {
    await Settings.updateOne(
        { key: SWEEP_LEASE_KEY, 'value.ownerId': INSTANCE_ID },
        { $set: { 'value.expiresAt': new Date(0) } }
    ).catch(() => {});
};

// ─── Alerting ──────────────────────────────────────────────────────────────

/**
 * Mark an order as alerted.
 *
 * The stamp is what makes the sweep idempotent, and it lives on the order
 * rather than in memory so it survives a restart, a redeploy and a failover to
 * a different instance. Written with `updateOne` rather than a document save
 * so it cannot trip validation on unrelated legacy fields.
 */
const stampAlerted = async (orderId, at = new Date()) => {
    await Order.updateOne(
        { _id: orderId },
        { $set: { 'integration.unbookedAlertedAt': at } },
        { timestamps: false }
    );
};

/**
 * Alert one order's seller, and admins once it is badly overdue.
 *
 * Never throws: an undeliverable notification must not abort the rest of the
 * sweep.
 *
 * @returns {Promise<{vendorNotified:boolean, adminNotified:boolean}>}
 */
export const alertUnbookedOrder = async (order, { adminHours, now = new Date() } = {}) => {
    const result = { vendorNotified: false, adminNotified: false };
    const vendorId = vendorOf(order);
    const reference = order.orderId || order._id;
    const waited = hoursAwaiting(order, now);
    const channelLabel = order.fulfillmentType === VendorChannels.WHOLESALE ? 'Wholesale' : 'Retail';

    if (vendorId) {
        try {
            await createNotification({
                recipientId: String(vendorId),
                recipientType: 'vendor',
                category: 'WARNING',
                type: 'order',
                priority: 'HIGH',
                title: 'Order awaiting shipment booking',
                message: `${channelLabel} order ${reference} has been ready to ship for ${waited} hour${waited === 1 ? '' : 's'} and has no courier booking yet.`,
                actionUrl: `/vendor/orders/${reference}`,
                actionType: 'order_detail',
                data: { orderId: String(reference), hoursAwaiting: waited, scope: 'unbooked_shipment' },
            });
            result.vendorNotified = true;
        } catch (err) {
            console.warn(`[ShippingSweep] Vendor alert failed for ${reference}: ${err.message}`);
        }
    }

    // Admins hear about it only once it is genuinely stuck. Alerting them at
    // the same threshold as the seller would make the platform-wide feed
    // useless within a day.
    if (Number.isFinite(adminHours) && waited >= adminHours) {
        try {
            await notifyAdmins({
                anchorId: order._id,
                title: 'Order overdue for shipment booking',
                message: `${channelLabel} order ${reference} has had no courier booking for ${waited} hours.`,
                type: 'order',
                category: 'WARNING',
                priority: 'HIGH',
                actionUrl: `/admin/orders/${order._id}`,
                data: { orderId: String(reference), hoursAwaiting: waited, scope: 'unbooked_shipment' },
            });
            result.adminNotified = true;
        } catch (err) {
            console.warn(`[ShippingSweep] Admin alert failed for ${reference}: ${err.message}`);
        }
    }

    await stampAlerted(order._id, now);
    return result;
};

/**
 * One pass. Bounded, leased, and idempotent.
 *
 * @returns {Promise<{alerted:number, adminAlerted:number, scanned:number, skipped:boolean}>}
 */
export const runUnbookedOrderSweep = async ({ now = new Date(), batchSize = 100 } = {}) => {
    const isOwner = await acquireSweepLease();
    if (!isOwner) return { alerted: 0, adminAlerted: 0, scanned: 0, skipped: true };

    const { vendorHours, adminHours } = await getAlertThresholds();
    const olderThan = new Date(now.getTime() - vendorHours * 3_600_000);

    const orders = await findUnbookedOrders({
        olderThan,
        notYetAlerted: true,
        limit: batchSize,
    });

    let alerted = 0;
    let adminAlerted = 0;

    for (const order of orders) {
        try {
            const outcome = await alertUnbookedOrder(order, { adminHours, now });
            if (outcome.vendorNotified) alerted += 1;
            if (outcome.adminNotified) adminAlerted += 1;
        } catch (err) {
            console.warn(`[ShippingSweep] Alert failed for ${order.orderId}: ${err.message}`);
        }
    }

    return { alerted, adminAlerted, scanned: orders.length, skipped: false };
};

// ─── Worker lifecycle ──────────────────────────────────────────────────────

let sweepTimer = null;

/**
 * Start the sweep on an in-process interval, matching every other background
 * worker in this codebase. Idempotent, and `unref`'d so it never holds the
 * process open on shutdown.
 */
export const startUnbookedOrderSweep = (intervalMs = 15 * 60_000) => {
    if (sweepTimer) return sweepTimer;

    sweepTimer = setInterval(() => {
        runUnbookedOrderSweep().catch((err) => {
            console.warn(`[ShippingSweep] Pass failed: ${err.message}`);
        });
    }, intervalMs);

    if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
    return sweepTimer;
};

export const stopUnbookedOrderSweep = () => {
    if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = null;
    }
};

export default {
    SHIPPING_SETTINGS_KEY,
    getAlertThresholds,
    buildUnbookedOrderPipeline,
    findUnbookedOrders,
    countUnbookedOrders,
    hoursAwaiting,
    vendorOf,
    acquireSweepLease,
    releaseSweepLease,
    alertUnbookedOrder,
    runUnbookedOrderSweep,
    startUnbookedOrderSweep,
    stopUnbookedOrderSweep,
};
