/**
 * Quick Commerce operational alerts.
 *
 * Marketplace notifications are informational — a vendor reads them when they
 * next open the dashboard. Quick Commerce notifications are operational: a store
 * that misses a new-order alert breaks a promise that was made to the customer
 * in minutes. That difference is why these alerts are *tracked* rather than
 * fired and forgotten:
 *
 *   notify → (vendor acknowledges)  → done
 *          → (silence past timeout) → escalate to admin
 *
 * Acknowledgement is deliberately distinct from "read": opening a list is not
 * the same as a human accepting responsibility for an order, and only the
 * latter can safely stop an escalation.
 *
 * Everything here reuses the existing Notification model and socket rooms — no
 * new subsystem, per the blueprint.
 */

import Order from '../models/Order.model.js';
import Notification from '../models/Notification.model.js';
import Settings from '../models/Settings.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import { createNotification } from './notification.service.js';
import { emitToRoom, emitToUserRoom } from '../socket.js';
import { isQuickCommerceEnabled } from './featureFlags.service.js';
import { EXPERIENCES } from '../constants/experiences.js';
import {
    VENDOR_ACK_TIMEOUT_SECS,
    QUICK_COMMERCE_AWAITING_VENDOR_STATUSES,
    QUICK_COMMERCE_ORDER_STATUS,
    RIDER_LOCATION_STALE_AFTER_MS,
} from '../constants/quickCommerce.js';

/** Read the platform-configurable acknowledgement timeout. */
export const getVendorAckTimeoutSecs = async () => {
    const settingsDoc = await Settings.findOne({ key: 'quick_commerce' }).lean();
    const configured = Number(settingsDoc?.value?.vendorAckTimeoutSecs);
    return Number.isFinite(configured) && configured > 0 ? configured : VENDOR_ACK_TIMEOUT_SECS;
};

/**
 * Alert a store to a new Quick Commerce order.
 *
 * Persisted as `urgent` so the vendor UI can make it persistent and audible,
 * and pushed over the vendor's existing socket room so it lands without a
 * refresh — a poll interval is too slow when the whole promise is 15 minutes.
 *
 * Never throws: an order that is already placed must not fail because an alert
 * could not be delivered.
 */
export const notifyVendorOfNewQuickCommerceOrder = async (order, vendorId) => {
    if (!order?._id || !vendorId) return null;

    try {
        const itemCount = (order.items || []).reduce(
            (sum, line) => sum + Number(line?.quantity || 0),
            0
        );
        const etaMinutes = order.quickCommerce?.promisedEtaMinutes;

        const notification = await createNotification({
            recipientId: vendorId,
            recipientType: 'vendor',
            title: 'New Quick Commerce order',
            message: `Order ${order.orderId} — ${itemCount} item${itemCount === 1 ? '' : 's'}, promised in ${etaMinutes ?? '—'} min. Accept now.`,
            type: 'order',
            priority: 'urgent',
            data: {
                event: 'quick_commerce_order_received',
                orderId: String(order.orderId || ''),
                orderRefId: String(order._id),
                experience: EXPERIENCES.QUICK_COMMERCE,
                promisedEtaMinutes: String(etaMinutes ?? ''),
                items: String(itemCount),
            },
        });

        await Order.updateOne(
            { _id: order._id },
            { $set: { 'quickCommerce.vendorNotifiedAt': new Date() } }
        );

        // The vendor's own room already exists; this is the same emit pattern
        // the support desk uses.
        emitToUserRoom(vendorId, 'vendor', 'quick_commerce_order_alert', {
            notificationId: String(notification._id),
            orderId: String(order.orderId || ''),
            orderRefId: String(order._id),
            promisedEtaMinutes: etaMinutes ?? null,
            items: itemCount,
            priority: 'urgent',
        });

        return notification;
    } catch (err) {
        console.warn(`[QC Alert] Failed to notify vendor for order ${order?.orderId}: ${err.message}`);
        return null;
    }
};

/**
 * Record that a store has taken responsibility for an order.
 * Called both by the explicit acknowledge endpoint and implicitly by accepting.
 */
export const acknowledgeVendorOrderAlert = async (orderRefId, vendorId) => {
    const now = new Date();

    await Order.updateOne(
        { _id: orderRefId, 'quickCommerce.vendorAcknowledgedAt': { $exists: false } },
        { $set: { 'quickCommerce.vendorAcknowledgedAt': now } }
    );

    await Notification.updateMany(
        {
            recipientId: vendorId,
            recipientType: 'vendor',
            priority: 'urgent',
            acknowledgedAt: { $exists: false },
            'data.orderRefId': String(orderRefId),
        },
        { $set: { acknowledgedAt: now, isRead: true } }
    );

    return now;
};

/**
 * Escalate an order the store has not responded to.
 *
 * The customer is not told — the order is still fine at this point, and telling
 * them would create alarm before anyone has had a chance to fix it. This goes
 * to the people who can act.
 */
export const escalateUnacknowledgedOrder = async (order) => {
    const now = new Date();

    await Order.updateOne(
        { _id: order._id },
        { $set: { 'quickCommerce.vendorEscalatedAt': now } }
    );

    await Notification.updateMany(
        {
            recipientType: 'vendor',
            priority: 'urgent',
            escalatedAt: { $exists: false },
            'data.orderRefId': String(order._id),
        },
        { $set: { escalatedAt: now } }
    );

    emitToRoom('admin', 'quick_commerce_vendor_unresponsive', {
        orderId: String(order.orderId || ''),
        orderRefId: String(order._id),
        vendorId: String(order.vendorItems?.[0]?.vendorId || ''),
        vendorName: order.vendorItems?.[0]?.vendorName || '',
        placedAt: order.createdAt,
        escalatedAt: now.toISOString(),
    });

    return now;
};

/**
 * Flag an in-flight order that has already blown its promise.
 *
 * `slaBreached` is also set at delivery (that is the authoritative record); this
 * catches the breach while the order is still running, which is the only point
 * at which anyone can still do something about it.
 */
export const flagSlaBreach = async (order) => {
    await Order.updateOne(
        { _id: order._id },
        { $set: { 'quickCommerce.slaBreached': true } }
    );

    emitToRoom('admin', 'quick_commerce_sla_breach', {
        orderId: String(order.orderId || ''),
        orderRefId: String(order._id),
        promisedEtaMinutes: order.quickCommerce?.promisedEtaMinutes ?? null,
        promisedAt: order.quickCommerce?.promisedAt || null,
        status: order.quickCommerce?.status || null,
        detectedAt: new Date().toISOString(),
    });
};

/**
 * One pass of the operational sweep.
 *
 * Three independent checks — unresponsive stores, blown promises, and riders
 * who have gone dark. All bounded, and the first two idempotent: an order is
 * only ever escalated or flagged once, because the query excludes rows that
 * already carry the marker.
 *
 * @returns {Promise<{escalated:number, breached:number, staleRiders:number, skipped:boolean}>}
 */
export const runQuickCommerceSweep = async () => {
    // With the flag off, Quick Commerce does not exist and neither does this work.
    if (!(await isQuickCommerceEnabled())) {
        return { escalated: 0, breached: 0, staleRiders: 0, skipped: true };
    }

    const timeoutSecs = await getVendorAckTimeoutSecs();
    const now = Date.now();

    // ── 1. Stores that have not responded ─────────────────────────────────────
    const unacknowledged = await Order.find({
        experience: EXPERIENCES.QUICK_COMMERCE,
        isDeleted: { $ne: true },
        'quickCommerce.status': { $in: QUICK_COMMERCE_AWAITING_VENDOR_STATUSES },
        'quickCommerce.vendorAcknowledgedAt': { $exists: false },
        'quickCommerce.vendorEscalatedAt': { $exists: false },
        'quickCommerce.vendorNotifiedAt': { $lte: new Date(now - timeoutSecs * 1000) },
    })
        .select('orderId createdAt vendorItems.vendorId vendorItems.vendorName quickCommerce')
        .limit(100)
        .lean();

    for (const order of unacknowledged) {
        try {
            await escalateUnacknowledgedOrder(order);
        } catch (err) {
            console.warn(`[QC Sweep] Escalation failed for ${order.orderId}: ${err.message}`);
        }
    }

    // ── 2. Orders that have already blown the promise ─────────────────────────
    // Compared in the query rather than in JS so the scan stays bounded: any
    // live order promised before (now - eta) is late by definition.
    const liveOrders = await Order.find({
        experience: EXPERIENCES.QUICK_COMMERCE,
        isDeleted: { $ne: true },
        'quickCommerce.status': {
            $nin: [QUICK_COMMERCE_ORDER_STATUS.DELIVERED, QUICK_COMMERCE_ORDER_STATUS.CANCELLED],
        },
        'quickCommerce.slaBreached': { $ne: true },
        'quickCommerce.promisedAt': { $exists: true },
    })
        .select('orderId quickCommerce')
        .limit(200)
        .lean();

    let breached = 0;
    for (const order of liveOrders) {
        const promisedAt = new Date(order.quickCommerce.promisedAt).getTime();
        const promisedMins = Number(order.quickCommerce.promisedEtaMinutes);
        if (!Number.isFinite(promisedMins) || !promisedAt) continue;
        if (now <= promisedAt + promisedMins * 60 * 1000) continue;

        try {
            await flagSlaBreach(order);
            breached += 1;
        } catch (err) {
            console.warn(`[QC Sweep] SLA flag failed for ${order.orderId}: ${err.message}`);
        }
    }

    // ── 3. Riders who have gone dark mid-delivery ─────────────────────────────
    // The customer is watching a pin that has stopped moving. Nothing here can
    // fix that automatically — reassignment needs a human decision about a
    // rider who may be holding the goods — so it raises the alert and stops.
    const staleSince = new Date(now - RIDER_LOCATION_STALE_AFTER_MS);
    const inTransit = await Order.find({
        experience: EXPERIENCES.QUICK_COMMERCE,
        isDeleted: { $ne: true },
        'quickCommerce.status': {
            $in: [QUICK_COMMERCE_ORDER_STATUS.PICKED_UP, QUICK_COMMERCE_ORDER_STATUS.ARRIVING],
        },
        deliveryBoyId: { $ne: null },
    })
        .select('orderId deliveryBoyId quickCommerce.status')
        .limit(200)
        .lean();

    let staleRiders = 0;
    if (inTransit.length > 0) {
        const riderIds = [...new Set(inTransit.map((order) => String(order.deliveryBoyId)))];
        const goneDark = await DeliveryBoy.find({
            _id: { $in: riderIds },
            $or: [
                { lastLocationAt: { $lt: staleSince } },
                { lastLocationAt: { $exists: false } },
            ],
        })
            .select('_id name phone lastLocationAt')
            .lean();

        const goneDarkById = new Map(goneDark.map((rider) => [String(rider._id), rider]));
        for (const order of inTransit) {
            const rider = goneDarkById.get(String(order.deliveryBoyId));
            if (!rider) continue;
            staleRiders += 1;
            emitToRoom('admin', 'quick_commerce_rider_unreachable', {
                orderId: String(order.orderId || ''),
                orderRefId: String(order._id),
                riderId: String(rider._id),
                riderName: rider.name,
                riderPhone: rider.phone,
                lastSeenAt: rider.lastLocationAt || null,
                status: order.quickCommerce?.status || null,
            });
        }
    }

    return { escalated: unacknowledged.length, breached, staleRiders, skipped: false };
};

let sweepTimer = null;

/**
 * Start the periodic sweep.
 *
 * In-process interval, matching the existing cache-cleanup pattern — the
 * codebase has no job runner and this phase is not the place to introduce one.
 * Idempotent, and `unref`'d so it never holds the process open on shutdown.
 */
export const startQuickCommerceSweep = (intervalMs) => {
    if (sweepTimer) return sweepTimer;

    sweepTimer = setInterval(() => {
        runQuickCommerceSweep().catch((err) => {
            console.warn(`[QC Sweep] Pass failed: ${err.message}`);
        });
    }, intervalMs);

    if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
    return sweepTimer;
};

export const stopQuickCommerceSweep = () => {
    if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = null;
    }
};
