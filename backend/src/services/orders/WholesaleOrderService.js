/**
 * WholesaleOrderService
 *
 * Owns the state machine for Wholesale (B2B) orders.
 * Executed when order.orderType === 'wholesale'.
 *
 * State machine:
 *   pending → approved → processing → packed → dispatched → delivered
 *   pending / approved → cancelled
 */

import ApiError from '../../utils/ApiError.js';

export const WHOLESALE_STATUSES = [
    'pending', 'approved', 'processing', 'packed', 'dispatched', 'delivered', 'cancelled',
];

const TRANSITIONS = {
    pending:    ['approved', 'cancelled'],
    approved:   ['processing', 'cancelled'],
    processing: ['packed'],
    packed:     ['dispatched'],
    dispatched: ['delivered'],
    delivered:  [],
    cancelled:  [],
};

/**
 * Validate and return the transition if legal.
 * Throws ApiError on invalid transition.
 */
export const assertWholesaleTransition = (currentStatus, nextStatus) => {
    const normalized = String(currentStatus || 'pending').toLowerCase();
    const allowed = TRANSITIONS[normalized] || [];
    if (!allowed.includes(nextStatus)) {
        throw new ApiError(409,
            `Wholesale order cannot move from "${normalized}" to "${nextStatus}". Allowed next states: [${allowed.join(', ') || 'none'}]`
        );
    }
};

/**
 * Apply a status transition to an order using Wholesale rules.
 * Mutates the order object — caller is responsible for saving.
 */
export const applyWholesaleTransition = (order, nextStatus, vendorId) => {
    const vendorItem = (order.vendorItems || []).find(
        (vi) => String(vi.vendorId) === String(vendorId)
    );
    const currentStatus = vendorItem?.status ?? order.status ?? 'pending';
    assertWholesaleTransition(currentStatus, nextStatus);

    order.vendorItems = (order.vendorItems || []).map((vi) =>
        String(vi.vendorId) === String(vendorId)
            ? { ...vi.toObject?.() ?? vi, status: nextStatus }
            : vi
    );

    // Derive top-level status
    const allStatuses = (order.vendorItems || []).map((vi) => vi.status?.toLowerCase());
    if (allStatuses.every((s) => s === 'cancelled'))       order.status = 'cancelled';
    else if (allStatuses.every((s) => s === 'delivered'))  order.status = 'delivered';
    else if (allStatuses.includes('dispatched'))           order.status = 'dispatched';
    else if (allStatuses.includes('packed'))               order.status = 'packed';
    else if (allStatuses.includes('processing'))           order.status = 'processing';
    else if (allStatuses.includes('approved'))             order.status = 'approved';
    else                                                   order.status = 'pending';

    // Timestamp milestones
    const now = new Date();
    if (nextStatus === 'dispatched') order.dispatchedAt = order.dispatchedAt || now;
    if (nextStatus === 'delivered')  order.deliveredAt  = order.deliveredAt  || now;

    return order;
};
