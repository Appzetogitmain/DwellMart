import {
    QUICK_COMMERCE_AVAILABILITY,
    LATITUDE_BOUNDS,
    LONGITUDE_BOUNDS,
    MAX_SERVICE_RADIUS_KM,
    DEFAULT_AVERAGE_SPEED_KMPH,
    DEFAULT_PREPARATION_MINS,
    DEFAULT_BASE_DELIVERY_FEE,
    DEFAULT_PER_KM_FEE,
} from '../constants/quickCommerce.js';

/**
 * Quick Commerce vendor operations.
 *
 * Availability is derived here and ONLY here. Three independent signals
 * (business hours, availability status, and a temporary pause) collapse into a
 * single answer, and clients must consume that answer rather than recomputing
 * it — the same rule that keeps pricing consistent across the app.
 */

/** Minutes since midnight for an "HH:mm" string, or null if unparseable. */
const parseTimeToMinutes = (value) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
};

/**
 * Is the vendor inside its configured business hours right now?
 *
 * No hours configured → treated as always open, so a vendor is never
 * accidentally hidden by an empty schedule.
 * Supports overnight windows (e.g. 22:00–02:00).
 */
export const isWithinBusinessHours = (businessHours, now = new Date()) => {
    if (!Array.isArray(businessHours) || businessHours.length === 0) return true;

    const today = businessHours.find((entry) => Number(entry?.day) === now.getDay());
    if (!today) return true;
    if (today.isClosed === true) return false;

    const openMinutes = parseTimeToMinutes(today.open);
    const closeMinutes = parseTimeToMinutes(today.close);
    if (openMinutes === null || closeMinutes === null) return true;

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (openMinutes === closeMinutes) return true;               // 24h window
    if (openMinutes < closeMinutes) {
        return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
    }
    // Overnight window: open late, closes after midnight.
    return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
};

/**
 * Resolve a vendor's live Quick Commerce availability.
 *
 * @returns {{
 *   status: string,          // effective availability after pause expiry
 *   isDiscoverable: boolean, // may appear in listings
 *   isOrderable: boolean,    // may accept new orders
 *   extraPrepMins: number,   // ETA padding while busy
 *   reason: string|null      // why it is not orderable
 * }}
 */
export const resolveVendorAvailability = (vendor, now = new Date()) => {
    const profile = vendor?.quickCommerceProfile;
    const channelEnabled = vendor?.sellingChannels?.quickCommerce?.enabled === true;

    if (!channelEnabled) {
        return {
            status: QUICK_COMMERCE_AVAILABILITY.OFFLINE,
            isDiscoverable: false,
            isOrderable: false,
            extraPrepMins: 0,
            reason: 'CHANNEL_DISABLED',
        };
    }

    // A pause that has elapsed no longer applies.
    const pausedUntil = profile?.pausedUntil ? new Date(profile.pausedUntil) : null;
    const isPaused = Boolean(pausedUntil && pausedUntil.getTime() > now.getTime());

    let status = profile?.availabilityStatus || QUICK_COMMERCE_AVAILABILITY.OPEN;
    if (status === QUICK_COMMERCE_AVAILABILITY.TEMPORARILY_CLOSED && !isPaused && pausedUntil) {
        status = QUICK_COMMERCE_AVAILABILITY.OPEN;
    }
    if (isPaused) {
        status = QUICK_COMMERCE_AVAILABILITY.TEMPORARILY_CLOSED;
    }

    if (status === QUICK_COMMERCE_AVAILABILITY.OFFLINE) {
        return {
            status,
            isDiscoverable: false,
            isOrderable: false,
            extraPrepMins: 0,
            reason: 'OFFLINE',
        };
    }

    if (status === QUICK_COMMERCE_AVAILABILITY.TEMPORARILY_CLOSED) {
        return {
            status,
            isDiscoverable: true,
            isOrderable: false,
            extraPrepMins: 0,
            reason: 'TEMPORARILY_CLOSED',
        };
    }

    if (!isWithinBusinessHours(profile?.businessHours, now)) {
        return {
            status,
            isDiscoverable: true,
            isOrderable: false,
            extraPrepMins: 0,
            reason: 'OUTSIDE_BUSINESS_HOURS',
        };
    }

    const isBusy = status === QUICK_COMMERCE_AVAILABILITY.BUSY;
    return {
        status,
        isDiscoverable: true,
        isOrderable: true,
        extraPrepMins: isBusy ? Math.max(0, Number(profile?.busyExtraMins) || 0) : 0,
        reason: null,
    };
};

/**
 * Validate and normalize a GeoJSON Point from raw latitude/longitude input.
 * @returns {{ type: 'Point', coordinates: [number, number] }}
 * @throws {Error} when either value is missing or out of range
 */
export const buildLocationPoint = ({ latitude, longitude }) => {
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!Number.isFinite(lat) || lat < LATITUDE_BOUNDS.min || lat > LATITUDE_BOUNDS.max) {
        throw new Error(`Latitude must be between ${LATITUDE_BOUNDS.min} and ${LATITUDE_BOUNDS.max}.`);
    }
    if (!Number.isFinite(lng) || lng < LONGITUDE_BOUNDS.min || lng > LONGITUDE_BOUNDS.max) {
        throw new Error(`Longitude must be between ${LONGITUDE_BOUNDS.min} and ${LONGITUDE_BOUNDS.max}.`);
    }

    // GeoJSON stores [longitude, latitude] — the reverse of how humans say it.
    return { type: 'Point', coordinates: [lng, lat] };
};

/** Convert a stored GeoJSON Point back to { latitude, longitude } for UI use. */
export const pointToLatLng = (point) => {
    const coordinates = point?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    return { latitude, longitude };
};

/** Clamp a requested radius into the platform-allowed range. */
export const clampServiceRadius = (radiusKm) => {
    const value = Number(radiusKm);
    if (!Number.isFinite(value)) return null;
    return Math.min(Math.max(value, 0.5), MAX_SERVICE_RADIUS_KM);
};

/**
 * Great-circle distance in kilometres between two lat/lng points.
 * Used for ETA and delivery-fee calculation; `$geoNear` supplies distance for
 * discovery, but checkout needs it for a specific vendor/customer pair.
 */
export const haversineDistanceKm = (from, to) => {
    const EARTH_RADIUS_KM = 6371;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;

    const lat1 = Number(from?.latitude);
    const lng1 = Number(from?.longitude);
    const lat2 = Number(to?.latitude);
    const lng2 = Number(to?.longitude);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;

    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

    return Number((2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))).toFixed(3));
};

/**
 * Quick Commerce ETA — the AUTHORITATIVE implementation.
 *
 *     ETA = preparationTime (+ busy padding) + travelTime
 *
 * Deliberately plain: ETA accuracy is bounded by prep-time variance, which
 * dominates travel-time error over short distances. A traffic-aware routing
 * model on top of a guessed prep time would be false precision. The interface
 * is isolated so the internals can be swapped later without touching callers.
 *
 * A mirrored preview exists in `frontend/src/shared/utils/quickCommerceEta.js`;
 * both are verified against a shared fixture, exactly as pricing is.
 *
 * @param {object} params
 * @param {number} params.preparationTimeMins Vendor's configured prep time.
 * @param {number} [params.extraPrepMins=0]   Busy padding from availability.
 * @param {number} params.distanceKm          Vendor → customer distance.
 * @param {number} [params.averageSpeedKmph=20] Platform-configured travel speed.
 * @returns {{ etaMinutes: number, prepMins: number, travelMins: number }}
 */
export const calculateEta = ({
    preparationTimeMins,
    extraPrepMins = 0,
    distanceKm,
    averageSpeedKmph = DEFAULT_AVERAGE_SPEED_KMPH,
}) => {
    const basePrep = Number(preparationTimeMins);
    const prepMins = Math.max(0, Number.isFinite(basePrep) ? basePrep : DEFAULT_PREPARATION_MINS)
        + Math.max(0, Number(extraPrepMins) || 0);

    const speed = Number(averageSpeedKmph) > 0 ? Number(averageSpeedKmph) : DEFAULT_AVERAGE_SPEED_KMPH;
    const distance = Number(distanceKm);
    const travelMins = Number.isFinite(distance) && distance > 0
        ? Math.ceil((distance / speed) * 60)
        : 0;

    return {
        etaMinutes: Math.max(1, Math.round(prepMins + travelMins)),
        prepMins: Math.round(prepMins),
        travelMins,
    };
};

/**
 * Quick Commerce delivery fee.
 *
 * Distance-based with a free threshold, replacing the Marketplace per-vendor
 * shipping-rate engine for Quick Commerce orders.
 */
export const calculateDeliveryFee = ({
    distanceKm,
    baseFee = DEFAULT_BASE_DELIVERY_FEE,
    perKmFee = DEFAULT_PER_KM_FEE,
    freeAboveSubtotal = 0,
    subtotal = 0,
}) => {
    if (Number(freeAboveSubtotal) > 0 && Number(subtotal) >= Number(freeAboveSubtotal)) {
        return 0;
    }
    const distance = Number(distanceKm);
    const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : 0;
    const fee = Number(baseFee) + safeDistance * Number(perKmFee);
    return Number(Math.max(0, fee).toFixed(2));
};

/**
 * Find Quick Commerce vendors that can actually deliver to a point.
 *
 * Uses a deliberate TWO-STAGE filter, which is the subtle part of this query:
 * `$geoNear.maxDistance` accepts only one global value, but every vendor has
 * its OWN `serviceRadiusKm`. So we over-fetch to the platform ceiling and then
 * discard vendors whose personal radius does not reach the customer. A naive
 * single-radius query silently returns vendors that cannot deliver.
 *
 * @param {object} params
 * @param {number} params.latitude
 * @param {number} params.longitude
 * @param {number} [params.limit=50]
 * @param {boolean} [params.orderableOnly=false] Drop stores that are currently
 *   closed/paused. Discovery keeps them (greyed out); ordering must not.
 * @returns {Promise<Array>} vendors with `distanceKm` and derived `availability`
 */
export const findNearbyVendors = async ({
    latitude,
    longitude,
    limit = 50,
    orderableOnly = false,
}) => {
    // Imported lazily to keep this service free of model-level import cycles.
    const { default: Vendor } = await import('../models/Vendor.model.js');

    const point = buildLocationPoint({ latitude, longitude });

    const results = await Vendor.aggregate([
        {
            $geoNear: {
                near: point,
                distanceField: 'distanceMeters',
                // Stage 1: cast the widest net the platform permits.
                maxDistance: MAX_SERVICE_RADIUS_KM * 1000,
                spherical: true,
                key: 'quickCommerceProfile.location',
                query: {
                    status: 'approved',
                    'sellingChannels.quickCommerce.enabled': true,
                },
            },
        },
        {
            // Stage 2: honour each vendor's own radius (defaulting to 5km when
            // unset, matching the schema default).
            $match: {
                $expr: {
                    $lte: [
                        '$distanceMeters',
                        {
                            $multiply: [
                                { $ifNull: ['$quickCommerceProfile.serviceRadiusKm', 5] },
                                1000,
                            ],
                        },
                    ],
                },
            },
        },
        { $limit: Math.max(1, Math.min(Number(limit) || 50, 100)) },
    ]);

    const now = new Date();
    return results
        .map((vendor) => ({
            ...vendor,
            distanceKm: Number((vendor.distanceMeters / 1000).toFixed(2)),
            availability: resolveVendorAvailability(vendor, now),
        }))
        .filter((vendor) => vendor.availability.isDiscoverable)
        .filter((vendor) => (orderableOnly ? vendor.availability.isOrderable : true));
};

/**
 * Pincode fallback for customers who deny location access.
 * Less precise than a radius check, but keeps Quick Commerce reachable.
 */
export const findVendorsByPincode = async ({ pincode, limit = 50, orderableOnly = false }) => {
    const { default: Vendor } = await import('../models/Vendor.model.js');
    const normalized = String(pincode ?? '').trim();
    if (!normalized) return [];

    const vendors = await Vendor.find({
        status: 'approved',
        'sellingChannels.quickCommerce.enabled': true,
        'quickCommerceProfile.servicedPincodes': normalized,
    })
        .limit(Math.max(1, Math.min(Number(limit) || 50, 100)))
        .lean();

    const now = new Date();
    return vendors
        .map((vendor) => ({
            ...vendor,
            // No coordinates supplied, so distance is genuinely unknown.
            distanceKm: null,
            availability: resolveVendorAvailability(vendor, now),
        }))
        .filter((vendor) => vendor.availability.isDiscoverable)
        .filter((vendor) => (orderableOnly ? vendor.availability.isOrderable : true));
};

/**
 * A vendor may only be listed/ordered from once it has the minimum operating
 * configuration. Without a location it cannot be found by any nearby query.
 */
export const hasCompleteQuickCommerceProfile = (profile) =>
    Boolean(
        profile?.storeType
        && Array.isArray(profile?.location?.coordinates)
        && profile.location.coordinates.length === 2
        && Number.isFinite(Number(profile?.serviceRadiusKm))
    );
