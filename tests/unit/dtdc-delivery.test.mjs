/**
 * DTDC delivery — pure-logic regression suite.
 *
 * Everything here runs without a database or a network. The rules under test
 * are the ones whose failure is silent: a provider that routes the wrong way,
 * a scan code that rewrites a delivered parcel, a status value the Order
 * schema will refuse at save time.
 *
 * Database- and HTTP-level behaviour lives in
 * tests/integration/dtdcDelivery.test.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DeliveryProviders,
    resolveDeliveryProvider,
    isDtdcOrder,
    isInternalDelivery,
    assertProviderMatch,
} from '../../src/services/shipping/deliveryProvider.js';
import {
    ShipmentStatus,
    mapDtdcScanToShipmentStatus,
    isKnownDtdcScanCode,
    canAdvanceShipmentStatus,
    shipmentStatusToOrderStatus,
    shipmentStatusToPartnerStatus,
} from '../../src/constants/dtdcStatus.js';
import { dtdcConfig } from '../../src/config/dtdc.js';
import { VendorChannels } from '../../src/constants/vendorChannels.js';
import { INTEGRATION_PARTNER_STATUSES } from '../../src/models/Order.model.js';
import {
    advanceOrderStatus,
    recordPartnerStatus,
} from '../../src/services/shipping/orderShipmentSync.service.js';
import {
    normalizeAddress,
    isCodOrder,
    bookingKey,
} from '../../src/services/shipping/dtdcShipment.service.js';

// ─── Provider separation ───────────────────────────────────────────────────

test('Provider separation: retail routes to DTDC', () => {
    const order = { fulfillmentType: VendorChannels.RETAIL };
    const { provider, channel } = resolveDeliveryProvider(order);
    assert.equal(provider, DeliveryProviders.DTDC);
    assert.equal(channel, VendorChannels.RETAIL);
    assert.equal(isDtdcOrder(order), true);
    assert.equal(isInternalDelivery(order), false);
});

test('Provider separation: wholesale routes to DTDC', () => {
    const order = { fulfillmentType: VendorChannels.WHOLESALE };
    const { provider, channel } = resolveDeliveryProvider(order);
    assert.equal(provider, DeliveryProviders.DTDC);
    assert.equal(channel, VendorChannels.WHOLESALE);
    assert.equal(isDtdcOrder(order), true);
});

test('Provider separation: quick_commerce routes to INTERNAL riders', () => {
    const order = { fulfillmentType: VendorChannels.QUICK_COMMERCE };
    const { provider, channel } = resolveDeliveryProvider(order);
    assert.equal(provider, DeliveryProviders.INTERNAL);
    assert.equal(channel, VendorChannels.QUICK_COMMERCE);
    assert.equal(isDtdcOrder(order), false);
    assert.equal(isInternalDelivery(order), true);
});

test('Provider separation: the client cannot override the provider', () => {
    const retailOrder = { fulfillmentType: VendorChannels.RETAIL };
    assert.doesNotThrow(() => assertProviderMatch(retailOrder, 'dtdc'));
    assert.throws(() => assertProviderMatch(retailOrder, 'internal'), /provider mismatch/i);

    const qcOrder = { fulfillmentType: VendorChannels.QUICK_COMMERCE };
    assert.doesNotThrow(() => assertProviderMatch(qcOrder, 'internal'));
    assert.throws(() => assertProviderMatch(qcOrder, 'dtdc'), /provider mismatch/i);
});

test('Provider separation: a forged deliveryProvider field on the order is ignored', () => {
    // The only input that decides routing is the canonical channel.
    const forged = {
        fulfillmentType: VendorChannels.QUICK_COMMERCE,
        deliveryProvider: 'dtdc',
        orderType: 'retail',
        experience: 'marketplace',
    };
    assert.equal(resolveDeliveryProvider(forged).provider, DeliveryProviders.INTERNAL);
    assert.throws(() => assertProviderMatch(forged, 'dtdc'), /provider mismatch/i);
});

test('Provider separation: a forged orderType cannot pull a QC order onto DTDC', () => {
    // fulfillmentType is authoritative; orderType is a legacy fallback only.
    const order = { fulfillmentType: VendorChannels.QUICK_COMMERCE, orderType: 'wholesale' };
    assert.equal(isDtdcOrder(order), false);
});

test('Provider separation: a vendor slice decides routing on a split order', () => {
    const order = {
        fulfillmentType: VendorChannels.RETAIL,
        vendorItems: [
            { vendorId: 'v1', fulfillmentType: 'retail' },
            { vendorId: 'v2', fulfillmentType: 'quick_commerce' },
        ],
    };
    assert.equal(isDtdcOrder(order, 'v1'), true);
    assert.equal(isDtdcOrder(order, 'v2'), false);
});

test('Provider separation: a real split order slice cannot drag QC onto a courier', () => {
    // The exact document the OrderSplitterEngine writes for a Quick Commerce
    // order. `vendorItems[].orderType` comes from deriveOrderType(), which
    // reports a PRICING type and has no Quick Commerce value — so it always
    // says 'retail' here. While that slice outranked the order's own
    // fulfillmentType, a vendor-scoped lookup answered 'retail' and the parcel
    // resolved to DTDC.
    const qcOrder = {
        fulfillmentType: 'quick_commerce',
        orderType: 'retail',
        experience: 'quick_commerce',
        vendorItems: [{ vendorId: 'v1', orderType: 'retail', fulfillmentType: 'quick_commerce' }],
    };

    assert.equal(resolveDeliveryProvider(qcOrder).provider, DeliveryProviders.INTERNAL);
    assert.equal(resolveDeliveryProvider(qcOrder, 'v1').provider, DeliveryProviders.INTERNAL);
    assert.equal(isDtdcOrder(qcOrder, 'v1'), false);
    assert.throws(() => assertProviderMatch(qcOrder, 'dtdc', 'v1'), /provider mismatch/i);
});

test('Provider separation: a legacy QC slice with no channel still resolves internal', () => {
    // Orders written before vendorItems carried a channel. The order-level
    // fulfillmentType must win over the slice's legacy pricing type.
    const legacyQc = {
        fulfillmentType: 'quick_commerce',
        orderType: 'retail',
        vendorItems: [{ vendorId: 'v1', orderType: 'retail' }],
    };

    assert.equal(resolveDeliveryProvider(legacyQc, 'v1').provider, DeliveryProviders.INTERNAL);
    assert.equal(isDtdcOrder(legacyQc, 'v1'), false);
});

test('Provider separation: a wholesale slice reporting "mixed" pricing still routes to DTDC', () => {
    // deriveOrderType() returns 'mixed' when a group has both tiered and
    // untiered lines; 'mixed' is not a channel and must not be read as one.
    const order = {
        fulfillmentType: 'wholesale',
        vendorItems: [{ vendorId: 'v1', orderType: 'mixed', fulfillmentType: 'wholesale' }],
    };

    const { provider, channel } = resolveDeliveryProvider(order, 'v1');
    assert.equal(channel, VendorChannels.WHOLESALE);
    assert.equal(provider, DeliveryProviders.DTDC);
});

test('Provider separation: a genuinely split order routes each slice on its own channel', () => {
    const order = {
        fulfillmentType: 'retail',
        vendorItems: [
            { vendorId: 'v1', orderType: 'retail', fulfillmentType: 'retail' },
            { vendorId: 'v2', orderType: 'retail', fulfillmentType: 'quick_commerce' },
        ],
    };

    assert.equal(resolveDeliveryProvider(order, 'v1').provider, DeliveryProviders.DTDC);
    assert.equal(resolveDeliveryProvider(order, 'v2').provider, DeliveryProviders.INTERNAL);
});

// ─── Scan-code mapping ─────────────────────────────────────────────────────

test('Scan mapping: known codes map to the documented shipment status', () => {
    assert.equal(mapDtdcScanToShipmentStatus('SOF'), ShipmentStatus.BOOKED);
    assert.equal(mapDtdcScanToShipmentStatus('PKD'), ShipmentStatus.PICKED_UP);
    assert.equal(mapDtdcScanToShipmentStatus('INT'), ShipmentStatus.IN_TRANSIT);
    assert.equal(mapDtdcScanToShipmentStatus('OFD'), ShipmentStatus.OUT_FOR_DELIVERY);
    assert.equal(mapDtdcScanToShipmentStatus('DEL'), ShipmentStatus.DELIVERED);
    assert.equal(mapDtdcScanToShipmentStatus('CAN'), ShipmentStatus.CANCELLED);
    assert.equal(mapDtdcScanToShipmentStatus('UDL'), ShipmentStatus.NDR);
    assert.equal(mapDtdcScanToShipmentStatus('RTO'), ShipmentStatus.RTO);
});

test('Scan mapping: codes are case- and whitespace-insensitive', () => {
    assert.equal(mapDtdcScanToShipmentStatus(' del '), ShipmentStatus.DELIVERED);
});

test('Scan mapping: an unknown code changes nothing', () => {
    // Guessing IN_TRANSIT here is how a delivered parcel silently reverts.
    assert.equal(mapDtdcScanToShipmentStatus('ZZZ'), null);
    assert.equal(mapDtdcScanToShipmentStatus(''), null);
    assert.equal(mapDtdcScanToShipmentStatus(undefined), null);
    assert.equal(isKnownDtdcScanCode('ZZZ'), false);
    assert.equal(isKnownDtdcScanCode('DEL'), true);
});

// ─── Shipment state machine ────────────────────────────────────────────────

test('Shipment transitions: progress only ever moves forward', () => {
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.BOOKED, ShipmentStatus.PICKED_UP), true);
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT), true);
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED), true);

    // Out-of-order webhooks are routine and must not rewind the parcel.
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.IN_TRANSIT), false);
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.IN_TRANSIT, ShipmentStatus.BOOKED), false);
});

test('Shipment transitions: a repeated event is not a transition', () => {
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.DELIVERED, ShipmentStatus.DELIVERED), false);
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.IN_TRANSIT, ShipmentStatus.IN_TRANSIT), false);
});

test('Shipment transitions: terminal states are never reopened', () => {
    for (const terminal of [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED, ShipmentStatus.RTO]) {
        assert.equal(canAdvanceShipmentStatus(terminal, ShipmentStatus.IN_TRANSIT), false, terminal);
        assert.equal(canAdvanceShipmentStatus(terminal, ShipmentStatus.DELIVERED), false, terminal);
        assert.equal(canAdvanceShipmentStatus(terminal, ShipmentStatus.NDR), false, terminal);
    }
});

test('Shipment transitions: an exception may interrupt at any live point', () => {
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.IN_TRANSIT, ShipmentStatus.NDR), true);
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.RTO), true);
    // ...and an NDR reattempt can still succeed.
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.NDR, ShipmentStatus.DELIVERED), true);
});

test('Shipment transitions: an unknown status never advances anything', () => {
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.BOOKED, null), false);
    assert.equal(canAdvanceShipmentStatus(ShipmentStatus.BOOKED, undefined), false);
});

// ─── Order status mapping ──────────────────────────────────────────────────

test('Order mapping: retail and wholesale use their own vocabularies', () => {
    assert.equal(shipmentStatusToOrderStatus(ShipmentStatus.PICKED_UP, 'retail'), 'shipped');
    assert.equal(shipmentStatusToOrderStatus(ShipmentStatus.OUT_FOR_DELIVERY, 'retail'), 'out_for_delivery');
    assert.equal(shipmentStatusToOrderStatus(ShipmentStatus.DELIVERED, 'retail'), 'delivered');

    assert.equal(shipmentStatusToOrderStatus(ShipmentStatus.PICKED_UP, 'wholesale'), 'dispatched');
    assert.equal(shipmentStatusToOrderStatus(ShipmentStatus.OUT_FOR_DELIVERY, 'wholesale'), 'dispatched');
    assert.equal(shipmentStatusToOrderStatus(ShipmentStatus.DELIVERED, 'wholesale'), 'delivered');
});

test('Order mapping: booking alone moves no order state', () => {
    assert.equal(shipmentStatusToOrderStatus(ShipmentStatus.BOOKED, 'retail'), null);
    assert.equal(shipmentStatusToOrderStatus(ShipmentStatus.PENDING, 'retail'), null);
});

test('Order mapping: exceptions need business handling, not a silent transition', () => {
    for (const s of [ShipmentStatus.NDR, ShipmentStatus.RTO, ShipmentStatus.CANCELLED, ShipmentStatus.FAILED]) {
        assert.equal(shipmentStatusToOrderStatus(s, 'retail'), null, s);
    }
});

// ─── Partner status vocabulary ─────────────────────────────────────────────

test('Partner status: every shipment status maps into the Order enum', () => {
    // Writing a lowercase shipment status into Order.integration.partnerStatus
    // throws a ValidationError on save, which is exactly how the carrier
    // write-back used to fail after the AWB had already been issued.
    for (const status of Object.values(ShipmentStatus)) {
        const mapped = shipmentStatusToPartnerStatus(status);
        assert.ok(mapped, `no partner status for "${status}"`);
        assert.ok(
            INTEGRATION_PARTNER_STATUSES.includes(mapped),
            `"${mapped}" is not a valid Order.integration.partnerStatus`
        );
    }
});

test('Partner status: an unmappable value yields null rather than a bad write', () => {
    assert.equal(shipmentStatusToPartnerStatus('not_a_status'), null);
});

test('Partner status: recordPartnerStatus writes a schema-valid log entry', () => {
    const order = {};
    assert.equal(recordPartnerStatus(order, ShipmentStatus.DELIVERED, { note: 'x' }), true);
    assert.equal(order.integration.partnerStatus, 'DELIVERED');
    assert.equal(order.integration.logs.length, 1);
    assert.ok(INTEGRATION_PARTNER_STATUSES.includes(order.integration.logs[0].status));
    // `note` is the schema's field name; `message` was silently discarded.
    assert.equal(order.integration.logs[0].note, 'x');
});

test('Partner status: a repeated status adds no duplicate audit line', () => {
    const order = {};
    recordPartnerStatus(order, ShipmentStatus.IN_TRANSIT);
    recordPartnerStatus(order, ShipmentStatus.IN_TRANSIT);
    assert.equal(order.integration.logs.length, 1);
});

// ─── Order lifecycle advance ───────────────────────────────────────────────

test('Lifecycle: a carrier scan walks the retail ladder legally, never jumping', () => {
    const order = { status: 'confirmed', vendorItems: [] };
    const applied = advanceOrderStatus(order, 'shipped', 'retail');
    // confirmed → packed → shipped: the state machine forbids the direct jump.
    assert.deepEqual(applied, ['packed', 'shipped']);
    assert.equal(order.status, 'shipped');
    assert.ok(order.shippedAt);
});

test('Lifecycle: wholesale walks its own ladder', () => {
    const order = { status: 'approved', vendorItems: [] };
    const applied = advanceOrderStatus(order, 'dispatched', 'wholesale');
    assert.deepEqual(applied, ['processing', 'packed', 'dispatched']);
    assert.equal(order.status, 'dispatched');
});

test('Lifecycle: delivery stamps deliveredAt exactly once', () => {
    const order = { status: 'out_for_delivery', vendorItems: [] };
    advanceOrderStatus(order, 'delivered', 'retail');
    const first = order.deliveredAt;
    assert.ok(first);
    advanceOrderStatus(order, 'delivered', 'retail');
    assert.equal(order.deliveredAt, first);
});

test('Lifecycle: a late scan never moves an order backwards', () => {
    const order = { status: 'delivered', vendorItems: [] };
    assert.deepEqual(advanceOrderStatus(order, 'shipped', 'retail'), []);
    assert.equal(order.status, 'delivered');
});

test('Lifecycle: a cancelled order is not resurrected by a carrier scan', () => {
    const order = { status: 'cancelled', vendorItems: [] };
    assert.deepEqual(advanceOrderStatus(order, 'delivered', 'retail'), []);
    assert.equal(order.status, 'cancelled');
});

test('Lifecycle: an order without vendorItems is not marked cancelled', () => {
    // `allStatuses.every(...)` is true for an empty array — advancing through
    // the order services directly would set status to 'cancelled' here.
    const order = { status: 'packed', vendorItems: [] };
    advanceOrderStatus(order, 'shipped', 'retail', 'v1');
    assert.equal(order.status, 'shipped');
});

test('Lifecycle: on a split order only the delivering vendor slice moves', () => {
    const order = {
        status: 'packed',
        vendorItems: [
            { vendorId: 'v1', status: 'packed' },
            { vendorId: 'v2', status: 'packed' },
        ],
    };
    advanceOrderStatus(order, 'delivered', 'retail', 'v1');
    assert.equal(order.vendorItems[0].status, 'delivered');
    assert.equal(order.vendorItems[1].status, 'packed');
    // The order is delivered only once every seller's parcel has arrived.
    assert.notEqual(order.status, 'delivered');
});

// ─── Payload construction ──────────────────────────────────────────────────

test('Address: the nested PickupLocation shape flattens correctly', () => {
    const flat = normalizeAddress({
        name: 'Main Warehouse',
        phone: '9888888888',
        address: { street: '12 MG Road', city: 'Hyderabad', state: 'Telangana', zipCode: '500034' },
    });
    assert.equal(flat.addressLine1, '12 MG Road');
    assert.equal(flat.city, 'Hyderabad');
    assert.equal(flat.state, 'Telangana');
    // `zipCode` is the field this codebase actually stores; reading `pincode`
    // produced an empty string and DTDC rejected every consignment.
    assert.equal(flat.pincode, '500034');
});

test('Address: the flat Order.shippingAddress shape flattens correctly', () => {
    const flat = normalizeAddress({
        name: 'Ravi Kumar', phone: '9777777777',
        address: '5 Park Street', city: 'New Delhi', state: 'Delhi', zipCode: '110001',
    });
    assert.equal(flat.addressLine1, '5 Park Street');
    assert.equal(flat.pincode, '110001');
    assert.equal(flat.name, 'Ravi Kumar');
});

test('Address: a nested address object never leaks into a string field', () => {
    const flat = normalizeAddress({ address: { street: 'A', city: 'B', state: 'C', zipCode: '1' } });
    assert.equal(typeof flat.addressLine1, 'string');
});

test('COD: the stored lowercase payment method is recognised', () => {
    // The schema enum is lowercase 'cod'; comparing against 'COD' meant every
    // COD consignment was booked with a zero collection amount.
    assert.equal(isCodOrder({ paymentMethod: 'cod' }), true);
    assert.equal(isCodOrder({ paymentMethod: 'COD' }), true);
    assert.equal(isCodOrder({ paymentMethod: 'cash' }), true);
    assert.equal(isCodOrder({ paymentMethod: 'upi' }), false);
});

test('COD: an already-paid order collects nothing on the doorstep', () => {
    assert.equal(isCodOrder({ paymentMethod: 'cod', paymentStatus: 'paid' }), false);
});

test('Idempotency key is per (order, vendor), not per order', () => {
    assert.notEqual(bookingKey('o1', 'v1'), bookingKey('o1', 'v2'));
    assert.equal(bookingKey('o1', 'v1'), bookingKey('o1', 'v1'));
});

// ─── Configuration hygiene ─────────────────────────────────────────────────

test('Config: the safe representation never exposes secrets', () => {
    const safeStr = dtdcConfig.toSafeString();
    assert.equal(typeof safeStr, 'string');
    if (dtdcConfig.apiKey) assert.equal(safeStr.includes(dtdcConfig.apiKey), false);
    if (dtdcConfig.trackingPassword) assert.equal(safeStr.includes(dtdcConfig.trackingPassword), false);
    if (dtdcConfig.webhookSecret) assert.equal(safeStr.includes(dtdcConfig.webhookSecret), false);
});

test('Config: endpoints switch with the environment', () => {
    const original = process.env.DTDC_ENVIRONMENT;
    try {
        process.env.DTDC_ENVIRONMENT = 'production';
        assert.ok(dtdcConfig.getEndpoints().booking.includes('pxapi.dtdc.in'));
        process.env.DTDC_ENVIRONMENT = 'sandbox';
        assert.ok(dtdcConfig.getEndpoints().booking.includes('shipsy.io'));
    } finally {
        if (original === undefined) delete process.env.DTDC_ENVIRONMENT;
        else process.env.DTDC_ENVIRONMENT = original;
    }
});

test('Config: no credential is hard-coded in the source', () => {
    // Every value must come from the environment; a literal here would ship a
    // live key into the repository.
    const original = { ...process.env };
    try {
        for (const key of ['DTDC_API_KEY', 'DTDC_CUSTOMER_CODE', 'DTDC_TRACKING_USERNAME', 'DTDC_TRACKING_PASSWORD']) {
            delete process.env[key];
        }
        assert.equal(dtdcConfig.apiKey, '');
        assert.equal(dtdcConfig.customerCode, '');
        assert.equal(dtdcConfig.validate().valid, false);
    } finally {
        Object.assign(process.env, original);
    }
});

test('Config: production uses the contracted B2C service types', () => {
    // DTDC issued 'B2C SMART EXPRESS' and 'B2C PRIORITY' for GL20107. The
    // sandbox names ('GROUND EXPRESS' / 'PRIORITY') are NOT valid there, and
    // sending one is rejected at booking — after the customer has paid.
    const original = { ...process.env };
    try {
        for (const key of ['DTDC_RETAIL_SERVICE_TYPE', 'DTDC_WHOLESALE_SERVICE_TYPE']) {
            delete process.env[key];
        }

        process.env.DTDC_ENVIRONMENT = 'production';
        assert.equal(dtdcConfig.retailServiceType, 'B2C PRIORITY');
        assert.equal(dtdcConfig.wholesaleServiceType, 'B2C SMART EXPRESS');

        process.env.DTDC_ENVIRONMENT = 'sandbox';
        assert.equal(dtdcConfig.retailServiceType, 'PRIORITY');
        assert.equal(dtdcConfig.wholesaleServiceType, 'GROUND EXPRESS');
    } finally {
        for (const key of Object.keys(process.env)) {
            if (!(key in original)) delete process.env[key];
        }
        Object.assign(process.env, original);
    }
});

test('Config: the B2C service names carry the right volumetric divisor', async () => {
    // B2C SMART EXPRESS is 7D (surface, /4750); B2C PRIORITY is 7X (air, /5000).
    // Reading a surface parcel on the air divisor under-states the chargeable
    // weight by ~5%, which shows up as a discrepancy charge on the invoice.
    const { volumetricDivisorFor } = await import('../../src/services/shipping/parcelMetrics.js');

    assert.equal(volumetricDivisorFor('B2C PRIORITY'), 5000);
    assert.equal(volumetricDivisorFor('B2C SMART EXPRESS'), 4750);
    assert.equal(volumetricDivisorFor('PRIORITY'), 5000);
    assert.equal(volumetricDivisorFor('GROUND EXPRESS'), 4750);
    // An unrecognised service must not silently pick the cheaper divisor.
    assert.equal(volumetricDivisorFor('SOMETHING NEW'), 5000);
});
