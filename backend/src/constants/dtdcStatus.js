/**
 * DTDC Scan-Code → Internal Shipment Status mapping.
 *
 * DTDC uses short alphabetic scan codes for tracking events. This module maps
 * them onto our internal `Shipment.status` enum, and from there onto:
 *
 *   - the DwellMart order status, via the EXISTING retail/wholesale state
 *     machines (see services/orders/*OrderService.js) — the carrier
 *     integration introduces no order states of its own;
 *   - `Order.integration.partnerStatus`, which has its own fixed, UPPERCASE
 *     vocabulary shared with the third-party partner API. Writing a shipment
 *     status straight into that field fails Mongoose enum validation, so the
 *     translation below is mandatory rather than cosmetic.
 *
 * Sources:
 *   - DTDC Track Scan Codes spreadsheet
 *   - DTDC API tracking response examples
 */

import { INTEGRATION_PARTNER_STATUSES } from '../models/Order.model.js';

/** Our Shipment.status enum values. */
export const ShipmentStatus = Object.freeze({
    PENDING:          'pending',
    BOOKED:           'booked',
    PICKED_UP:        'picked_up',
    IN_TRANSIT:       'in_transit',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    DELIVERED:        'delivered',
    CANCELLED:        'cancelled',
    RTO:              'rto',
    NDR:              'ndr',
    FAILED:           'failed',
});

export const SHIPMENT_STATUS_VALUES = Object.freeze(Object.values(ShipmentStatus));

/**
 * Statuses after which a shipment is finished and must not be re-opened by a
 * late or replayed scan.
 */
export const TERMINAL_SHIPMENT_STATUSES = Object.freeze([
    ShipmentStatus.DELIVERED,
    ShipmentStatus.CANCELLED,
    ShipmentStatus.RTO,
]);

/**
 * Monotonic progress rank. A scan may only move a shipment forward.
 *
 * Out-of-order webhooks are normal — DTDC pushes over an unordered queue, and
 * an IN_TRANSIT event routinely lands after the DELIVERED one. Without a rank
 * the shipment would flap back out of `delivered` and the customer would watch
 * a delivered order revert to in-transit.
 *
 * Exception states (NDR / RTO / CANCELLED / FAILED) sit outside the ladder and
 * are handled explicitly by `canAdvanceShipmentStatus`.
 */
const PROGRESS_RANK = Object.freeze({
    [ShipmentStatus.PENDING]:          0,
    [ShipmentStatus.BOOKED]:           1,
    [ShipmentStatus.PICKED_UP]:        2,
    [ShipmentStatus.IN_TRANSIT]:       3,
    [ShipmentStatus.OUT_FOR_DELIVERY]: 4,
    [ShipmentStatus.DELIVERED]:        5,
});

const EXCEPTION_STATUSES = new Set([
    ShipmentStatus.NDR,
    ShipmentStatus.RTO,
    ShipmentStatus.CANCELLED,
    ShipmentStatus.FAILED,
]);

/**
 * DTDC scan code → internal shipment status.
 *
 * Unknown codes deliberately return `null` rather than guessing. A guessed
 * IN_TRANSIT on an unrecognised code silently rewrites a delivered shipment;
 * `null` means "record the scan in history, change no state", which is the
 * only safe reading of a code we do not understand.
 */
const DTDC_SCAN_MAP = Object.freeze({
    // ─── Booking / Manifest ─────────────────────────────────────────────
    SOF: ShipmentStatus.BOOKED,           // Soft data uploaded
    MAN: ShipmentStatus.BOOKED,           // Manifested
    BKD: ShipmentStatus.BOOKED,           // Booked

    // ─── Pickup ─────────────────────────────────────────────────────────
    PKD: ShipmentStatus.PICKED_UP,
    PKP: ShipmentStatus.PICKED_UP,
    PKU: ShipmentStatus.PICKED_UP,

    // ─── In Transit ─────────────────────────────────────────────────────
    INT: ShipmentStatus.IN_TRANSIT,
    RAD: ShipmentStatus.IN_TRANSIT,       // Reached at destination hub
    BAG: ShipmentStatus.IN_TRANSIT,
    SHP: ShipmentStatus.IN_TRANSIT,
    ARR: ShipmentStatus.IN_TRANSIT,
    DPT: ShipmentStatus.IN_TRANSIT,
    DSP: ShipmentStatus.IN_TRANSIT,

    // ─── Out for Delivery ───────────────────────────────────────────────
    OFD: ShipmentStatus.OUT_FOR_DELIVERY,

    // ─── Delivered ──────────────────────────────────────────────────────
    DEL: ShipmentStatus.DELIVERED,
    DLV: ShipmentStatus.DELIVERED,

    // ─── NDR (Non-Delivery Report) ──────────────────────────────────────
    UDL:    ShipmentStatus.NDR,
    NDR:    ShipmentStatus.NDR,
    RCL:    ShipmentStatus.NDR,
    // The code DTDC's own Push API document uses in its worked example
    // ("strAction": "NONDLV", "strActionDesc": "Not Delivered"). Its absence
    // meant a failed delivery attempt arrived and changed nothing.
    NONDLV: ShipmentStatus.NDR,

    // ─── RTO (Return to Origin) ─────────────────────────────────────────
    RTO: ShipmentStatus.RTO,
    RTD: ShipmentStatus.RTO,
    RTN: ShipmentStatus.RTO,

    // ─── Cancellation ───────────────────────────────────────────────────
    CAN: ShipmentStatus.CANCELLED,
    CNL: ShipmentStatus.CANCELLED,

    // ─── Failed ─────────────────────────────────────────────────────────
    DMG: ShipmentStatus.FAILED,           // Damaged
    LST: ShipmentStatus.FAILED,           // Lost
});

/**
 * Map a DTDC scan code to our internal shipment status.
 *
 * @param {string} scanCode  DTDC scan code (e.g. 'DEL', 'OFD')
 * @returns {string|null} a ShipmentStatus value, or null when the code is not
 *                        recognised and no state change should be inferred.
 */
export const mapDtdcScanToShipmentStatus = (scanCode) => {
    const code = String(scanCode || '').trim().toUpperCase();
    return DTDC_SCAN_MAP[code] ?? null;
};

/** True when the code is one we have an explicit mapping for. */
export const isKnownDtdcScanCode = (scanCode) =>
    mapDtdcScanToShipmentStatus(scanCode) !== null;


/**
 * Parse DTDC's date and time format into a Date.
 *
 * The Push API sends `strActionDate` as DDMMYYYY and `strActionTime` as
 * HHMMSS -- e.g. "10022025" + "141424" is 10 February 2025, 14:14:24. Neither
 * is parseable by `new Date()`, which reads "10022025" as invalid and would
 * have stamped every scan with the moment it was RECEIVED rather than the
 * moment it happened.
 *
 * @param {string} ddmmyyyy
 * @param {string} [hhmmss]
 * @returns {Date|null} null when the input is unusable
 */
export const parseDtdcDateTime = (ddmmyyyy, hhmmss = '') => {
    const date = String(ddmmyyyy == null ? '' : ddmmyyyy).trim();
    if (!/^[0-9]{8}$/.test(date)) return null;

    const day = Number(date.slice(0, 2));
    const month = Number(date.slice(2, 4));
    const year = Number(date.slice(4, 8));
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;

    const time = String(hhmmss == null ? '' : hhmmss).trim();
    const usable = /^[0-9]{4,6}$/.test(time);
    const hours = usable ? Number(time.slice(0, 2)) : 0;
    const minutes = usable ? Number(time.slice(2, 4)) : 0;
    const seconds = usable && time.length >= 6 ? Number(time.slice(4, 6)) : 0;

    const parsed = new Date(year, month - 1, day, hours, minutes, seconds);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

/**
 * Decide whether `next` is a legal move from `current`.
 *
 * Rules, in order:
 *   - a terminal shipment never changes again;
 *   - an exception state (NDR / RTO / CANCELLED / FAILED) may be entered from
 *     any non-terminal state — a delivery can fail at any point;
 *   - a shipment sitting in NDR or FAILED may rejoin the ladder, because a
 *     reattempt or a rebook does succeed;
 *   - otherwise the progress rank must strictly increase.
 */
export const canAdvanceShipmentStatus = (current, next) => {
    if (!next || current === next) return false;
    if (TERMINAL_SHIPMENT_STATUSES.includes(current)) return false;
    if (EXCEPTION_STATUSES.has(next)) return true;
    if (current === ShipmentStatus.NDR || current === ShipmentStatus.FAILED) return true;

    const from = PROGRESS_RANK[current];
    const to = PROGRESS_RANK[next];
    if (from === undefined || to === undefined) return false;
    return to > from;
};

/**
 * Internal shipment status → `Order.integration.partnerStatus`.
 *
 * The partner vocabulary is fixed and shared with the third-party delivery API
 * (`INTEGRATION_PARTNER_STATUSES`), so it is deliberately coarser than the
 * shipment status: `in_transit` folds into PICKED_UP because the partner enum
 * has no transit state, and the precise carrier status stays on the Shipment
 * document where nothing is lost.
 */
const PARTNER_STATUS_MAP = Object.freeze({
    [ShipmentStatus.PENDING]:          'READY_FOR_ASSIGNMENT',
    [ShipmentStatus.BOOKED]:           'ASSIGNED',
    [ShipmentStatus.PICKED_UP]:        'PICKED_UP',
    [ShipmentStatus.IN_TRANSIT]:       'PICKED_UP',
    [ShipmentStatus.OUT_FOR_DELIVERY]: 'OUT_FOR_DELIVERY',
    [ShipmentStatus.DELIVERED]:        'DELIVERED',
    [ShipmentStatus.NDR]:              'DELIVERY_FAILED',
    [ShipmentStatus.RTO]:              'DELIVERY_FAILED',
    [ShipmentStatus.FAILED]:           'DELIVERY_FAILED',
    [ShipmentStatus.CANCELLED]:        'CANCELLED',
});

/**
 * @param {string} shipmentStatus
 * @returns {string|null} a value guaranteed to satisfy the
 *          `Order.integration.partnerStatus` enum, or null if unmappable.
 */
export const shipmentStatusToPartnerStatus = (shipmentStatus) => {
    const mapped = PARTNER_STATUS_MAP[shipmentStatus] ?? null;
    // Belt and braces: never hand the Order model a value its enum rejects.
    return mapped && INTEGRATION_PARTNER_STATUSES.includes(mapped) ? mapped : null;
};

/**
 * Map a shipment status to the DwellMart order status it implies.
 *
 * Every value below is a pre-existing state of the retail or wholesale state
 * machine:
 *
 *   Retail:    pending → confirmed → packed → shipped → out_for_delivery → delivered
 *   Wholesale: pending → approved → processing → packed → dispatched → delivered
 *
 * NDR, RTO, CANCELLED and FAILED map to `null`: they are shipment-level
 * conditions that need explicit business handling (reattempt, refund, rebook)
 * rather than a silent order transition.
 *
 * @param {string} shipmentStatus
 * @param {string} channel 'retail' | 'wholesale'
 * @returns {string|null}
 */
export const shipmentStatusToOrderStatus = (shipmentStatus, channel) => {
    const isWholesale = String(channel || '').toLowerCase() === 'wholesale';

    const map = {
        [ShipmentStatus.PENDING]:          null,
        // Booking alone moves no order state — the goods have not left the seller.
        [ShipmentStatus.BOOKED]:           null,
        [ShipmentStatus.PICKED_UP]:        isWholesale ? 'dispatched' : 'shipped',
        [ShipmentStatus.IN_TRANSIT]:       isWholesale ? 'dispatched' : 'shipped',
        [ShipmentStatus.OUT_FOR_DELIVERY]: isWholesale ? 'dispatched' : 'out_for_delivery',
        [ShipmentStatus.DELIVERED]:        'delivered',
        [ShipmentStatus.CANCELLED]:        null,
        [ShipmentStatus.NDR]:              null,
        [ShipmentStatus.RTO]:              null,
        [ShipmentStatus.FAILED]:           null,
    };

    return map[shipmentStatus] ?? null;
};

export default {
    ShipmentStatus,
    SHIPMENT_STATUS_VALUES,
    TERMINAL_SHIPMENT_STATUSES,
    mapDtdcScanToShipmentStatus,
    isKnownDtdcScanCode,
    parseDtdcDateTime,
    canAdvanceShipmentStatus,
    shipmentStatusToOrderStatus,
    shipmentStatusToPartnerStatus,
};
