/**
 * Quick Commerce order status transitions.
 *
 * One implementation shared by the vendor path (accepted → preparing → ready)
 * and the rider path (picked_up → arriving → delivered), so the two cannot
 * drift into disagreeing about what is legal.
 *
 * Every Quick Commerce status also maps onto the existing Marketplace status,
 * which is what keeps admin order lists, vendor earnings, delivery queries and
 * analytics working unchanged — they keep reading `order.status` and never need
 * to know Quick Commerce exists.
 */

import ApiError from '../utils/ApiError.js';
import { emitToRoom } from '../socket.js';
import { createNotification } from './notification.service.js';
import {
    QUICK_COMMERCE_ORDER_STATUS,
    QUICK_COMMERCE_STATUS_TO_ORDER_STATUS,
    QUICK_COMMERCE_STATUS_TRANSITIONS,
    QUICK_COMMERCE_VENDOR_STATUSES,
    QUICK_COMMERCE_RIDER_STATUSES,
} from '../constants/quickCommerce.js';
import { EXPERIENCES } from '../constants/experiences.js';

/** Customer-facing copy for each status. */
const STATUS_MESSAGES = {
    accepted: 'Your order has been accepted by the store.',
    preparing: 'The store is preparing your order.',
    ready: 'Your order is packed and waiting for pickup.',
    picked_up: 'Your order has been picked up.',
    arriving: 'Your delivery partner is arriving.',
    delivered: 'Your order has been delivered.',
    cancelled: 'Your order has been cancelled.',
};

const STATUS_TITLES = {
    accepted: 'Order accepted',
    preparing: 'Order being prepared',
    ready: 'Order ready for pickup',
    picked_up: 'Order picked up',
    arriving: 'Arriving now',
    delivered: 'Order delivered',
    cancelled: 'Order cancelled',
};

/**
 * Validate a Quick Commerce transition for a given actor.
 * Throws rather than returning false so every caller fails the same way.
 *
 * @param {object} order Order document with `quickCommerce.status`.
 * @param {string} nextStatus
 * @param {'vendor'|'rider'} actor
 */
export const assertQuickCommerceTransition = (order, nextStatus, actor) => {
    if (order?.experience !== EXPERIENCES.QUICK_COMMERCE) {
        throw new ApiError(400, 'This is not a Quick Commerce order.');
    }

    const allowedForActor = actor === 'vendor'
        ? QUICK_COMMERCE_VENDOR_STATUSES
        : QUICK_COMMERCE_RIDER_STATUSES;
    if (!allowedForActor.includes(nextStatus)) {
        throw new ApiError(403, `A ${actor} cannot move an order to ${nextStatus}.`);
    }

    const currentStatus = order?.quickCommerce?.status || QUICK_COMMERCE_ORDER_STATUS.PLACED;
    const legalNext = QUICK_COMMERCE_STATUS_TRANSITIONS[currentStatus] || [];
    if (!legalNext.includes(nextStatus)) {
        throw new ApiError(409, `Cannot move order from ${currentStatus} to ${nextStatus}.`);
    }

    return currentStatus;
};

/**
 * Apply a Quick Commerce status to an order document (does not save).
 *
 * Keeps three things in step: the Quick Commerce status, the coarse Marketplace
 * `status`, and the per-vendor sub-order status that vendor dashboards read.
 *
 * @returns {object} the mutated order
 */
export const applyQuickCommerceStatus = (order, nextStatus) => {
    order.quickCommerce = order.quickCommerce || {};
    order.quickCommerce.status = nextStatus;

    const mappedStatus = QUICK_COMMERCE_STATUS_TO_ORDER_STATUS[nextStatus];
    if (mappedStatus) {
        order.status = mappedStatus;
        order.vendorItems = (order.vendorItems || []).map((vendorItem) => {
            const current = String(vendorItem?.status || 'pending');
            if (current === 'cancelled') return vendorItem;
            const plain = typeof vendorItem.toObject === 'function' ? vendorItem.toObject() : vendorItem;
            return { ...plain, status: mappedStatus };
        });
    }

    const now = new Date();
    if (nextStatus === QUICK_COMMERCE_ORDER_STATUS.ACCEPTED) order.quickCommerce.acceptedAt = now;
    if (nextStatus === QUICK_COMMERCE_ORDER_STATUS.READY) order.quickCommerce.preparedAt = now;
    if (nextStatus === QUICK_COMMERCE_ORDER_STATUS.PICKED_UP) order.quickCommerce.pickedUpAt = now;
    if (nextStatus === QUICK_COMMERCE_ORDER_STATUS.DELIVERED) {
        order.deliveredAt = now;
        // The promise made at checkout, judged against what actually happened.
        const promisedAt = order.quickCommerce.promisedAt
            ? new Date(order.quickCommerce.promisedAt).getTime()
            : null;
        const promisedMins = Number(order.quickCommerce.promisedEtaMinutes);
        if (promisedAt && Number.isFinite(promisedMins)) {
            // Recorded once, here, so "promised vs actual" is a field to
            // aggregate rather than a date subtraction repeated in every query.
            // Rounded up: a delivery that took 12m10s took 13 minutes from the
            // customer's point of view, and rounding down would flatter us.
            order.quickCommerce.actualEtaMinutes = Math.max(
                1,
                Math.ceil((now.getTime() - promisedAt) / 60000)
            );
            order.quickCommerce.slaBreached = now.getTime() > promisedAt + promisedMins * 60 * 1000;
        }
    }

    return order;
};

/**
 * Broadcast a status change to everyone watching the order, and notify the
 * customer. Never throws — a notification failure must not roll back a status
 * the store or rider has already acted on physically.
 */
export const publishQuickCommerceStatus = async (order, nextStatus) => {
    emitToRoom(`order_${order._id}`, 'quick_commerce_status', {
        orderId: String(order.orderId || ''),
        orderRefId: String(order._id),
        status: nextStatus,
        orderStatus: order.status,
        updatedAt: new Date().toISOString(),
    });

    if (!order.userId) return;

    try {
        await createNotification({
            recipientId: order.userId,
            recipientType: 'user',
            title: STATUS_TITLES[nextStatus] || 'Order updated',
            message: STATUS_MESSAGES[nextStatus] || `Your order ${order.orderId} was updated.`,
            type: 'order',
            data: {
                orderId: String(order.orderId || ''),
                orderRefId: String(order._id),
                status: String(nextStatus),
                experience: EXPERIENCES.QUICK_COMMERCE,
            },
        });
    } catch (err) {
        console.warn(`[QC Status] Notification failed for order ${order.orderId}: ${err.message}`);
    }
};
