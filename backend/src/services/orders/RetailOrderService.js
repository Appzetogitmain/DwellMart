/**
 * RetailOrderService
 *
 * Owns the state machine for Retail (B2C) orders.
 * Executed when order.orderType === 'retail' or experience === 'marketplace'.
 *
 * State machine:
 *   pending → confirmed → packed → shipped → out_for_delivery → delivered
 *   pending / confirmed → cancelled
 */

import ApiError from '../../utils/ApiError.js';

export const RETAIL_STATUSES = [
    'pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled',
];

const TRANSITIONS = {
    pending:          ['confirmed', 'cancelled'],
    confirmed:        ['packed', 'cancelled'],
    packed:           ['shipped', 'cancelled'],
    shipped:          ['out_for_delivery'],
    out_for_delivery: ['delivered'],
    delivered:        [],
    cancelled:        [],
    // Legacy statuses kept for backward-compat with existing orders
    processing:       ['shipped', 'cancelled'],
};

/**
 * Validate and return the transition if legal.
 * Throws ApiError on invalid transition.
 */
export const assertRetailTransition = (currentStatus, nextStatus) => {
    const normalized = String(currentStatus || 'pending').toLowerCase();
    const allowed = TRANSITIONS[normalized] || [];
    if (!allowed.includes(nextStatus)) {
        throw new ApiError(409,
            `Retail order cannot move from "${normalized}" to "${nextStatus}". Allowed next states: [${allowed.join(', ') || 'none'}]`
        );
    }
};

/**
 * Apply a status transition to an order using Retail rules.
 * Mutates the order object — caller is responsible for saving.
 */
export const applyRetailTransition = (order, nextStatus, vendorId) => {
    // Find vendor item and validate current status
    const vendorItem = (order.vendorItems || []).find(
        (vi) => String(vi.vendorId) === String(vendorId)
    );
    const currentStatus = vendorItem?.status ?? order.status ?? 'pending';
    assertRetailTransition(currentStatus, nextStatus);

    // Update the vendor-specific item status
    order.vendorItems = (order.vendorItems || []).map((vi) =>
        String(vi.vendorId) === String(vendorId)
            ? { ...vi.toObject?.() ?? vi, status: nextStatus }
            : vi
    );

    // Derive top-level status from all vendor items
    const allStatuses = (order.vendorItems || []).map((vi) => vi.status?.toLowerCase());
    if (allStatuses.every((s) => s === 'cancelled'))       order.status = 'cancelled';
    else if (allStatuses.every((s) => s === 'delivered'))   order.status = 'delivered';
    else if (allStatuses.includes('shipped'))               order.status = 'shipped';
    else if (allStatuses.includes('packed'))                order.status = 'packed';
    else if (allStatuses.includes('confirmed'))             order.status = 'confirmed';
    else                                                    order.status = 'pending';

    // Timestamp milestones
    const now = new Date();
    if (nextStatus === 'shipped')   order.shippedAt   = order.shippedAt   || now;
    if (nextStatus === 'delivered') order.deliveredAt = order.deliveredAt || now;

    return order;
};
