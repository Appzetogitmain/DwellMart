/**
 * Quick Commerce rider assignment.
 *
 * Assigns the nearest available rider to a Quick Commerce order, without a race
 * window and without ever leaving an order silently unassigned.
 *
 * Two properties matter here and both are load-bearing:
 *
 * 1. **The claim is atomic.** Candidates are ranked by distance, then claimed
 *    with a `findOneAndUpdate` filtered on `{ activeOrderId: null }`. Two orders
 *    arriving in the same second cannot both take the same rider — the loser's
 *    filter simply does not match and it moves to the next candidate. This is
 *    the same optimistic-guard pattern `placeOrder` uses for stock decrement.
 *
 * 2. **Failure is a designed state, not an absence.** When no rider is found at
 *    any radius the order is marked `escalated` and surfaced in an admin queue.
 *    An order must never stall with nobody aware of it.
 */

import mongoose from 'mongoose';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Order from '../models/Order.model.js';
import { createNotification } from './notification.service.js';
import { emitToRoom } from '../socket.js';
import { EXPERIENCES } from '../constants/experiences.js';
import {
    RIDER_SEARCH_RADII_KM,
    RIDER_LOCATION_STALE_AFTER_MS,
    QUICK_COMMERCE_ASSIGNMENT_STATUS,
} from '../constants/quickCommerce.js';

/**
 * Rank free, approved, Quick Commerce riders by distance from a pickup point.
 *
 * Staleness is filtered here rather than at claim time: a rider whose pin is
 * twenty minutes old is not "nearest to the store", they are merely last seen
 * near the store.
 *
 * @param {{latitude:number, longitude:number}} pickup Vendor location.
 * @param {number} radiusKm
 * @param {number} [limit=10]
 * @returns {Promise<Array<{_id: any, distanceKm: number, name: string}>>}
 */
export const findCandidateRiders = async (pickup, radiusKm, limit = 10) => {
    const latitude = Number(pickup?.latitude);
    const longitude = Number(pickup?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

    const freshSince = new Date(Date.now() - RIDER_LOCATION_STALE_AFTER_MS);

    const candidates = await DeliveryBoy.aggregate([
        {
            $geoNear: {
                near: { type: 'Point', coordinates: [longitude, latitude] },
                distanceField: 'distanceMeters',
                maxDistance: radiusKm * 1000,
                spherical: true,
                key: 'location',
                query: {
                    isActive: true,
                    isAvailable: true,
                    applicationStatus: 'approved',
                    status: 'available',
                    activeOrderId: null,
                    experiences: EXPERIENCES.QUICK_COMMERCE,
                    lastLocationAt: { $gte: freshSince },
                },
            },
        },
        { $limit: limit },
        { $project: { _id: 1, name: 1, phone: 1, distanceMeters: 1 } },
    ]);

    return candidates.map((rider) => ({
        ...rider,
        distanceKm: Number((rider.distanceMeters / 1000).toFixed(2)),
    }));
};

/**
 * Claim a specific rider for an order, atomically.
 *
 * @returns {Promise<object|null>} the claimed rider, or null if someone else
 *   won the race (in which case the caller should try the next candidate).
 */
export const claimRider = async (riderId, orderId) => {
    return DeliveryBoy.findOneAndUpdate(
        {
            _id: riderId,
            // The guard: only a genuinely free rider can be claimed.
            activeOrderId: null,
            status: 'available',
            isAvailable: true,
            isActive: true,
            applicationStatus: 'approved',
        },
        {
            $set: {
                activeOrderId: orderId,
                status: 'busy',
            },
        },
        { new: true }
    ).select('name phone vehicleType vehicleNumber avatar location');
};

/**
 * Release a rider back to the pool once their order is finished.
 * Scoped to the order so a late release cannot free a rider who has already
 * been assigned something else.
 */
export const releaseRider = async (riderId, orderId, { incrementDeliveries = false } = {}) => {
    if (!riderId) return null;

    const update = {
        $set: { activeOrderId: null, status: 'available' },
    };
    if (incrementDeliveries) {
        update.$inc = { totalDeliveries: 1 };
    }

    return DeliveryBoy.findOneAndUpdate(
        {
            _id: riderId,
            ...(orderId ? { activeOrderId: orderId } : {}),
        },
        update,
        { new: true }
    );
};

/**
 * Try progressively wider radii until a rider is claimed.
 *
 * @returns {Promise<{rider: object|null, radiusKm: number|null, attempts: number}>}
 */
export const findAndClaimNearestRider = async ({ pickup, orderId, radii = RIDER_SEARCH_RADII_KM }) => {
    let attempts = 0;

    for (const radiusKm of radii) {
        const candidates = await findCandidateRiders(pickup, radiusKm);
        for (const candidate of candidates) {
            attempts += 1;
            const claimed = await claimRider(candidate._id, orderId);
            if (claimed) {
                return { rider: claimed, radiusKm, attempts, distanceKm: candidate.distanceKm };
            }
            // Lost the race for this rider — the next candidate is still valid.
        }
    }

    return { rider: null, radiusKm: null, attempts, distanceKm: null };
};

/**
 * Assign a rider to a placed Quick Commerce order and record the outcome.
 *
 * Never throws: assignment runs after the order transaction has committed, so a
 * failure here must degrade to escalation, not undo a paid order.
 *
 * @param {object} order      A persisted Order document (or lean object).
 * @param {{latitude:number, longitude:number}} pickup Vendor location.
 * @returns {Promise<{assigned: boolean, rider: object|null, escalated: boolean}>}
 */
export const assignRiderForQuickCommerceOrder = async (order, pickup) => {
    const orderId = order?._id;
    if (!orderId) return { assigned: false, rider: null, escalated: false };

    try {
        const { rider, radiusKm, attempts, distanceKm } = await findAndClaimNearestRider({
            pickup,
            orderId,
        });

        if (rider) {
            await Order.updateOne(
                { _id: orderId },
                {
                    $set: {
                        deliveryBoyId: rider._id,
                        'quickCommerce.assignment.status': QUICK_COMMERCE_ASSIGNMENT_STATUS.ASSIGNED,
                        'quickCommerce.assignment.attempts': attempts,
                        'quickCommerce.assignment.lastAttemptAt': new Date(),
                        'quickCommerce.assignment.assignedAt': new Date(),
                        'quickCommerce.assignment.searchRadiusKm': radiusKm,
                    },
                }
            );

            await notifyRiderAssigned(order, rider, distanceKm);
            return { assigned: true, rider, escalated: false };
        }

        await escalateUnassignedOrder(order, attempts);
        return { assigned: false, rider: null, escalated: true };
    } catch (err) {
        // A broken assignment must still be visible to an operator.
        console.warn(`[Rider Assignment] Failed for order ${order?.orderId || orderId}: ${err.message}`);
        try {
            await escalateUnassignedOrder(order, 0);
        } catch (escalationErr) {
            console.error(`[Rider Assignment] Escalation also failed for order ${orderId}: ${escalationErr.message}`);
        }
        return { assigned: false, rider: null, escalated: true };
    }
};

/** Tell the rider, the customer and the order room that a rider is on it. */
const notifyRiderAssigned = async (order, rider, distanceKm) => {
    const tasks = [
        createNotification({
            recipientId: rider._id,
            recipientType: 'delivery',
            title: 'New Quick Commerce order',
            message: `Order ${order.orderId} is assigned to you. Pickup is ${distanceKm ?? '—'} km away.`,
            type: 'order',
            data: {
                orderId: String(order.orderId || ''),
                orderRefId: String(order._id),
                experience: EXPERIENCES.QUICK_COMMERCE,
                pickupDistanceKm: String(distanceKm ?? ''),
            },
        }),
    ];

    if (order.userId) {
        tasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Delivery partner assigned',
                message: `${rider.name} will deliver your order ${order.orderId}.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId || ''),
                    experience: EXPERIENCES.QUICK_COMMERCE,
                },
            })
        );
    }

    await Promise.allSettled(tasks);

    emitToRoom(`order_${order._id}`, 'rider_assigned', {
        orderId: String(order.orderId || ''),
        orderRefId: String(order._id),
        rider: {
            id: String(rider._id),
            name: rider.name,
            phone: rider.phone,
            vehicleType: rider.vehicleType,
            vehicleNumber: rider.vehicleNumber,
        },
    });
};

/**
 * No rider could be claimed. Record it, put the order in the admin queue, and
 * tell the customer their order will take longer — rather than letting them
 * watch an ETA quietly expire.
 */
export const escalateUnassignedOrder = async (order, attempts = 0) => {
    await Order.updateOne(
        { _id: order._id },
        {
            $set: {
                'quickCommerce.assignment.status': QUICK_COMMERCE_ASSIGNMENT_STATUS.ESCALATED,
                'quickCommerce.assignment.attempts': attempts,
                'quickCommerce.assignment.lastAttemptAt': new Date(),
                'quickCommerce.assignment.escalatedAt': new Date(),
                'quickCommerce.assignment.searchRadiusKm': RIDER_SEARCH_RADII_KM[RIDER_SEARCH_RADII_KM.length - 1],
            },
        }
    );

    const tasks = [];

    if (order.userId) {
        tasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Your order may take a little longer',
                message: `We are still finding a delivery partner for order ${order.orderId}. Your order is confirmed and we will update you shortly.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId || ''),
                    experience: EXPERIENCES.QUICK_COMMERCE,
                    reason: 'NO_RIDER_AVAILABLE',
                },
            })
        );
    }

    await Promise.allSettled(tasks);

    // The admin room is already joined by every admin socket.
    emitToRoom('admin', 'quick_commerce_order_unassigned', {
        orderId: String(order.orderId || ''),
        orderRefId: String(order._id),
        attempts,
        escalatedAt: new Date().toISOString(),
    });
};

/**
 * Retry assignment for an order that previously escalated.
 * Used by the admin queue's "retry" action.
 */
export const retryAssignment = async (orderId, pickup) => {
    const order = await Order.findById(orderId).select('orderId userId _id deliveryBoyId experience');
    if (!order) return { assigned: false, rider: null, escalated: false };
    if (order.deliveryBoyId) {
        return { assigned: false, rider: null, escalated: false, alreadyAssigned: true };
    }
    return assignRiderForQuickCommerceOrder(order, pickup);
};

/** Guard used by callers that accept a rider id from a request body. */
export const isValidRiderId = (value) => mongoose.isValidObjectId(value);
