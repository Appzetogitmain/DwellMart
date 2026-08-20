/**
 * DTDC Shipment Service
 *
 * Business-logic layer between the DwellMart order lifecycle and the DTDC API
 * client. Owns idempotency, payload construction, status mapping and the
 * order write-back.
 *
 * NEVER bypasses deliveryProvider.js — every operation starts with an
 * `assertProviderMatch` so a Quick Commerce order can never reach DTDC.
 *
 * Everything here is vendor-scoped. A marketplace order is split across
 * sellers and each seller despatches its own parcel; looking a shipment up by
 * order alone hands one vendor another vendor's AWB and label.
 */

import dtdcClient from './dtdc.client.js';
import {
    resolveDeliveryProvider,
    assertProviderMatch,
    DeliveryProviders,
} from './deliveryProvider.js';
import {
    mapDtdcScanToShipmentStatus,
    shipmentStatusToOrderStatus,
    shipmentStatusToPartnerStatus,
    canAdvanceShipmentStatus,
    ShipmentStatus,
} from '../../constants/dtdcStatus.js';
import { syncOrderWithShipment } from './orderShipmentSync.service.js';
import Shipment from '../../models/Shipment.model.js';
import Order from '../../models/Order.model.js';
import PickupLocation from '../../models/PickupLocation.model.js';
import dtdcConfig from '../../config/dtdc.js';
import { VendorChannels } from '../../constants/vendorChannels.js';
import { resolveOrderChannel } from '../orderChannel.service.js';
import {
    FALLBACK_WEIGHT_KG,
    FALLBACK_DIMENSIONS_CM,
    chargeableWeight,
    validatePackageOverride,
} from './parcelMetrics.js';

// ─── Re-export status helpers so consumers only import this service ────────
export {
    mapDtdcScanToShipmentStatus,
    shipmentStatusToOrderStatus,
    shipmentStatusToPartnerStatus,
    ShipmentStatus,
};

/** Stable idempotency key for a (order, vendor) parcel. */
export const bookingKey = (orderId, vendorId) => `${orderId}_${vendorId}`;

// ─── Address normalisation ─────────────────────────────────────────────────

/**
 * Flatten the several address shapes this codebase actually stores into the
 * single shape the DTDC payload needs.
 *
 * The shapes really do differ, and assuming one of them is how the origin
 * pincode, city and state used to serialise as empty strings while
 * `address_line_1` serialised as a JSON object:
 *
 *   PickupLocation → { name, phone, address: { street, city, state, zipCode } }
 *   Vendor         → { storeName, phone, address: { street, city, state, zipCode } }
 *   Order.shippingAddress (flat) → { name, phone, address, city, state, zipCode }
 */
export const normalizeAddress = (source = {}, fallbacks = {}) => {
    const nested = source.address && typeof source.address === 'object' ? source.address : null;
    const line = nested
        ? [nested.street, nested.line2].filter(Boolean).join(', ')
        : (source.addressLine1 || source.address || source.street || '');

    const pick = (...candidates) => {
        for (const c of candidates) {
            if (c === 0) continue;
            if (c !== undefined && c !== null && String(c).trim() !== '') return String(c).trim();
        }
        return '';
    };

    return {
        name: pick(source.contactPerson, source.fullName, source.name, fallbacks.name),
        phone: pick(source.phone, source.mobile, source.contactPhone, fallbacks.phone),
        addressLine1: pick(line, fallbacks.addressLine1),
        city: pick(nested?.city, source.city, fallbacks.city),
        state: pick(nested?.state, source.state, fallbacks.state),
        pincode: pick(
            nested?.zipCode, nested?.pincode, nested?.postalCode,
            source.zipCode, source.pincode, source.postalCode,
            fallbacks.pincode
        ),
    };
};

/** Fields DTDC will reject the consignment without. */
const REQUIRED_ADDRESS_FIELDS = ['name', 'phone', 'addressLine1', 'city', 'state', 'pincode'];

const missingAddressFields = (address) =>
    REQUIRED_ADDRESS_FIELDS.filter((f) => !address[f]);

// ─── Consignment Payload Builder ───────────────────────────────────────────

/**
 * Total billable weight in kilograms.
 *
 * Uses a per-item weight when the catalogue carries one and falls back to a
 * documented fallback otherwise (see parcelMetrics.FALLBACK_WEIGHT_KG). DTDC
 * bills on the higher of actual and volumetric weight, so under-declaring costs
 * money at reconciliation rather than at booking — which is why the fallback is
 * reported to the caller rather than applied silently.
 */
export const estimateWeightKg = (items) => {
    const lines = items || [];

    // A line contributes a real weight only when the order snapshot captured
    // one. `undefined` means the product was never measured — which is a
    // different thing from weighing nothing, and the caller must be able to
    // tell the two apart.
    const measured = lines.filter((item) => Number(item?.shippingWeightKg) > 0);
    const isEstimated = measured.length !== lines.length || lines.length === 0;

    const total = lines.reduce((sum, item) => {
        const qty = Number(item?.quantity) || 1;
        const unit = Number(item?.shippingWeightKg) > 0
            ? Number(item.shippingWeightKg)
            : FALLBACK_WEIGHT_KG;
        return sum + qty * unit;
    }, 0);

    return {
        weight: Math.max(FALLBACK_WEIGHT_KG, Number(total.toFixed(3))),
        isEstimated,
    };
};

/**
 * The dimensions to declare for a parcel.
 *
 * Only a single unit of a single line can be declared from catalogue data with
 * any honesty. Three 20 cm boxes packed together are NOT one 60 cm box, and no
 * stacking formula this module could invent would be right — the vendor's
 * booking-time confirmation is the correct answer for a multi-item parcel, and
 * the documented fallback is what stands in until they give it.
 *
 * @returns {{dims:{length,width,height}, isEstimated:boolean}}
 */
export const computeParcelDimensions = (items) => {
    const lines = items || [];
    const singleLine = lines.length === 1 && (Number(lines[0]?.quantity) || 1) === 1;
    const dims = singleLine ? lines[0]?.shippingDims : null;

    if (dims && [dims.length, dims.width, dims.height].every((v) => Number(v) > 0)) {
        return {
            dims: {
                length: Number(dims.length),
                width: Number(dims.width),
                height: Number(dims.height),
            },
            isEstimated: false,
        };
    }

    return { dims: { ...FALLBACK_DIMENSIONS_CM }, isEstimated: true };
};

/** Items belonging to one vendor's slice of a (possibly split) order. */
const itemsForVendor = (order, vendorId) => {
    if (!vendorId) return order.items || [];
    const slice = (order.vendorItems || []).find(
        (vi) => String(vi?.vendorId) === String(vendorId)
    );
    if (slice?.items?.length) return slice.items;
    return order.items || [];
};

/** Declared value of one vendor's slice, falling back to the order total. */
const declaredValueFor = (order, vendorId) => {
    if (vendorId) {
        const slice = (order.vendorItems || []).find(
            (vi) => String(vi?.vendorId) === String(vendorId)
        );
        const sliceTotal = Number(slice?.total ?? slice?.subtotal);
        if (Number.isFinite(sliceTotal) && sliceTotal > 0) return sliceTotal;
    }
    const total = Number(order.total ?? order.totalAmount ?? order.subtotal);
    return Number.isFinite(total) ? total : 0;
};

/** True when the buyer pays the courier on the doorstep. */
export const isCodOrder = (order) => {
    const method = String(order?.paymentMethod || '').trim().toLowerCase();
    const paid = String(order?.paymentStatus || '').trim().toLowerCase() === 'paid';
    return (method === 'cod' || method === 'cash') && !paid;
};

/**
 * Build the DTDC consignment request payload from DwellMart order data.
 *
 * Service-type selection:
 *   wholesale → GROUND EXPRESS (surface, B2B)
 *   retail    → PRIORITY       (air, B2C)
 *
 * @throws {Error} when either address is too incomplete for DTDC to accept.
 */
export const buildConsignmentPayload = (order, vendor, pickupLocation, vendorId = null, packageOverride = null) => {
    const channel = resolveOrderChannel(order, vendorId || vendor?._id);
    const serviceType = channel === VendorChannels.WHOLESALE ? 'GROUND EXPRESS' : 'PRIORITY';

    const items = itemsForVendor(order, vendorId || vendor?._id);
    const numPieces = Math.max(
        1,
        items.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0)
    );

    /**
     * Parcel resolution, most-trusted first:
     *   vendor    — a human confirmed what physically went in the box
     *   catalogue — measurements captured on the order line at checkout
     *   estimated — the documented fallback, and the vendor is told so
     *
     * The source is returned alongside the numbers rather than inferred later,
     * because "did we guess?" is exactly what the UI and the shipment record
     * both need to state honestly.
     */
    const estimated = estimateWeightKg(items);
    const catalogueDims = computeParcelDimensions(items);

    const weightKg = packageOverride?.weightKg ?? estimated.weight;
    const dims = packageOverride?.dims ?? catalogueDims.dims;

    let weightSource;
    if (packageOverride?.weightKg || packageOverride?.dims) weightSource = 'vendor';
    else if (estimated.isEstimated && catalogueDims.isEstimated) weightSource = 'estimated';
    else weightSource = 'catalogue';

    const billing = chargeableWeight(weightKg, dims);

    const origin = normalizeAddress(pickupLocation || {}, normalizeAddress(vendor || {}, {
        name: vendor?.storeName || vendor?.name,
        phone: vendor?.phone,
    }));
    // DTDC prints origin_details.name as the consignor on the label, so the
    // store name beats the pickup location's own label ("Main Warehouse" tells
    // a recipient nothing about who sent the parcel).
    const consignor = String(pickupLocation?.contactPerson || vendor?.storeName || vendor?.name || '').trim();
    if (consignor) origin.name = consignor;
    if (!origin.phone) origin.phone = String(vendor?.phone || '').trim();

    const destination = normalizeAddress(order.shippingAddress || {});

    const originMissing = missingAddressFields(origin);
    const destinationMissing = missingAddressFields(destination);

    if (originMissing.length) {
        throw new Error(
            `Pickup address is incomplete — missing ${originMissing.join(', ')}. ` +
            'Add a default pickup location with a full address before booking.'
        );
    }
    if (destinationMissing.length) {
        throw new Error(
            `Delivery address is incomplete — missing ${destinationMissing.join(', ')}.`
        );
    }

    const declaredValue = declaredValueFor(order, vendorId || vendor?._id);
    const cod = isCodOrder(order);

    return {
        customer_code:      dtdcConfig.customerCode,
        service_type_id:    serviceType,
        load_type:          'NON-DOCUMENT',
        dimension_unit:     'cm',
        weight_unit:        'kg',
        length:             dims.length,
        width:              dims.width,
        height:             dims.height,
        weight:             weightKg,
        declared_value:     declaredValue,
        num_pieces:         numPieces,
        origin_details: {
            name:           origin.name,
            phone:          origin.phone,
            address_line_1: origin.addressLine1,
            pincode:        origin.pincode,
            city:           origin.city,
            state:          origin.state,
        },
        destination_details: {
            name:           destination.name,
            phone:          destination.phone,
            address_line_1: destination.addressLine1,
            pincode:        destination.pincode,
            city:           destination.city,
            state:          destination.state,
        },
        customer_reference_number: order.orderId || String(order._id),
        cod_collection_mode:       cod ? 'CASH' : '',
        cod_amount:                cod ? declaredValue : 0,
        commodity_id:              'GENERAL',
        description:               'E-commerce goods',
        reference_number:          bookingKey(order._id, vendorId || vendor?._id),

        /**
         * Non-wire metadata. Stripped before the request is sent (see
         * `stripPayloadMetadata`) — DTDC would reject an unrecognised key —
         * but carried this far so the caller can record HOW the parcel was
         * determined without recomputing it.
         */
        __meta: {
            weightSource,
            isEstimatedWeight: estimated.isEstimated && !packageOverride?.weightKg,
            isEstimatedDims: catalogueDims.isEstimated && !packageOverride?.dims,
            chargeableWeight: billing.chargeable,
            volumetricWeight: billing.volumetric,
            billingBasis: billing.basis,
        },
    };
};

/** Separate the wire payload from the metadata the caller keeps. */
export const stripPayloadMetadata = (payload) => {
    const { __meta, ...wire } = payload;
    return { wire, meta: __meta || {} };
};


/**
 * Read a package override out of a request body.
 *
 * Only the six parcel keys are taken; anything else a client sends is ignored
 * rather than trusted. Returns null when the caller supplied nothing, so
 * "no override" and "an override of zeroes" stay distinguishable.
 */
export const extractPackageOverride = (body = {}) => {
    if (!body || typeof body !== 'object') return null;
    const keys = ['weight', 'weightUnit', 'length', 'width', 'height', 'dimensionUnit'];
    const picked = {};
    for (const key of keys) {
        if (body[key] !== undefined && body[key] !== null && body[key] !== '') picked[key] = body[key];
    }
    const hasMeasurement = ['weight', 'length', 'width', 'height'].some((k) => k in picked);
    return hasMeasurement ? picked : null;
};

/**
 * What would be declared to the carrier if this order were booked right now.
 *
 * Exists so the booking UI can pre-fill and warn without re-implementing unit
 * conversion or the volumetric rule in JavaScript that would then drift from
 * the backend's. Builds the real payload and throws it away.
 *
 * @returns {Promise<object>} parcel figures plus their provenance
 */
export const previewParcel = async (order, vendor, vendorId = null) => {
    const scopedVendorId = String(vendorId || vendor?._id);
    const pickupLocation =
        await PickupLocation.findOne({ vendorId: vendor._id, isDefault: true, isActive: true }).lean()
        || await PickupLocation.findOne({ vendorId: vendor._id, isActive: true }).lean()
        || await PickupLocation.findOne({ vendorId: vendor._id }).lean()
        || null;

    try {
        const payload = buildConsignmentPayload(order, vendor, pickupLocation, scopedVendorId);
        const { wire, meta } = stripPayloadMetadata(payload);
        return {
            weight: wire.weight,
            weightUnit: 'kg',
            length: wire.length,
            width: wire.width,
            height: wire.height,
            dimensionUnit: 'cm',
            numPieces: wire.num_pieces,
            serviceType: wire.service_type_id,
            ...meta,
            ready: true,
        };
    } catch (error) {
        // An incomplete address blocks booking but must not blank the panel —
        // the vendor needs to see WHY they cannot book.
        return { ready: false, blockedReason: error.message };
    }
};

// ─── Shipment lookup ───────────────────────────────────────────────────────

/**
 * Find the DTDC shipment for one vendor's parcel.
 *
 * `vendorId` is optional only so admin screens can inspect an order that has a
 * single seller; when it is omitted and the order has more than one shipment
 * the call fails loudly rather than picking one arbitrarily.
 */
export const findDtdcShipment = async (orderId, vendorId = null) => {
    const filter = { orderId, deliveryProvider: DeliveryProviders.DTDC };
    if (vendorId) filter.vendorId = vendorId;

    const shipments = await Shipment.find(filter);
    if (shipments.length > 1) {
        throw new Error(
            'This order has shipments from multiple vendors — specify which vendor to act on.'
        );
    }
    return shipments[0] || null;
};

// ─── Serviceability ────────────────────────────────────────────────────────

/**
 * Read the verdict out of a DTDC pincode response.
 *
 * The endpoint answers HTTP 200 whether or not the route can be served, so
 * "the call succeeded" is not the same as "we can ship there". The verdict
 * lives in `ZIPCODE_RESP[0]`, verified against the live sandbox:
 *
 *   serviceable   { MESSAGE: 'SUCCESS', SERV_COD: 'Y', DESTCITY, DESTSTATE, ... }
 *   unserviceable { MESSAGE: 'DESTPIN is not valid', SERV_COD: 'N', ... }
 *
 * `SERV_COD` matters on its own: a route can accept a prepaid parcel and
 * refuse a cash-on-delivery one, and booking COD to such a pincode is rejected
 * at the carrier rather than caught here.
 */
export const parseServiceabilityResponse = (data) => {
    const verdict = Array.isArray(data?.ZIPCODE_RESP) ? data.ZIPCODE_RESP[0] : null;

    if (!verdict) {
        return { serviceable: false, error: 'DTDC returned no serviceability verdict.', data };
    }

    const message = String(verdict.MESSAGE || '').trim();
    const serviceable = message.toUpperCase() === 'SUCCESS';

    return {
        serviceable,
        codAvailable: String(verdict.SERV_COD || '').toUpperCase() === 'Y',
        destinationCity: verdict.DESTCITY || null,
        destinationState: verdict.DESTSTATE || null,
        ...(serviceable ? {} : { error: message || 'Route is not serviceable.' }),
        data,
    };
};

/**
 * Check whether DTDC can service a route.
 *
 * Returns a verdict rather than throwing: an unserviceable route and an
 * unreachable serviceability API are both "we cannot promise this", and the
 * caller renders them the same way.
 */
export const checkDtdcServiceability = async (originPincode, destPincode) => {
    const valid = (p) => /^\d{6}$/.test(String(p || '').trim());
    if (!valid(originPincode) || !valid(destPincode)) {
        return { serviceable: false, error: 'Pincodes must be 6 digits.' };
    }

    try {
        const data = await dtdcClient.checkServiceability(
            String(originPincode).trim(), String(destPincode).trim()
        );
        return parseServiceabilityResponse(data);
    } catch (error) {
        return { serviceable: false, error: error.message };
    }
};

// ─── Booking ───────────────────────────────────────────────────────────────

/**
 * How long a booking lock is honoured before it is treated as abandoned.
 * Comfortably longer than the client timeout so a slow-but-live DTDC call is
 * never overtaken, short enough that a crashed process does not strand the
 * parcel for a whole shift.
 */
const BOOKING_LOCK_TTL_MS = 2 * 60 * 1000;

/** Poll for the AWB another in-flight booking is about to write. */
const waitForAwb = async (shipmentId, { attempts = 10, intervalMs = 300 } = {}) => {
    for (let i = 0; i < attempts; i++) {
        await new Promise((r) => setTimeout(r, intervalMs));
        const current = await Shipment.findById(shipmentId);
        if (current?.awbNumber) return current;
        // The holder failed and released the lock — no point waiting it out.
        if (current && !current.bookingLockedAt) return current;
    }
    return null;
};

/**
 * Book a DTDC shipment for one vendor's slice of an order.
 *
 * Idempotency has two layers, because one is not enough:
 *
 *   1. A pre-flight read returns an existing AWB without calling DTDC.
 *   2. The pending Shipment row is claimed with an atomic upsert on the unique
 *      `bookingId`. Two concurrent requests therefore contend on the database
 *      rather than both reaching the carrier — the loser waits and returns the
 *      winner's AWB instead of booking a second parcel.
 *
 * A failure AFTER the carrier accepted the consignment is never recorded as a
 * booking failure. The AWB exists and money is committed against it; marking
 * the shipment `failed` (as this used to) both lost the AWB and blocked every
 * retry, leaving a real parcel moving with no record in DwellMart.
 *
 * @param {object} order          Mongoose Order document (mutable — will be saved)
 * @param {object} vendor         Mongoose Vendor document
 * @param {object} [pickupLoc]    Pickup location override; resolved from DB if omitted
 * @returns {Promise<Shipment>}
 */
export const bookDtdcShipment = async (order, vendor, pickupLoc = null, packageOverride = null) => {
    const vendorIdStr = String(vendor._id);

    // 1. Channel guard — throws for Quick Commerce before anything else happens.
    assertProviderMatch(order, DeliveryProviders.DTDC, vendorIdStr);

    // 2. Validate the vendor's package figures against the same bounds the
    //    product form enforces, BEFORE claiming a booking slot or contacting
    //    the carrier. DTDC would reject them anyway; failing here costs
    //    nothing and leaves no half-claimed row behind.
    const resolvedOverride = packageOverride ? validatePackageOverride(packageOverride) : null;
    if (resolvedOverride && !resolvedOverride.valid) {
        throw new Error(`Invalid package details: ${resolvedOverride.errors.join(' ')}`);
    }

    const { channel } = resolveDeliveryProvider(order, vendorIdStr);
    const key = bookingKey(order._id, vendorIdStr);

    const existing = await Shipment.findOne({
        orderId: order._id,
        vendorId: vendor._id,
        deliveryProvider: DeliveryProviders.DTDC,
    });

    // 2. A cancelled parcel is checked BEFORE the already-booked fast path: it
    //    still carries its AWB, so an awbNumber-first check would hand back a
    //    dead consignment and report it as a successful booking. Rebooking is a
    //    deliberate business decision, not a retry.
    if (existing?.status === ShipmentStatus.CANCELLED) {
        throw new Error('This shipment was cancelled. Create a new order to ship again.');
    }

    // 3. Fast path — already booked.
    if (existing?.awbNumber) return existing;

    // 4. Resolve pickup location.
    const pickupLocation = pickupLoc
        || await PickupLocation.findOne({ vendorId: vendor._id, isDefault: true, isActive: true }).lean()
        || await PickupLocation.findOne({ vendorId: vendor._id, isActive: true }).lean()
        || await PickupLocation.findOne({ vendorId: vendor._id }).lean()
        || null;

    // 5. Build (and validate) the payload BEFORE reserving anything.
    const fullPayload = buildConsignmentPayload(
        order, vendor, pickupLocation, vendorIdStr, resolvedOverride
    );
    const { wire: consignmentData, meta: parcelMeta } = stripPayloadMetadata(fullPayload);

    // 6. Claim the booking slot atomically.
    let shipment;
    try {
        shipment = await Shipment.findOneAndUpdate(
            { bookingId: key },
            {
                $setOnInsert: {
                    orderId:            order._id,
                    vendorId:           vendor._id,
                    deliveryProvider:   DeliveryProviders.DTDC,
                    channel,
                    status:             ShipmentStatus.PENDING,
                    bookingId:          key,
                    serviceType:        consignmentData.service_type_id,
                    originPincode:      consignmentData.origin_details.pincode,
                    destinationPincode: consignmentData.destination_details.pincode,
                    declaredValue:      consignmentData.declared_value,
                    codAmount:          consignmentData.cod_amount,
                    weight:             consignmentData.weight,
                    weightSource:       parcelMeta.weightSource,
                    chargeableWeight:   parcelMeta.chargeableWeight,
                    volumetricWeight:   parcelMeta.volumetricWeight,
                    dimensions: {
                        length: consignmentData.length,
                        width:  consignmentData.width,
                        height: consignmentData.height,
                        unit:   consignmentData.dimension_unit,
                    },
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    } catch (error) {
        // Lost the upsert race: the winner's row now exists — use it.
        if (error?.code === 11000) {
            shipment = await Shipment.findOne({ bookingId: key });
            if (!shipment) throw error;
        } else {
            throw error;
        }
    }

    // A concurrent request may have completed the booking while we built the payload.
    if (shipment.awbNumber) return shipment;

    // 7. Take the booking lock. Only the winner talks to DTDC; a loser that
    //    reached the row first would otherwise create a second real consignment
    //    for the same parcel, which DTDC bills for and nobody reconciles.
    const lockedAt = new Date();
    const staleBefore = new Date(Date.now() - BOOKING_LOCK_TTL_MS);

    const locked = await Shipment.findOneAndUpdate(
        {
            _id: shipment._id,
            awbNumber: { $in: [null, undefined] },
            $or: [
                { bookingLockedAt: null },
                { bookingLockedAt: { $exists: false } },
                { bookingLockedAt: { $lt: staleBefore } },
            ],
        },
        { $set: { bookingLockedAt: lockedAt } },
        { new: true }
    );

    if (!locked) {
        // Someone else is mid-booking. Wait for their AWB rather than placing a
        // second one; if it never lands, say so instead of guessing.
        const settled = await waitForAwb(shipment._id);
        if (settled?.awbNumber) return settled;
        throw new Error('A booking for this shipment is already in progress. Try again in a moment.');
    }

    shipment = locked;

    // 8. Call DTDC.
    let result;
    try {
        result = await dtdcClient.createShipment(consignmentData);
    } catch (error) {
        // The carrier refused. No AWB exists, so this is a genuine failure and
        // the row stays retryable — release the lock on the way out.
        shipment.status = ShipmentStatus.FAILED;
        shipment.failureReason = error.message;
        shipment.bookingLockedAt = null;
        await shipment.save();
        throw error;
    }

    // 9. Persist the AWB first. Everything after this point is recoverable;
    //    losing the AWB is not.
    shipment.awbNumber = result.reference_number;
    shipment.status = ShipmentStatus.BOOKED;
    // The row may predate this attempt (a retry, or a first booking that
    // failed). $setOnInsert did not touch it, so the parcel actually declared
    // is written here.
    shipment.weight = consignmentData.weight;
    shipment.weightSource = parcelMeta.weightSource;
    shipment.chargeableWeight = parcelMeta.chargeableWeight;
    shipment.volumetricWeight = parcelMeta.volumetricWeight;
    shipment.dimensions = {
        length: consignmentData.length,
        width:  consignmentData.width,
        height: consignmentData.height,
        unit:   consignmentData.dimension_unit,
    };
    shipment.bookedAt = new Date();
    shipment.failureReason = undefined;
    shipment.bookingLockedAt = null;
    shipment.trackingHistory.push({
        status: 'SOF',
        description: 'Shipment booked with DTDC',
        location: consignmentData.origin_details.city,
        timestamp: new Date(),
    });
    await shipment.save();

    // 10. Write tracking info back to the order. A failure here is logged, not
    //    thrown — the parcel is booked either way and the reconciliation job
    //    can repair the order record.
    try {
        order.trackingNumber = result.reference_number;
        await syncOrderWithShipment(order, shipment, {
            note: `DTDC shipment booked — AWB ${result.reference_number}`,
            source: 'dtdc',
            notify: false,
        });
        if (!order.integration.deliveryPartnerName) {
            order.integration.deliveryPartnerName = 'DTDC';
            await order.save();
        }
    } catch (error) {
        console.error(
            `[DTDC] Booked AWB ${result.reference_number} for order ${order._id} but the order write-back failed:`,
            error.message
        );
    }

    return shipment;
};

// ─── Cancellation ──────────────────────────────────────────────────────────

/**
 * Cancel a DTDC shipment.
 *
 * A parcel that has already been collected cannot be recalled through the
 * cancellation API — the correct instrument then is an RTO, which is a
 * different commercial event with a different cost. Refusing loudly here is
 * better than issuing a cancellation DTDC will ignore while DwellMart records
 * the shipment as cancelled.
 */
export const cancelDtdcShipment = async (order, vendorId = null) => {
    const shipment = await findDtdcShipment(order._id, vendorId);

    if (!shipment?.awbNumber) {
        throw new Error('No active DTDC shipment found for this order.');
    }

    if (shipment.status === ShipmentStatus.CANCELLED) {
        return shipment; // Idempotent.
    }

    const uncancellable = [
        ShipmentStatus.PICKED_UP,
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentStatus.DELIVERED,
        ShipmentStatus.RTO,
    ];
    if (uncancellable.includes(shipment.status)) {
        throw new Error(
            `Shipment is already ${String(shipment.status).replace(/_/g, ' ')} and cannot be cancelled. ` +
            'Raise a return/RTO instead.'
        );
    }

    await dtdcClient.cancelShipment(shipment.awbNumber);

    shipment.status = ShipmentStatus.CANCELLED;
    shipment.cancelledAt = new Date();
    shipment.trackingHistory.push({
        status: 'CAN',
        description: 'Shipment cancelled',
        timestamp: new Date(),
    });
    await shipment.save();

    await syncOrderWithShipment(order, shipment, {
        note: `DTDC shipment cancelled — AWB ${shipment.awbNumber}`,
        source: 'dtdc',
        notify: false,
    });

    return shipment;
};

// ─── Tracking ──────────────────────────────────────────────────────────────

/** Normalise the several shapes DTDC returns scan history in. */
const extractScans = (trackingData) => {
    const candidates = [
        trackingData?.trackHeader?.[0]?.strAction,
        trackingData?.trackDetails,
        trackingData?.trackingDetails,
        trackingData?.data?.trackDetails,
    ];
    for (const c of candidates) {
        if (Array.isArray(c) && c.length) return c;
    }
    return [];
};

const scanCodeOf = (scan) =>
    String(scan?.strActionStatus || scan?.strCode || scan?.status || '').trim();

const scanTimeOf = (scan) => {
    const raw = scan?.strActionDate
        ? `${scan.strActionDate}${scan.strActionTime ? ` ${scan.strActionTime}` : ''}`
        : (scan?.timestamp || scan?.date);
    const parsed = raw ? new Date(raw) : null;
    return parsed && !Number.isNaN(parsed.valueOf()) ? parsed : new Date();
};

/**
 * Pull tracking from DTDC and reconcile the Shipment and Order.
 *
 * The scan list is replaced rather than appended to: DTDC returns the full
 * history on every call, so appending duplicated the whole timeline each time
 * a vendor pressed Sync.
 */
export const syncTrackingStatus = async (order, vendorId = null) => {
    const shipment = await findDtdcShipment(order._id, vendorId);

    if (!shipment?.awbNumber) {
        throw new Error('No active DTDC shipment found for this order.');
    }

    const trackingData = await dtdcClient.getTrackingDetails(shipment.awbNumber);
    const scans = extractScans(trackingData);

    shipment.lastTrackingUpdate = new Date();
    shipment.lastTrackingPayload = trackingData;

    if (!scans.length) {
        await shipment.save();
        return shipment;
    }

    // Chronological order, so milestone timestamps land on the right scan.
    const ordered = [...scans].sort((a, b) => scanTimeOf(a) - scanTimeOf(b));

    shipment.trackingHistory = ordered.map((scan) => ({
        status:      scanCodeOf(scan),
        description: scan?.strAction || scan?.activity || scan?.description || '',
        location:    scan?.strOrigin || scan?.location || '',
        timestamp:   scanTimeOf(scan),
    }));

    // Walk forward through every scan so milestones recorded between syncs are
    // not lost by only reading the newest one.
    for (const scan of ordered) {
        const next = mapDtdcScanToShipmentStatus(scanCodeOf(scan));
        if (canAdvanceShipmentStatus(shipment.status, next)) {
            applyMilestone(shipment, next, scanTimeOf(scan));
            shipment.status = next;
        }
    }

    await shipment.save();

    await syncOrderWithShipment(order, shipment, {
        note: `Tracking synced — ${shipment.status}`,
        source: 'dtdc_pull',
    });

    return shipment;
};

/** Stamp the milestone date a status implies, without overwriting an earlier one. */
const applyMilestone = (shipment, status, at = new Date()) => {
    const field = {
        [ShipmentStatus.BOOKED]:           'bookedAt',
        [ShipmentStatus.PICKED_UP]:        'pickedUpAt',
        [ShipmentStatus.IN_TRANSIT]:       'inTransitAt',
        [ShipmentStatus.OUT_FOR_DELIVERY]: 'outForDeliveryAt',
        [ShipmentStatus.DELIVERED]:        'deliveredAt',
        [ShipmentStatus.CANCELLED]:        'cancelledAt',
    }[status];
    if (field && !shipment[field]) shipment[field] = at;
};

// ─── Label ─────────────────────────────────────────────────────────────────

/**
 * Get the shipping label (returns the raw Response for streaming).
 */
export const getShipmentLabel = async (order, vendorId = null) => {
    const shipment = await findDtdcShipment(order._id, vendorId);

    if (!shipment?.awbNumber) {
        throw new Error('No active DTDC shipment found for this order.');
    }
    if (shipment.status === ShipmentStatus.CANCELLED) {
        throw new Error('This shipment was cancelled — its label is no longer valid.');
    }

    return dtdcClient.getShippingLabel(shipment.awbNumber);
};

// ─── Webhook ───────────────────────────────────────────────────────────────

/**
 * Process a DTDC webhook payload and update the shipment and order.
 *
 * Contract with the route: this function decides whether an event is
 * actionable, and says so. It never throws for "we do not know this AWB" or
 * "we have seen this event" — both are ordinary and both must be acknowledged.
 *
 * @param {string} awbNumber
 * @param {string} dtdcScanCode
 * @param {object} rawPayload — full webhook body, kept for audit
 * @returns {{ shipment, order, skipped: boolean, reason?: string }}
 */
export const processDtdcWebhook = async (awbNumber, dtdcScanCode, rawPayload = {}) => {
    const shipment = await Shipment.findOne({
        awbNumber,
        deliveryProvider: DeliveryProviders.DTDC,
    });

    if (!shipment) {
        return { shipment: null, order: null, skipped: true, reason: 'unknown_awb' };
    }

    const order = await Order.findById(shipment.orderId);
    if (!order) {
        return { shipment, order: null, skipped: true, reason: 'order_missing' };
    }

    // Defence in depth. The provider resolver already routes Quick Commerce to
    // internal riders, so a QC order carrying a DTDC shipment means the data is
    // corrupt — refuse rather than quietly rewrite an unrelated lifecycle.
    const channel = resolveOrderChannel(order, shipment.vendorId);
    if (channel === VendorChannels.QUICK_COMMERCE) {
        return { shipment, order, skipped: true, reason: 'quick_commerce_order' };
    }

    const newStatus = mapDtdcScanToShipmentStatus(dtdcScanCode);
    const scanAt = rawPayload.timestamp ? new Date(rawPayload.timestamp) : new Date();
    const eventAt = Number.isNaN(scanAt.valueOf()) ? new Date() : scanAt;

    // Record every scan in history, even one that moves no state — the audit
    // trail is the only place an unrecognised code is visible afterwards.
    const alreadyRecorded = shipment.trackingHistory.some(
        (h) => h.status === dtdcScanCode
            && Math.abs(new Date(h.timestamp).getTime() - eventAt.getTime()) < 1000
    );

    if (!alreadyRecorded) {
        shipment.trackingHistory.push({
            status:      dtdcScanCode,
            description: rawPayload.description || rawPayload.activity || '',
            location:    rawPayload.location || '',
            timestamp:   eventAt,
        });
    }

    shipment.lastTrackingUpdate = new Date();
    shipment.lastTrackingPayload = rawPayload;

    if (!canAdvanceShipmentStatus(shipment.status, newStatus)) {
        await shipment.save();
        return {
            shipment,
            order,
            skipped: true,
            reason: newStatus ? 'no_forward_transition' : 'unknown_scan_code',
        };
    }

    shipment.status = newStatus;
    applyMilestone(shipment, newStatus, eventAt);

    if (newStatus === ShipmentStatus.NDR) {
        shipment.ndrDetails = {
            ...(shipment.ndrDetails?.toObject?.() ?? shipment.ndrDetails ?? {}),
            reason:        rawPayload.reason || rawPayload.description || '',
            attempts:      (shipment.ndrDetails?.attempts || 0) + 1,
            lastAttemptAt: eventAt,
        };
    }
    if (newStatus === ShipmentStatus.RTO) {
        shipment.rtoDetails = {
            ...(shipment.rtoDetails?.toObject?.() ?? shipment.rtoDetails ?? {}),
            initiatedAt: shipment.rtoDetails?.initiatedAt || eventAt,
            reason:      rawPayload.reason || rawPayload.description || '',
        };
    }

    await shipment.save();

    await syncOrderWithShipment(order, shipment, {
        note: `DTDC webhook: ${dtdcScanCode}`,
        source: 'dtdc_webhook',
        rawPayload,
    });

    return { shipment, order, skipped: false };
};

export default {
    bookingKey,
    normalizeAddress,
    isCodOrder,
    buildConsignmentPayload,
    findDtdcShipment,
    parseServiceabilityResponse,
    checkDtdcServiceability,
    bookDtdcShipment,
    cancelDtdcShipment,
    syncTrackingStatus,
    getShipmentLabel,
    processDtdcWebhook,
};
