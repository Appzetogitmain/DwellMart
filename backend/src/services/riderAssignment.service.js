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
    RIDER_OFFER_TIMEOUT_SECS,
    RIDER_OFFER_MAX_ATTEMPTS,
} from '../constants/quickCommerce.js';
import { pointToLatLng, haversineDistanceKm } from './quickCommerce.service.js';
import { checkRiderCanAcceptCod } from './deliveryCash.service.js';

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
export const findCandidateRiders = async (pickup, radiusKm, limit = 10, { excludeRiderIds = [] } = {}) => {
    const latitude = Number(pickup?.latitude);
    const longitude = Number(pickup?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

    const freshSince = new Date(Date.now() - RIDER_LOCATION_STALE_AFTER_MS);
    const excludeObjIds = (excludeRiderIds || []).map((id) => new mongoose.Types.ObjectId(id));

    const candidates = await DeliveryBoy.aggregate([
        {
            $geoNear: {
                near: { type: 'Point', coordinates: [longitude, latitude] },
                distanceField: 'distanceMeters',
                maxDistance: radiusKm * 1000,
                spherical: true,
                key: 'location',
                query: {
                    _id: { $nin: excludeObjIds },
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

    const released = await DeliveryBoy.findOneAndUpdate(
        {
            _id: riderId,
            ...(orderId ? { activeOrderId: orderId } : {}),
        },
        update,
        { new: true }
    );

    if (released) {
        setImmediate(() => {
            recoverEscalatedOrdersForRider(released._id).catch((err) => {
                console.error(`[QC_ESCALATED_RECOVERY_FAILED] Auto-recovery error for rider ${released._id}: ${err.message}`);
            });
        });
    }

    return released;
};

/**
 * Try progressively wider radii until a rider is claimed (or found in dry-run mode).
 *
 * @param {object} opts
 * @param {boolean} [opts.dryRun=false]
 *   When true, returns the best candidate WITHOUT calling claimRider.
 *   Used by createRiderOffer so the rider stays AVAILABLE during the offer phase.
 *
 * @returns {Promise<{rider: object|null, radiusKm: number|null, attempts: number, distanceKm: number|null}>}
 */
export const findAndClaimNearestRider = async ({ pickup, orderId, order, radii = RIDER_SEARCH_RADII_KM, excludeRiderIds = [], dryRun = false }) => {
    let attempts = 0;
    const isCod = ['cod', 'cash'].includes(String(order?.paymentMethod || '').toLowerCase());
    const codAmount = isCod ? Number(order?.total || 0) : 0;

    for (const radiusKm of radii) {
        const candidates = await findCandidateRiders(pickup, radiusKm, 10, { excludeRiderIds });
        for (const candidate of candidates) {
            attempts += 1;
            if (isCod) {
                const { allowed } = await checkRiderCanAcceptCod(candidate._id, codAmount);
                if (!allowed) {
                    console.warn(`[Rider Assignment] Rider ${candidate._id} skipped: COD cash limit reached.`);
                    continue;
                }
            }

            if (dryRun) {
                // Return the best eligible candidate without mutating the rider document.
                return { rider: candidate, radiusKm, attempts, distanceKm: candidate.distanceKm };
            }

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
 * Create an offer for the nearest eligible rider WITHOUT marking them busy.
 *
 * Rider lifecycle during offer:
 *   - rider.status         stays 'available'
 *   - rider.activeOrderId  stays null
 *
 * The atomic busy-claim only happens when the rider calls acceptOffer().
 * This prevents silently locking a rider who may never respond.
 *
 * @param {object} order             A persisted Order document.
 * @param {{latitude,longitude}} vendorPoint  Vendor pickup coordinates.
 * @param {string[]} excludeRiderIds Rider ids already tried for this order.
 * @param {number}  attemptNumber    How many offers have been made for this order.
 * @returns {Promise<{offered: boolean, rider: object|null, escalated: boolean}>}
 */
export const createRiderOffer = async (order, vendorPoint, excludeRiderIds = [], attemptNumber = 0) => {
    const orderId = order?._id;
    if (!orderId) return { offered: false, rider: null, escalated: false };

    // Re-check: order may have been taken by another process between calls.
    const freshOrder = await Order.findById(orderId).select('deliveryBoyId quickCommerce.assignment').lean();
    if (freshOrder?.deliveryBoyId) {
        console.log(`[QC_OFFER] Order ${order.orderId} already has a rider — skipping offer.`);
        return { offered: false, rider: null, escalated: false, alreadyAssigned: true };
    }
    if (freshOrder?.quickCommerce?.assignment?.status === QUICK_COMMERCE_ASSIGNMENT_STATUS.OFFER_PENDING) {
        console.log(`[QC_OFFER] Order ${order.orderId} already has a pending offer — skipping.`);
        return { offered: false, rider: null, escalated: false, offerAlreadyPending: true };
    }

    // Find the best available candidate.
    const { rider, radiusKm, attempts: searchAttempts, distanceKm } = await findAndClaimNearestRider({
        pickup: vendorPoint,
        orderId,
        order,
        excludeRiderIds,
        dryRun: true,   // findCandidateRiders only; do NOT call claimRider
    });

    if (!rider) {
        console.log(`[QC_OFFER] No eligible rider found for order ${order.orderId} (attempt ${attemptNumber}).`);
        await escalateUnassignedOrder(order, searchAttempts);
        return { offered: false, rider: null, escalated: true };
    }

    // Write the offer to the order document — no change to the rider document.
    const offerExpiresAt = new Date(Date.now() + RIDER_OFFER_TIMEOUT_SECS * 1000);
    await Order.updateOne(
        {
            _id: orderId,
            $or: [
                { 'quickCommerce.assignment.status': { $in: [
                    QUICK_COMMERCE_ASSIGNMENT_STATUS.PENDING,
                    QUICK_COMMERCE_ASSIGNMENT_STATUS.ESCALATED,
                ] } },
                { 'quickCommerce.assignment.status': { $exists: false } },
                { 'quickCommerce.assignment.status': null },
            ],
            deliveryBoyId: null,
        },
        {
            $set: {
                'quickCommerce.assignment.status':      QUICK_COMMERCE_ASSIGNMENT_STATUS.OFFER_PENDING,
                'quickCommerce.assignment.offeredTo':   rider._id,
                'quickCommerce.assignment.offerExpiresAt': offerExpiresAt,
                'quickCommerce.assignment.attempts':    attemptNumber + 1,
                'quickCommerce.assignment.lastAttemptAt': new Date(),
                'quickCommerce.assignment.searchRadiusKm': radiusKm,
            },
        }
    );

    console.log(`[QC_OFFER] Offered order ${order.orderId} to rider ${rider._id} (${distanceKm} km). Expires in ${RIDER_OFFER_TIMEOUT_SECS}s.`);

    // Notify the rider via socket and DB notification — non-blocking.
    const offerPayload = {
        orderId:        String(order.orderId || ''),
        orderRefId:     String(orderId),
        pickupDistanceKm: distanceKm,
        expiresAt:      offerExpiresAt.toISOString(),
        expiresInSecs:  RIDER_OFFER_TIMEOUT_SECS,
    };
    const { emitToUserRoom } = await import('../socket.js');
    emitToUserRoom(rider._id, 'delivery', 'delivery:order_offer', offerPayload);

    createNotification({
        recipientId:   rider._id,
        recipientType: 'delivery',
        title:         '⚡ New Quick Commerce Order',
        message:       `Order ${order.orderId} is ${distanceKm ?? '—'} km away. Accept within ${RIDER_OFFER_TIMEOUT_SECS} seconds.`,
        type:          'order',
        data: {
            orderId:          String(order.orderId || ''),
            orderRefId:       String(orderId),
            experience:       EXPERIENCES.QUICK_COMMERCE,
            pickupDistanceKm: String(distanceKm ?? ''),
        },
    }).catch(() => null);

    // Schedule timeout: if rider does not accept in time, move to next candidate.
    const offerSnapshot = { orderId: String(orderId), riderId: String(rider._id), offerExpiresAt };
    setTimeout(() => {
        expireRiderOffer(offerSnapshot, vendorPoint, excludeRiderIds, attemptNumber + 1).catch((err) => {
            console.error(`[QC_OFFER_EXPIRE] Unhandled error for order ${order.orderId}:`, err?.message || err);
        });
    }, RIDER_OFFER_TIMEOUT_SECS * 1000 + 500); // +500 ms grace margin

    return { offered: true, rider, escalated: false };
};

/**
 * Build the vendor pickup point and delegate to createRiderOffer.
 * This is the top-level entry point used by the QC_ORDER_READY event handler.
 *
 * Never throws — failure here must not undo a paid order.
 *
 * @param {object} order      A persisted Order document (or lean object).
 * @param {{latitude,longitude}} [pickup] Vendor location (resolved automatically if omitted).
 * @param {{excludeRiderIds?: string[], attemptNumber?: number}} [options]
 * @returns {Promise<{offered: boolean, rider: object|null, escalated: boolean}>}
 */
export const assignRiderForQuickCommerceOrder = async (order, pickup, { excludeRiderIds = [], attemptNumber = 0 } = {}) => {
    const orderId = order?._id;
    if (!orderId) return { offered: false, rider: null, escalated: false };

    if (order.deliveryBoyId) {
        return { offered: false, rider: null, escalated: false, alreadyAssigned: true };
    }

    let vendorPoint = pickup;
    if (!vendorPoint) {
        const vendorId = order.vendorId || order.vendorItems?.[0]?.vendorId;
        if (vendorId) {
            const { default: Vendor } = await import('../models/Vendor.model.js');
            const vendor = await Vendor.findById(vendorId).select('quickCommerceProfile.location').lean();
            vendorPoint = pointToLatLng(vendor?.quickCommerceProfile?.location);
        }
    }

    if (!vendorPoint) {
        console.warn(`[Rider Assignment] Store location missing for order ${order?.orderId || orderId}`);
        await escalateUnassignedOrder(order, 0);
        return { offered: false, rider: null, escalated: true };
    }

    try {
        return await createRiderOffer(order, vendorPoint, excludeRiderIds, attemptNumber);
    } catch (err) {
        console.warn(`[Rider Assignment] createRiderOffer failed for order ${order?.orderId || orderId}: ${err.message}`);
        try { await escalateUnassignedOrder(order, 0); } catch {}
        return { offered: false, rider: null, escalated: true };
    }
};

/**
 * A rider accepted their offer.
 *
 * This is the ONLY place where a rider is marked busy.
 * Flow:
 *   1. Validate the offer is still open and not expired (race-safe).
 *   2. Atomically claim the rider (status → busy, activeOrderId → orderId).
 *   3. Atomically set deliveryBoyId + assignment.status → assigned on the order.
 *   4. Fire all standard assignment notifications.
 *
 * @param {string|ObjectId} riderId
 * @param {string|ObjectId} orderId   The Order _id (not the human orderId).
 * @returns {Promise<{accepted: boolean, order: object|null, rider: object|null}>}
 */
export const acceptOffer = async (riderId, orderId) => {
    // ── 1. Load and validate the offer ──────────────────────────────────────────
    const order = await Order.findById(orderId);
    if (!order) return { accepted: false, reason: 'ORDER_NOT_FOUND' };

    const assignment = order.quickCommerce?.assignment;
    if (assignment?.status !== QUICK_COMMERCE_ASSIGNMENT_STATUS.OFFER_PENDING) {
        return { accepted: false, reason: 'OFFER_NOT_PENDING', currentStatus: assignment?.status };
    }
    if (String(assignment.offeredTo) !== String(riderId)) {
        return { accepted: false, reason: 'NOT_OFFERED_TO_YOU' };
    }
    if (assignment.offerExpiresAt && assignment.offerExpiresAt < new Date()) {
        return { accepted: false, reason: 'OFFER_EXPIRED' };
    }

    // ── 2. Atomic rider claim (makes them BUSY) ──────────────────────────────────
    const claimedRider = await claimRider(riderId, orderId);
    if (!claimedRider) {
        // Rider became unavailable between offer and accept (concurrent order).
        return { accepted: false, reason: 'RIDER_NO_LONGER_AVAILABLE' };
    }

    // ── 3. Atomic order claim ────────────────────────────────────────────────────
    const orderResult = await Order.findOneAndUpdate(
        {
            _id: orderId,
            deliveryBoyId: null,
            'quickCommerce.assignment.status': QUICK_COMMERCE_ASSIGNMENT_STATUS.OFFER_PENDING,
            'quickCommerce.assignment.offeredTo': new mongoose.Types.ObjectId(riderId),
        },
        {
            $set: {
                deliveryBoyId: claimedRider._id,
                'quickCommerce.assignment.status':       QUICK_COMMERCE_ASSIGNMENT_STATUS.ASSIGNED,
                'quickCommerce.assignment.assignedAt':   new Date(),
                'quickCommerce.assignment.lastAttemptAt': new Date(),
                'quickCommerce.assignment.offeredTo':    null,
                'quickCommerce.assignment.offerExpiresAt': null,
            },
        },
        { new: true }
    );

    if (!orderResult) {
        // Another process raced us — release the rider and bail.
        console.warn(`[QC_ACCEPT_OFFER] Order ${orderId} claim race lost — releasing rider ${riderId}.`);
        await releaseRider(riderId, orderId);
        return { accepted: false, reason: 'RACE_LOST' };
    }

    console.log(`[QC_ACCEPT_OFFER] Rider ${riderId} accepted order ${order.orderId}.`);

    // ── 4. Notifications ─────────────────────────────────────────────────────────
    const distanceKm = null; // not re-calculated here; displayed in the offer modal already
    await notifyRiderAssigned(orderResult, claimedRider, distanceKm);

    return { accepted: true, order: orderResult, rider: claimedRider };
};

/**
 * Timer callback — the rider did not respond within RIDER_OFFER_TIMEOUT_SECS.
 *
 * Atomically marks the offer as expired on the order, leaves the rider
 * AVAILABLE (they were never claimed), then immediately tries to find the
 * next eligible rider for a new offer.
 *
 * ESCALATED is only written when there is no next rider or the maximum
 * attempt count has been reached.
 *
 * @param {{ orderId, riderId, offerExpiresAt }} offerSnapshot Snapshot captured at offer creation.
 * @param {{ latitude, longitude }} vendorPoint
 * @param {string[]} priorExcludeIds  Rider ids excluded before this offer.
 * @param {number}   nextAttemptNumber
 */
export const expireRiderOffer = async (offerSnapshot, vendorPoint, priorExcludeIds, nextAttemptNumber) => {
    const { orderId, riderId } = offerSnapshot;

    // Atomic guard: only expire if the offer is still pending for THIS rider.
    const expired = await Order.findOneAndUpdate(
        {
            _id: orderId,
            deliveryBoyId: null,
            'quickCommerce.assignment.status': QUICK_COMMERCE_ASSIGNMENT_STATUS.OFFER_PENDING,
            'quickCommerce.assignment.offeredTo': new mongoose.Types.ObjectId(riderId),
        },
        {
            $set: {
                'quickCommerce.assignment.status':        QUICK_COMMERCE_ASSIGNMENT_STATUS.PENDING,
                'quickCommerce.assignment.offeredTo':     null,
                'quickCommerce.assignment.offerExpiresAt': null,
                'quickCommerce.assignment.lastAttemptAt': new Date(),
            },
            $addToSet: {
                'quickCommerce.assignment.offerRejectedBy': new mongoose.Types.ObjectId(riderId),
            },
        },
        { new: true }
    );

    if (!expired) {
        // Offer was accepted or already processed by another path — nothing to do.
        console.log(`[QC_OFFER_EXPIRE] Order ${orderId} offer was already resolved — skipping expiry.`);
        return;
    }

    console.log(`[QC_OFFER_EXPIRE] Offer expired for rider ${riderId} on order ${expired.orderId}. Attempt ${nextAttemptNumber}.`);

    // Rider notification: let them know the offer is gone.
    const { emitToUserRoom } = await import('../socket.js');
    emitToUserRoom(riderId, 'delivery', 'delivery:offer_expired', {
        orderId:    String(expired.orderId || ''),
        orderRefId: String(orderId),
    });

    // Check attempt cap.
    if (nextAttemptNumber >= RIDER_OFFER_MAX_ATTEMPTS) {
        console.log(`[QC_OFFER_EXPIRE] Max attempts (${RIDER_OFFER_MAX_ATTEMPTS}) reached for order ${expired.orderId}. Escalating.`);
        await escalateUnassignedOrder(expired, nextAttemptNumber);
        return;
    }

    // Try the next rider.
    const excludeIds = [
        ...priorExcludeIds.map(String),
        String(riderId),
        ...(expired.quickCommerce?.assignment?.offerRejectedBy || []).map(String),
    ];
    await createRiderOffer(expired, vendorPoint, excludeIds, nextAttemptNumber);
};

/** Tell the rider, the customer, vendor and the order room that a rider is on it. */
const notifyRiderAssigned = async (order, rider, distanceKm) => {
    const vendorId = order.vendorId || order.vendorItems?.[0]?.vendorId;
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

    if (vendorId) {
        tasks.push(
            createNotification({
                recipientId: vendorId,
                recipientType: 'vendor',
                title: 'Delivery partner assigned',
                message: `Delivery partner ${rider.name} has been assigned to order ${order.orderId}.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId || ''),
                    experience: EXPERIENCES.QUICK_COMMERCE,
                    riderId: String(rider._id),
                },
            })
        );
    }

    await Promise.allSettled(tasks);

    const payload = {
        orderId: String(order.orderId || ''),
        orderRefId: String(order._id),
        status: String(order.status || ''),
        deliveryBoyId: String(rider._id),
        rider: {
            id: String(rider._id),
            name: rider.name,
            phone: rider.phone,
            vehicleType: rider.vehicleType,
            vehicleNumber: rider.vehicleNumber,
        },
    };

    emitToRoom(`order_${order._id}`, 'rider_assigned', payload);
    emitToRoom('admin', 'delivery_assigned', payload);
    const { emitToUserRoom } = await import('../socket.js');
    emitToUserRoom(rider._id, 'delivery', 'delivery:assigned', payload);
    if (vendorId) {
        emitToUserRoom(vendorId, 'vendor', 'delivery_assigned', payload);
        emitToRoom(`vendor_${vendorId}`, 'delivery_assigned', payload);
    }
};

/**
 * Handle rider rejection of an offer.
 *
 * The rider was NEVER claimed (still AVAILABLE, activeOrderId still null),
 * so there is NO releaseRider() call here. We just:
 *   1. Atomically clear the offer fields (OFFER_PENDING → PENDING).
 *   2. Add rejecting rider to offerRejectedBy.
 *   3. Attempt the next rider.
 */
export const rejectAssignment = async (riderId, orderId, reason = '') => {
    const order = await Order.findById(orderId);
    if (!order) return { offered: false, rider: null, escalated: false };

    const assignment = order.quickCommerce?.assignment;
    const currentStatus = assignment?.status;

    if (currentStatus === QUICK_COMMERCE_ASSIGNMENT_STATUS.ASSIGNED) {
        // Rider already accepted (unusual path) — behave like a post-accept rejection.
        await releaseRider(riderId, order._id);
        await Order.updateOne(
            { _id: order._id },
            {
                $set: {
                    deliveryBoyId: null,
                    'quickCommerce.assignment.status':       QUICK_COMMERCE_ASSIGNMENT_STATUS.PENDING,
                    'quickCommerce.assignment.lastAttemptAt': new Date(),
                    'quickCommerce.assignment.offeredTo':    null,
                    'quickCommerce.assignment.offerExpiresAt': null,
                },
                $addToSet: {
                    'quickCommerce.assignment.offerRejectedBy': new mongoose.Types.ObjectId(riderId),
                },
            }
        );
    } else {
        // Normal path: offer_pending rejection — rider was never busy.
        await Order.updateOne(
            {
                _id: order._id,
                'quickCommerce.assignment.offeredTo': new mongoose.Types.ObjectId(riderId),
            },
            {
                $set: {
                    'quickCommerce.assignment.status':        QUICK_COMMERCE_ASSIGNMENT_STATUS.PENDING,
                    'quickCommerce.assignment.offeredTo':     null,
                    'quickCommerce.assignment.offerExpiresAt': null,
                    'quickCommerce.assignment.lastAttemptAt': new Date(),
                },
                $addToSet: {
                    'quickCommerce.assignment.offerRejectedBy': new mongoose.Types.ObjectId(riderId),
                },
            }
        );
    }

    const updatedOrder = await Order.findById(order._id);
    const attempts = Number(updatedOrder?.quickCommerce?.assignment?.attempts || 0);
    const rejectedBy = (updatedOrder?.quickCommerce?.assignment?.offerRejectedBy || []).map(String);

    if (attempts >= RIDER_OFFER_MAX_ATTEMPTS) {
        await escalateUnassignedOrder(updatedOrder, attempts);
        return { offered: false, rider: null, escalated: true };
    }

    // Resolve vendor pickup point for the next offer.
    const vendorId = updatedOrder.vendorId || updatedOrder.vendorItems?.[0]?.vendorId;
    let vendorPoint = null;
    if (vendorId) {
        const { default: Vendor } = await import('../models/Vendor.model.js');
        const vendor = await Vendor.findById(vendorId).select('quickCommerceProfile.location').lean();
        vendorPoint = pointToLatLng(vendor?.quickCommerceProfile?.location);
    }
    if (!vendorPoint) {
        await escalateUnassignedOrder(updatedOrder, attempts);
        return { offered: false, rider: null, escalated: true };
    }

    return createRiderOffer(updatedOrder, vendorPoint, rejectedBy, attempts);
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
    const order = await Order.findById(orderId).select('orderId userId _id deliveryBoyId experience vendorId vendorItems');
    if (!order) return { assigned: false, rider: null, escalated: false };
    if (order.deliveryBoyId) {
        return { assigned: false, rider: null, escalated: false, alreadyAssigned: true };
    }
    return assignRiderForQuickCommerceOrder(order, pickup);
};

/** Guard used by callers that accept a rider id from a request body. */
export const isValidRiderId = (value) => mongoose.isValidObjectId(value);

/**
 * Attempt to automatically recover and assign the highest-priority ESCALATED Quick Commerce order
 * when a Quick Commerce rider becomes available.
 *
 * Priority rules:
 * 1. Oldest escalatedAt ASC ('quickCommerce.assignment.escalatedAt': 1)
 * 2. Oldest createdAt ASC (createdAt: 1)
 *
 * Concurrency & Business Rules:
 * - One rider = One active order (stops immediately upon 1 successful recovery).
 * - Atomic order claim guard (`Order.updateOne({ _id, deliveryBoyId: null, 'quickCommerce.assignment.status': 'ESCALATED' })`).
 * - Atomic rider claim guard (`claimRider(riderId, orderId)`).
 * - Multi-party real-time notifications (Rider, Customer, Vendor, Admin).
 * - Payment status MUST be 'paid' / verified.
 *
 * @param {string|mongoose.Types.ObjectId} riderId
 * @returns {Promise<{recovered: boolean, order: object|null, rider: object|null}>}
 */
export const recoverEscalatedOrdersForRider = async (riderId) => {
    if (!riderId || !mongoose.isValidObjectId(riderId)) {
        return { recovered: false, order: null, rider: null };
    }

    console.log(`[QC_ESCALATED_RECOVERY_STARTED] Checking rider ${riderId}`);

    const rider = await DeliveryBoy.findById(riderId);
    if (!rider) {
        console.log(`[QC_ESCALATED_RECOVERY_NO_MATCH] Rider ${riderId} not found.`);
        return { recovered: false, order: null, rider: null };
    }

    const freshSince = new Date(Date.now() - RIDER_LOCATION_STALE_AFTER_MS);
    const isEligibleRider = (
        rider.isActive === true &&
        rider.isAvailable === true &&
        rider.status === 'available' &&
        rider.applicationStatus === 'approved' &&
        rider.activeOrderId === null &&
        Array.isArray(rider.experiences) &&
        rider.experiences.includes(EXPERIENCES.QUICK_COMMERCE) &&
        rider.lastLocationAt &&
        rider.lastLocationAt >= freshSince
    );

    if (!isEligibleRider) {
        console.log(`[QC_ESCALATED_RECOVERY_NO_MATCH] Rider ${rider._id} (${rider.name}) is not currently eligible for auto-recovery.`);
        return { recovered: false, order: null, rider: null };
    }

    const escalatedOrders = await Order.find({
        experience: EXPERIENCES.QUICK_COMMERCE,
        paymentStatus: 'paid',
        status: { $nin: ['cancelled', 'delivered'] },
        deliveryBoyId: null,
        'quickCommerce.assignment.status': {
            $in: [
                QUICK_COMMERCE_ASSIGNMENT_STATUS.ESCALATED,
                QUICK_COMMERCE_ASSIGNMENT_STATUS.PENDING,
            ],
        },
    })
        .sort({
            'quickCommerce.assignment.escalatedAt': 1,
            createdAt: 1,
        })
        .lean();

    if (!escalatedOrders || escalatedOrders.length === 0) {
        console.log(`[QC_ESCALATED_RECOVERY_NO_MATCH] No unassigned Quick Commerce orders waiting in queue.`);
        return { recovered: false, order: null, rider: null };
    }

    const riderPoint = pointToLatLng(rider.location);
    if (!riderPoint) {
        console.log(`[QC_ESCALATED_RECOVERY_NO_MATCH] Rider ${rider._id} has invalid location coordinates.`);
        return { recovered: false, order: null, rider: null };
    }

    const { default: Vendor } = await import('../models/Vendor.model.js');

    for (const order of escalatedOrders) {
        const vendorId = order.vendorId || order.vendorItems?.[0]?.vendorId;
        if (!vendorId) continue;

        const vendor = await Vendor.findById(vendorId).select('quickCommerceProfile.location').lean();
        const vendorPoint = pointToLatLng(vendor?.quickCommerceProfile?.location);
        if (!vendorPoint) continue;

        const distanceKm = haversineDistanceKm(riderPoint, vendorPoint);
        const maxRadiusKm = RIDER_SEARCH_RADII_KM[RIDER_SEARCH_RADII_KM.length - 1]; // 20km
        if (distanceKm > maxRadiusKm) {
            console.log(`[QC_ESCALATED_RECOVERY_NO_MATCH] Order ${order.orderId} pickup is ${distanceKm} km away (> ${maxRadiusKm} km).`);
            continue;
        }

        const isCod = ['cod', 'cash'].includes(String(order.paymentMethod || '').toLowerCase());
        if (isCod) {
            const { allowed } = await checkRiderCanAcceptCod(rider._id, Number(order.total || 0));
            if (!allowed) {
                console.log(`[QC_ESCALATED_RECOVERY_NO_MATCH] Rider ${rider._id} skipped for order ${order.orderId}: COD cash limit reached.`);
                continue;
            }
        }

        console.log(`[QC_ESCALATED_RECOVERY_CANDIDATE_FOUND] Offering order ${order.orderId} to rider ${rider._id} (${distanceKm} km)`);

        // Delegate to createRiderOffer — rider stays AVAILABLE until they accept.
        const fullOrder = await Order.findById(order._id);
        if (!fullOrder) continue;

        // Reset to PENDING so createRiderOffer's guard condition passes.
        const resetResult = await Order.updateOne(
            {
                _id: order._id,
                deliveryBoyId: null,
                'quickCommerce.assignment.status': QUICK_COMMERCE_ASSIGNMENT_STATUS.ESCALATED,
            },
            {
                $set: {
                    'quickCommerce.assignment.status': QUICK_COMMERCE_ASSIGNMENT_STATUS.PENDING,
                },
            }
        );
        if (resetResult.modifiedCount === 0) {
            console.warn(`[QC_ESCALATED_RECOVERY_RACE] Order ${order.orderId} was modified by another process — skipping.`);
            continue;
        }

        const refreshedOrder = await Order.findById(order._id);
        const existingRejectedBy = (refreshedOrder.quickCommerce?.assignment?.offerRejectedBy || []).map(String);
        const result = await createRiderOffer(
            refreshedOrder,
            vendorPoint,
            existingRejectedBy,
            Number(refreshedOrder.quickCommerce?.assignment?.attempts || 0)
        );

        if (result.offered) {
            console.log(`[QC_ESCALATED_RECOVERY_COMPLETED] Offer sent for order ${order.orderId} to rider ${rider._id}`);
            return { recovered: true, order: refreshedOrder, rider };
        }
    }

    console.log(`[QC_ESCALATED_RECOVERY_NO_MATCH] No suitable escalated order found within radius for rider ${rider._id}`);
    return { recovered: false, order: null, rider: null };
};

/**
 * Background worker sweep for escalated Quick Commerce order recovery.
 */
export const sweepAndRecoverEscalatedOrders = async () => {
    try {
        const freshSince = new Date(Date.now() - RIDER_LOCATION_STALE_AFTER_MS);
        const availableRiders = await DeliveryBoy.find({
            isActive: true,
            isAvailable: true,
            status: 'available',
            applicationStatus: 'approved',
            activeOrderId: null,
            experiences: EXPERIENCES.QUICK_COMMERCE,
            lastLocationAt: { $gte: freshSince },
        }).select('_id name').lean();

        if (availableRiders.length === 0) return;

        for (const rider of availableRiders) {
            await recoverEscalatedOrdersForRider(rider._id);
        }
    } catch (err) {
        console.error('[QC_ESCALATED_RECOVERY_FAILED] Background sweep error:', err?.message || err);
    }
};

let _escalatedWorkerInterval = null;

export const startEscalatedOrderRecoveryWorker = (intervalMs = 2 * 60_000) => {
    if (_escalatedWorkerInterval) return;
    _escalatedWorkerInterval = setInterval(sweepAndRecoverEscalatedOrders, intervalMs);
    _escalatedWorkerInterval.unref();
    console.log(`[EscalatedOrderRecoveryWorker] Started (sweep every ${intervalMs / 60_000} minutes)`);
};

export const stopEscalatedOrderRecoveryWorker = () => {
    if (_escalatedWorkerInterval) {
        clearInterval(_escalatedWorkerInterval);
        _escalatedWorkerInterval = null;
    }
};
