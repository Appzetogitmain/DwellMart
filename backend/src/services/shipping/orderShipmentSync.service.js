/**
 * Carrier → Order lifecycle bridge.
 *
 * A carrier scan tells us where the parcel is. Turning that into an order
 * status is a separate decision, and it has to respect three things the
 * shipment layer knows nothing about:
 *
 *   1. The retail and wholesale state machines already exist
 *      (services/orders/RetailOrderService.js, WholesaleOrderService.js) and
 *      only permit single steps: `confirmed → packed → shipped`. A DTDC
 *      PICKED_UP scan on a `confirmed` order means "shipped", but jumping
 *      straight there is an illegal transition. This module walks the ladder
 *      one legal rung at a time instead.
 *
 *   2. `Order.integration.partnerStatus` and `Order.integration.logs[].status`
 *      are constrained to `INTEGRATION_PARTNER_STATUSES` — an UPPERCASE
 *      vocabulary shared with the third-party partner API. Writing a shipment
 *      status such as `'booked'` there throws a ValidationError on save, which
 *      is precisely how the carrier write-back used to fail silently.
 *
 *   3. An order that a human already cancelled, or that has already been
 *      delivered, is finished. A late scan must not resurrect it.
 *
 * Nothing here is Quick Commerce aware by design: QC never reaches this module
 * because the provider resolver routes it to internal riders.
 */

import { VendorChannels } from '../../constants/vendorChannels.js';
import { resolveOrderChannel } from '../orderChannel.service.js';
import { shipmentStatusToOrderStatus, shipmentStatusToPartnerStatus } from '../../constants/dtdcStatus.js';
import { createNotification } from '../notification.service.js';

/**
 * The forward-only ladder each channel's state machine permits.
 *
 * These mirror the TRANSITIONS tables in the order services; they are listed
 * again here as an ordered path because the services answer "is this one step
 * legal?" and this module needs "what is the route from A to B?".
 */
const CHANNEL_LADDER = Object.freeze({
    [VendorChannels.RETAIL]:    ['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'],
    [VendorChannels.WHOLESALE]: ['pending', 'approved', 'processing', 'packed', 'dispatched', 'delivered'],
});

/**
 * Legacy statuses that are not on the ladder but do exist on historical
 * orders. Each is pinned to the rung it is equivalent to so an old order can
 * still be advanced by a carrier scan instead of erroring.
 */
const LEGACY_STATUS_ALIASES = Object.freeze({
    processing: { [VendorChannels.RETAIL]: 'packed' },
    approved:   { [VendorChannels.RETAIL]: 'confirmed' },
    confirmed:  { [VendorChannels.WHOLESALE]: 'approved' },
    shipped:    { [VendorChannels.WHOLESALE]: 'dispatched' },
    out_for_delivery: { [VendorChannels.WHOLESALE]: 'dispatched' },
});

/** Orders in these states are finished; no scan reopens them. */
const TERMINAL_ORDER_STATUSES = Object.freeze(['delivered', 'cancelled', 'returned']);

const ladderFor = (channel) => CHANNEL_LADDER[channel] || CHANNEL_LADDER[VendorChannels.RETAIL];

/**
 * Position of `status` on the channel ladder, resolving legacy aliases.
 * @returns {number} index, or -1 when the status has no place on this ladder.
 */
const rungOf = (status, channel) => {
    const ladder = ladderFor(channel);
    const normalized = String(status || 'pending').toLowerCase();
    const direct = ladder.indexOf(normalized);
    if (direct !== -1) return direct;

    const alias = LEGACY_STATUS_ALIASES[normalized]?.[channel];
    return alias ? ladder.indexOf(alias) : -1;
};

/**
 * The order status a vendor's slice of the order currently sits at.
 * Multi-vendor orders track status per `vendorItems[]` entry; single-vendor
 * and legacy orders only have the top-level field.
 */
const currentStatusFor = (order, vendorId) => {
    if (vendorId) {
        const slice = (order.vendorItems || []).find(
            (vi) => String(vi?.vendorId) === String(vendorId)
        );
        if (slice?.status) return String(slice.status).toLowerCase();
    }
    return String(order.status || 'pending').toLowerCase();
};

/**
 * Advance an order to the status a carrier scan implies, one legal step at a
 * time, and return the statuses actually applied.
 *
 * Deliberately conservative:
 *   - never moves backwards (a late IN_TRANSIT after DELIVERED is a no-op);
 *   - never leaves a terminal state;
 *   - never invents a status outside the channel's own state machine.
 *
 * The order is mutated but NOT saved — the caller owns the write so the
 * shipment and the order can be persisted together.
 *
 * @param {object} order    Mongoose Order document
 * @param {string} target   Desired order status (already channel-appropriate)
 * @param {string} channel  'retail' | 'wholesale'
 * @param {string} [vendorId]
 * @returns {string[]} the statuses stepped through, in order (empty = no change)
 */
export const advanceOrderStatus = (order, target, channel, vendorId = null) => {
    if (!target) return [];

    const ladder = ladderFor(channel);
    const current = currentStatusFor(order, vendorId);

    if (TERMINAL_ORDER_STATUSES.includes(current)) return [];

    const from = rungOf(current, channel);
    const to = ladder.indexOf(target);

    // An unknown current status means we cannot reason about the route. Doing
    // nothing is safer than guessing a starting rung.
    if (from === -1 || to === -1 || to <= from) return [];

    const path = ladder.slice(from + 1, to + 1);
    const applied = [];

    for (const next of path) {
        applyOrderStatus(order, next, vendorId, channel);
        applied.push(next);
    }

    return applied;
};

/**
 * The order-level status implied by its vendor slices.
 *
 * The order is only as far along as its LEAST advanced parcel: a two-seller
 * order where one box has arrived and the other is still on the shelf is not a
 * delivered order, however tempting the first seller's status is to copy up.
 * Cancelled slices are excluded from that minimum — one seller cancelling must
 * not pin the whole order to `cancelled` while the other still ships.
 */
const deriveTopLevelStatus = (items, channel, fallback = 'pending') => {
    const ladder = ladderFor(channel);
    const statuses = items.map((vi) => String(vi?.status || 'pending').toLowerCase());

    if (statuses.length === 0) return fallback;
    if (statuses.every((s) => s === 'cancelled')) return 'cancelled';

    const live = statuses.filter((s) => s !== 'cancelled');
    let lowest = null;
    let lowestRung = Infinity;

    for (const status of live) {
        const rung = rungOf(status, channel);
        // A status off this channel's ladder cannot be ranked; leave the
        // top-level value alone rather than guessing where it sits.
        if (rung === -1) return fallback;
        if (rung < lowestRung) { lowestRung = rung; lowest = status; }
    }

    return lowest ? ladder[lowestRung] : fallback;
};

/**
 * Write one status onto the order, keeping `vendorItems[]` and the derived
 * top-level status consistent.
 *
 * Mirrors what `applyRetailTransition` / `applyWholesaleTransition` do, minus
 * their assertion (this module has already validated the route) and minus
 * their `vendorItems` requirement — those helpers derive the top-level status
 * with `allStatuses.every(...)`, which returns true for an empty array and so
 * would mark a vendorItems-less order `cancelled`.
 */
const applyOrderStatus = (order, next, vendorId, channel) => {
    const items = order.vendorItems || [];
    const hasSlice = vendorId && items.some((vi) => String(vi?.vendorId) === String(vendorId));

    if (hasSlice) {
        items.forEach((vi) => {
            if (String(vi?.vendorId) === String(vendorId)) vi.status = next;
        });
        order.status = deriveTopLevelStatus(items, channel, order.status);
    } else {
        order.status = next;
    }

    const now = new Date();
    if (next === 'shipped' || next === 'dispatched') order.shippedAt = order.shippedAt || now;
    if (next === 'delivered') order.deliveredAt = order.deliveredAt || now;
};

/**
 * Record carrier state on `order.integration` using only values the Order
 * schema's enums accept, and append one audit log entry.
 *
 * @param {object} order
 * @param {string} shipmentStatus internal shipment status
 * @param {object} [meta]
 * @param {string} [meta.note]
 * @param {string} [meta.source]
 * @param {string} [meta.partnerReferenceId]
 * @param {object} [meta.rawPayload]
 * @returns {boolean} true when something was written
 */
export const recordPartnerStatus = (order, shipmentStatus, meta = {}) => {
    const partnerStatus = shipmentStatusToPartnerStatus(shipmentStatus);
    if (!partnerStatus) return false;

    if (!order.integration) order.integration = {};
    const previous = order.integration.partnerStatus;

    order.integration.partnerStatus = partnerStatus;
    order.integration.lastPartnerSyncAt = new Date();
    if (meta.partnerReferenceId) order.integration.partnerReferenceId = meta.partnerReferenceId;
    if (partnerStatus === 'DELIVERED') order.integration.deliveredAt = order.integration.deliveredAt || new Date();

    if (!Array.isArray(order.integration.logs)) order.integration.logs = [];

    // One log line per distinct partner status. A replayed webhook carrying a
    // status we already hold adds nothing but noise to the audit trail.
    if (previous !== partnerStatus) {
        order.integration.logs.push({
            status: partnerStatus,
            timestamp: new Date(),
            note: meta.note || '',
            source: meta.source || 'dtdc',
            partnerReferenceId: meta.partnerReferenceId || order.integration.partnerReferenceId || undefined,
            rawPayload: meta.rawPayload || {},
        });
    }

    return true;
};

/**
 * Notify the customer (and the vendor) that a shipment moved.
 *
 * Fire-and-forget: a notification provider outage must never roll back a
 * delivery status that the carrier has already confirmed.
 */
export const notifyShipmentProgress = async (order, statuses, { vendorId = null } = {}) => {
    if (!statuses.length) return;

    // Only the final state is worth telling a human about — walking three rungs
    // to catch up with the carrier should not produce three push notifications.
    const finalStatus = statuses[statuses.length - 1];
    const reference = order.orderId || order._id;
    const tasks = [];

    if (order.userId) {
        tasks.push(createNotification({
            recipientId: order.userId,
            recipientType: 'user',
            title: finalStatus === 'delivered' ? 'Order delivered' : 'Shipment update',
            message: `Your order ${reference} is now ${String(finalStatus).replace(/_/g, ' ')}.`,
            type: 'order',
            data: { orderId: String(reference), status: String(finalStatus), scope: 'shipment' },
        }));
    }

    if (vendorId) {
        tasks.push(createNotification({
            recipientId: vendorId,
            recipientType: 'vendor',
            title: 'Shipment update',
            message: `Order ${reference} is now ${String(finalStatus).replace(/_/g, ' ')}.`,
            type: 'order',
            data: { orderId: String(reference), status: String(finalStatus), scope: 'shipment' },
        }));
    }

    await Promise.allSettled(tasks);
};

/**
 * Apply one shipment status to an order: lifecycle advance, partner-status
 * write-back and audit log. Saves the order only when something changed.
 *
 * @param {object} order        Mongoose Order document
 * @param {object} shipment     Mongoose Shipment document
 * @param {object} [options]
 * @param {string} [options.note]
 * @param {string} [options.source]
 * @param {object} [options.rawPayload]
 * @param {boolean} [options.notify] send customer/vendor notifications
 * @returns {Promise<{ changed: boolean, appliedStatuses: string[] }>}
 */
export const syncOrderWithShipment = async (order, shipment, options = {}) => {
    const vendorId = shipment.vendorId ? String(shipment.vendorId) : null;
    const channel = shipment.channel || resolveOrderChannel(order, vendorId);

    const targetOrderStatus = shipmentStatusToOrderStatus(shipment.status, channel);
    const appliedStatuses = advanceOrderStatus(order, targetOrderStatus, channel, vendorId);

    const recorded = recordPartnerStatus(order, shipment.status, {
        note: options.note,
        source: options.source || 'dtdc',
        partnerReferenceId: shipment.awbNumber || undefined,
        rawPayload: options.rawPayload,
    });

    const changed = appliedStatuses.length > 0 || recorded;
    if (changed) await order.save();

    if (options.notify !== false && appliedStatuses.length > 0) {
        await notifyShipmentProgress(order, appliedStatuses, { vendorId });
    }

    return { changed, appliedStatuses };
};

export default {
    advanceOrderStatus,
    recordPartnerStatus,
    notifyShipmentProgress,
    syncOrderWithShipment,
};
