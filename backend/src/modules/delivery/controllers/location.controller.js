/**
 * Rider location reporting and live tracking.
 *
 * Writes BOTH shapes on every ping:
 *   - `currentLocation` {lat, lng}      — the legacy field, still read elsewhere
 *   - `location`        GeoJSON Point   — the geo-queryable field assignment uses
 *
 * This is the dual-write step of the migration: nothing reads only the new field
 * until the backfill has run and stabilised, and rollback stays trivial because
 * the old field is never stopped.
 */

import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import mongoose from 'mongoose';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import Order from '../../../models/Order.model.js';
import { emitToRoom } from '../../../socket.js';
import {
    LATITUDE_BOUNDS,
    LONGITUDE_BOUNDS,
    RIDER_LOCATION_MIN_INTERVAL_MS,
} from '../../../constants/quickCommerce.js';
import { EXPERIENCES } from '../../../constants/experiences.js';

// PATCH /api/delivery/location
export const updateRiderLocation = asyncHandler(async (req, res) => {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);

    if (!Number.isFinite(latitude) || latitude < LATITUDE_BOUNDS.min || latitude > LATITUDE_BOUNDS.max) {
        throw new ApiError(400, 'Invalid latitude.');
    }
    if (!Number.isFinite(longitude) || longitude < LONGITUDE_BOUNDS.min || longitude > LONGITUDE_BOUNDS.max) {
        throw new ApiError(400, 'Invalid longitude.');
    }

    const rider = await DeliveryBoy.findById(req.user.id).select('lastLocationAt activeOrderId name');
    if (!rider) throw new ApiError(404, 'Delivery partner not found.');

    // Server-side throttle. The client pings every ~10-15s; this only rejects
    // pathological rates, so a slightly early retry is not an error the rider
    // needs to see.
    const lastAt = rider.lastLocationAt ? new Date(rider.lastLocationAt).getTime() : 0;
    if (lastAt && Date.now() - lastAt < RIDER_LOCATION_MIN_INTERVAL_MS) {
        return res.status(200).json(
            new ApiResponse(200, { throttled: true }, 'Location received.')
        );
    }

    const now = new Date();
    await DeliveryBoy.updateOne(
        { _id: req.user.id },
        {
            $set: {
                // Legacy shape — kept in step so existing readers never break.
                'currentLocation.lat': latitude,
                'currentLocation.lng': longitude,
                // GeoJSON: [lng, lat], the reverse of the line above.
                location: { type: 'Point', coordinates: [longitude, latitude] },
                lastLocationAt: now,
            },
        }
    );

    // Stream the position to whoever is watching this order.
    if (rider.activeOrderId) {
        emitToRoom(`order_${rider.activeOrderId}`, 'rider_location', {
            orderRefId: String(rider.activeOrderId),
            riderId: String(rider._id),
            latitude,
            longitude,
            at: now.toISOString(),
        });
    } else {
        setImmediate(() => {
            import('../../../services/riderAssignment.service.js').then(({ recoverEscalatedOrdersForRider }) => {
                recoverEscalatedOrdersForRider(req.user.id).catch(() => null);
            });
        });
    }

    res.status(200).json(
        new ApiResponse(200, { latitude, longitude, at: now, throttled: false }, 'Location updated.')
    );
});

// GET /api/delivery/active-order
export const getActiveOrder = asyncHandler(async (req, res) => {
    const rider = await DeliveryBoy.findById(req.user.id).select('activeOrderId').lean();
    if (!rider) throw new ApiError(404, 'Delivery partner not found.');
    if (!rider.activeOrderId) {
        return res.status(200).json(new ApiResponse(200, null, 'No active order.'));
    }

    const order = await Order.findOne({
        _id: rider.activeOrderId,
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
    }).lean();

    res.status(200).json(new ApiResponse(200, order || null, 'Active order fetched.'));
});

/**
 * GET /api/user/orders/:id/tracking
 *
 * The customer's live view: current Quick Commerce status, the ETA promised at
 * checkout, and the rider's last known position. Ownership-scoped — a customer
 * can only track their own order.
 */
export const getOrderTracking = asyncHandler(async (req, res) => {
    const idFilter = [{ orderId: req.params.id }];
    if (mongoose.isValidObjectId(req.params.id)) {
        idFilter.push({ _id: req.params.id });
    }

    const order = await Order.findOne({
        $or: idFilter,
        userId: req.user.id,
        isDeleted: { $ne: true },
    })
        .select('orderId status experience quickCommerce deliveryBoyId createdAt deliveredAt')
        .lean();

    if (!order) throw new ApiError(404, 'Order not found.');

    let rider = null;
    if (order.deliveryBoyId) {
        const riderDoc = await DeliveryBoy.findById(order.deliveryBoyId)
            .select('name phone vehicleType vehicleNumber avatar location lastLocationAt')
            .lean();
        if (riderDoc) {
            const coordinates = Array.isArray(riderDoc.location?.coordinates)
                ? riderDoc.location.coordinates
                : null;
            rider = {
                name: riderDoc.name,
                phone: riderDoc.phone,
                vehicleType: riderDoc.vehicleType,
                vehicleNumber: riderDoc.vehicleNumber,
                avatar: riderDoc.avatar,
                // [lng, lat] → the {latitude, longitude} the client expects.
                latitude: coordinates ? coordinates[1] : null,
                longitude: coordinates ? coordinates[0] : null,
                lastLocationAt: riderDoc.lastLocationAt || null,
            };
        }
    }

    res.status(200).json(new ApiResponse(200, {
        orderId: order.orderId,
        orderRefId: String(order._id),
        experience: order.experience,
        status: order.status,
        quickCommerceStatus: order.quickCommerce?.status || null,
        promisedEtaMinutes: order.quickCommerce?.promisedEtaMinutes ?? null,
        promisedAt: order.quickCommerce?.promisedAt || null,
        assignmentStatus: order.quickCommerce?.assignment?.status || null,
        isQuickCommerce: order.experience === EXPERIENCES.QUICK_COMMERCE,
        deliveredAt: order.deliveredAt || null,
        rider,
    }, 'Order tracking fetched.'));
});
