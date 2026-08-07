/**
 * QuickCommerceOrderService
 *
 * Owns the state machine for Quick Commerce orders.
 * Executed when order.orderType === 'quick_commerce'
 * (or order.experience === 'quick_commerce').
 *
 * State machine:
 *   pending → accepted → preparing → ready → picked_up → delivered
 *   Any state → cancelled (before picked_up)
 */

import ApiError from '../../utils/ApiError.js';

export const QC_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'];

const TRANSITIONS = {
    pending:   ['accepted', 'cancelled'],
    accepted:  ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready:     ['picked_up'],
    picked_up: ['delivered'],
    delivered: [],
    cancelled: [],
};

/**
 * Validate and return the transition if legal.
 * Throws ApiError on invalid transition.
 */
export const assertQCTransition = (currentStatus, nextStatus) => {
    const normalized = String(currentStatus || 'pending').toLowerCase();
    const allowed = TRANSITIONS[normalized] || [];
    if (!allowed.includes(nextStatus)) {
        throw new ApiError(409,
            `Quick Commerce order cannot move from "${normalized}" to "${nextStatus}". Allowed next states: [${allowed.join(', ') || 'none'}]`
        );
    }
};

/**
 * Apply a status transition to an order using Quick Commerce rules.
 * Mutates the order object — caller is responsible for saving.
 */
export const applyQCTransition = (order, nextStatus, vendorId) => {
    assertQCTransition(order.quickCommerce?.status ?? order.status, nextStatus);

    if (!order.quickCommerce) order.quickCommerce = {};
    order.quickCommerce.status = nextStatus;
    order.status = nextStatus;

    // Timestamp milestones
    const now = new Date();
    if (nextStatus === 'accepted')   order.quickCommerce.acceptedAt   = now;
    if (nextStatus === 'preparing')  order.quickCommerce.preparingAt  = now;
    if (nextStatus === 'ready')      order.quickCommerce.readyAt      = now;
    if (nextStatus === 'picked_up')  order.quickCommerce.pickedUpAt   = now;
    if (nextStatus === 'delivered')  order.quickCommerce.deliveredAt  = now;
    if (nextStatus === 'cancelled')  order.quickCommerce.cancelledAt  = now;

    return order;
};
