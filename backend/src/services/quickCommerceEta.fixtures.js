/**
 * Shared Quick Commerce ETA conformance fixture.
 *
 * Executed against BOTH the authoritative server implementation
 * (`services/quickCommerce.service.js → calculateEta`) and the frontend preview
 * mirror (`frontend/src/shared/utils/quickCommerceEta.js`).
 *
 * A customer shown "10 min" and promised 25 is the same class of trust failure
 * as a price mismatch — this fixture is what keeps the preview honest.
 */

export const ETA_FIXTURES = [
    {
        label: 'baseline: 10 min prep, 2 km at 20 km/h',
        input: { preparationTimeMins: 10, distanceKm: 2, averageSpeedKmph: 20 },
        expect: { prepMins: 10, travelMins: 6, etaMinutes: 16 },
    },
    {
        label: 'busy store adds padding',
        input: { preparationTimeMins: 10, extraPrepMins: 15, distanceKm: 2, averageSpeedKmph: 20 },
        expect: { prepMins: 25, travelMins: 6, etaMinutes: 31 },
    },
    {
        label: 'zero distance (pickup-adjacent) has no travel time',
        input: { preparationTimeMins: 8, distanceKm: 0, averageSpeedKmph: 20 },
        expect: { prepMins: 8, travelMins: 0, etaMinutes: 8 },
    },
    {
        label: 'travel time rounds up to the next whole minute',
        input: { preparationTimeMins: 0, distanceKm: 1, averageSpeedKmph: 20 },
        expect: { prepMins: 0, travelMins: 3, etaMinutes: 3 },
    },
    {
        label: 'longer distance',
        input: { preparationTimeMins: 12, distanceKm: 7.5, averageSpeedKmph: 25 },
        expect: { prepMins: 12, travelMins: 18, etaMinutes: 30 },
    },
    {
        label: 'missing prep time falls back to the platform default',
        input: { distanceKm: 2, averageSpeedKmph: 20 },
        expect: { prepMins: 10, travelMins: 6, etaMinutes: 16 },
    },
    {
        label: 'invalid speed falls back to the platform default',
        input: { preparationTimeMins: 5, distanceKm: 10, averageSpeedKmph: 0 },
        expect: { prepMins: 5, travelMins: 30, etaMinutes: 35 },
    },
    {
        label: 'negative prep is clamped to zero',
        input: { preparationTimeMins: -5, distanceKm: 0, averageSpeedKmph: 20 },
        expect: { prepMins: 0, travelMins: 0, etaMinutes: 1 },
    },
    {
        label: 'null distance treated as unknown (no travel component)',
        input: { preparationTimeMins: 10, distanceKm: null, averageSpeedKmph: 20 },
        expect: { prepMins: 10, travelMins: 0, etaMinutes: 10 },
    },
    {
        label: 'ETA never drops below one minute',
        input: { preparationTimeMins: 0, distanceKm: 0, averageSpeedKmph: 20 },
        expect: { prepMins: 0, travelMins: 0, etaMinutes: 1 },
    },
];

/**
 * Delivery-fee fixtures.
 *
 * The fee is computed server-side only (the client fetches it from
 * `/api/quick/checkout/estimate`), so there is no mirror to keep in step — but
 * pinning the arithmetic here stops a settings-shape change from silently
 * altering what customers are charged.
 */
export const DELIVERY_FEE_FIXTURES = [
    {
        label: 'baseline: 25 base + 8/km over 2km',
        input: { distanceKm: 2, baseFee: 25, perKmFee: 8 },
        expect: 41,
    },
    {
        label: 'zero distance charges base fee only',
        input: { distanceKm: 0, baseFee: 25, perKmFee: 8 },
        expect: 25,
    },
    {
        label: 'fractional distance keeps two decimals',
        input: { distanceKm: 1.25, baseFee: 25, perKmFee: 8 },
        expect: 35,
    },
    {
        label: 'free above threshold when subtotal reaches it',
        input: { distanceKm: 5, baseFee: 25, perKmFee: 8, freeAboveSubtotal: 500, subtotal: 500 },
        expect: 0,
    },
    {
        label: 'threshold not reached still charges',
        input: { distanceKm: 5, baseFee: 25, perKmFee: 8, freeAboveSubtotal: 500, subtotal: 499.99 },
        expect: 65,
    },
    {
        label: 'zero threshold never grants free delivery',
        input: { distanceKm: 1, baseFee: 25, perKmFee: 8, freeAboveSubtotal: 0, subtotal: 100000 },
        expect: 33,
    },
    {
        label: 'negative distance treated as zero',
        input: { distanceKm: -3, baseFee: 25, perKmFee: 8 },
        expect: 25,
    },
    {
        label: 'null distance treated as zero',
        input: { distanceKm: null, baseFee: 25, perKmFee: 8 },
        expect: 25,
    },
    {
        label: 'platform defaults apply when settings are unset',
        input: { distanceKm: 2 },
        expect: 41,
    },
    {
        label: 'fee never goes negative',
        input: { distanceKm: 0, baseFee: -100, perKmFee: 0 },
        expect: 0,
    },
];

export default ETA_FIXTURES;
