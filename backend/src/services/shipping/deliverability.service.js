/**
 * Customer-facing deliverability.
 *
 * Answers "can we actually deliver to this pincode, and can we collect cash
 * there?" for the checkout screen — and, critically, decides what to do when
 * the carrier cannot be reached to answer.
 *
 * WHY THIS IS SEPARATE FROM `checkDtdcServiceability`
 * ───────────────────────────────────────────────────
 * That function reports what DTDC said. This one turns that into a business
 * decision, and the two are genuinely different jobs:
 *
 *   DTDC says "DESTPIN is not valid"   → BLOCK. The carrier has told us it
 *                                        cannot deliver. Taking the order would
 *                                        be selling something we cannot ship.
 *
 *   DTDC is unreachable / times out    → ALLOW, warn, and mark the order
 *                                        unverified. A third-party outage must
 *                                        not stop every customer checking out;
 *                                        the vendor catches it at the booking
 *                                        panel, which already refuses to book
 *                                        an unusable address.
 *
 * Failing closed on an outage would convert someone else's downtime into our
 * lost revenue, for a check the vendor performs again before any parcel moves.
 *
 * CACHING
 * ───────
 * Pincode serviceability changes on the order of months, and checkout hits this
 * on every address selection and every keystroke-settled pincode. Without a
 * cache this is a third-party call on the critical path of every order.
 */

import { checkDtdcServiceability } from './dtdcShipment.service.js';
import { isValidPincode, normalizePincode, PINCODE_ERROR_MESSAGE } from '../../constants/pincode.js';
import { cacheWrap } from '../../utils/ttlCache.js';
import PickupLocation from '../../models/PickupLocation.model.js';

/** Serviceability is stable; six hours is generous and still self-healing. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * The origin used when checking a route the customer has not yet tied to a
 * vendor. Serviceability is overwhelmingly a property of the DESTINATION, so a
 * representative origin gives the right answer for the checkout question
 * ("can you reach me?") without needing to know who is shipping yet.
 */
const DEFAULT_ORIGIN_PINCODE = process.env.DTDC_DEFAULT_ORIGIN_PINCODE || '500034';

/** Verdicts this service can return. */
export const Deliverability = Object.freeze({
    /** The carrier confirmed it serves this route. */
    DELIVERABLE: 'deliverable',
    /** The carrier explicitly refused. Checkout must stop. */
    NOT_DELIVERABLE: 'not_deliverable',
    /** We could not ask. Checkout continues, flagged. */
    UNVERIFIED: 'unverified',
    /** Not a well-formed pincode — never worth asking the carrier. */
    INVALID_FORMAT: 'invalid_format',
});

/**
 * Resolve a sensible origin pincode.
 *
 * Prefers the actual vendor's default pickup location when the caller knows
 * which vendor is shipping, so the answer reflects the real route rather than a
 * representative one.
 */
const resolveOrigin = async (vendorId) => {
    if (!vendorId) return DEFAULT_ORIGIN_PINCODE;
    try {
        const pickup = await PickupLocation.findOne({ vendorId, isDefault: true, isActive: true })
            .select('address.zipCode')
            .lean();
        const zip = pickup?.address?.zipCode;
        return isValidPincode(zip) ? String(zip) : DEFAULT_ORIGIN_PINCODE;
    } catch {
        return DEFAULT_ORIGIN_PINCODE;
    }
};

/**
 * Can we deliver to this pincode?
 *
 * Never throws. A carrier outage produces an UNVERIFIED verdict, not an
 * exception the checkout screen has to interpret.
 *
 * @param {string} destinationPincode
 * @param {object} [options]
 * @param {string} [options.vendorId] use this vendor's pickup pincode as origin
 * @param {boolean} [options.requiresCod] the customer intends to pay on delivery
 * @returns {Promise<{
 *   status: string, deliverable: boolean, blocking: boolean,
 *   codAvailable: boolean|null, city: string|null, state: string|null,
 *   message: string|null,
 * }>}
 */
export const checkDeliverability = async (destinationPincode, options = {}) => {
    const pincode = normalizePincode(destinationPincode);

    if (!isValidPincode(pincode)) {
        return {
            status: Deliverability.INVALID_FORMAT,
            deliverable: false,
            blocking: true,
            codAvailable: null,
            city: null,
            state: null,
            message: PINCODE_ERROR_MESSAGE,
        };
    }

    const origin = await resolveOrigin(options.vendorId);
    const cacheKey = `deliverability:${origin}:${pincode}`;

    const verdict = await cacheWrap(cacheKey, CACHE_TTL_MS, async () => {
        const result = await checkDtdcServiceability(origin, pincode);

        // Distinguish "the carrier refused" from "we could not ask". The
        // service reports both as `serviceable: false`, but only the first is
        // a statement about the route — the second is a statement about our
        // connectivity, and blocking checkout on it would be wrong.
        if (result.serviceable) {
            return {
                status: Deliverability.DELIVERABLE,
                codAvailable: result.codAvailable === true,
                city: result.destinationCity || null,
                state: result.destinationState || null,
                message: null,
            };
        }

        const carrierRefused = typeof result.error === 'string'
            && /not valid|not serviceable|no service/i.test(result.error);

        if (carrierRefused) {
            return {
                status: Deliverability.NOT_DELIVERABLE,
                codAvailable: false,
                city: null,
                state: null,
                message: `We do not deliver to pincode ${pincode} yet. Please try a different address.`,
            };
        }

        return {
            status: Deliverability.UNVERIFIED,
            codAvailable: null,
            city: null,
            state: null,
            message: 'We could not confirm delivery for this pincode right now. You can continue — we will confirm before dispatch.',
        };
    });

    const deliverable = verdict.status === Deliverability.DELIVERABLE;

    // COD is a second, independent refusal: a route can accept a prepaid parcel
    // and refuse cash on delivery. Booking a COD consignment to such a pincode
    // is rejected by the carrier AFTER the sale is recorded, so it is caught
    // here instead.
    if (deliverable && options.requiresCod && verdict.codAvailable === false) {
        return {
            ...verdict,
            deliverable: true,
            blocking: true,
            message: `Cash on delivery is not available for pincode ${pincode}. Please choose a prepaid payment method.`,
        };
    }

    return {
        ...verdict,
        deliverable,
        // Only a definitive carrier refusal stops a customer. An outage does not.
        blocking: verdict.status === Deliverability.NOT_DELIVERABLE,
    };
};

/**
 * Was this order's destination confirmed deliverable at checkout?
 *
 * Recorded on the order so a vendor opening an unverified one knows the address
 * was never confirmed, rather than discovering it when the booking fails.
 */
export const deliverabilityStamp = (verdict) => ({
    checkedAt: new Date(),
    status: verdict?.status || Deliverability.UNVERIFIED,
    codAvailable: verdict?.codAvailable ?? null,
});

export default {
    Deliverability,
    checkDeliverability,
    deliverabilityStamp,
    DEFAULT_ORIGIN_PINCODE,
};
