/**
 * Quick Commerce order lifecycle — placement through OTP delivery.
 *
 * This is the suite whose absence allowed a non-functional module to ship
 * behind 353 passing assertions. Every step crosses a real HTTP boundary as the
 * corresponding actor, in order, against a real database:
 *
 *   customer discovers → checks out → store accepts → prepares → readies
 *   → rider is assigned → picks up → moves → arrives → delivers with OTP
 *
 * A step that cannot run is recorded as BLOCKED and counts as a failure. A
 * lifecycle that stops halfway has not been verified, and reporting it as green
 * is precisely the mistake this file exists to prevent.
 */

import mongoose from 'mongoose';
import Order from '../../src/models/Order.model.js';
import DeliveryBoy from '../../src/models/DeliveryBoy.model.js';
import { asActor, get } from './support/client.mjs';
import { beginSuite, check, checkStatus, checkKnownGap, blockedByGap } from './support/gate.mjs';
import { seedStandardWorld, shippingAddress, ORIGIN, offsetByKm } from './support/seed.mjs';
import { authenticateWorld } from './support/auth.mjs';
import { resetTestDatabase } from './support/database.mjs';
import { clearResponseCache } from '../../src/middlewares/responseCache.js';
import { QUICK_COMMERCE_ORDER_STATUS } from '../../src/constants/quickCommerce.js';
import { EXPERIENCES } from '../../src/constants/experiences.js';

const QC = EXPERIENCES.QUICK_COMMERCE;

export const run = async () => {
    beginSuite('Quick Commerce — order lifecycle');

    await resetTestDatabase();
    clearResponseCache();

    const world = await seedStandardWorld();
    const tokens = await authenticateWorld(world);

    const customer = asActor(tokens.customer.token, QC);
    const vendor = asActor(tokens.vendor.token);
    const rider = asActor(tokens.quickRider.token);

    const customerLocation = offsetByKm(ORIGIN, 1, 0); // 1km from the store

    // ── 1. Discovery ─────────────────────────────────────────────────────────
    const serviceability = await get('/quick/serviceability', {
        query: { lat: customerLocation.latitude, lng: customerLocation.longitude },
    });
    checkStatus(serviceability, 200, 'customer can check Quick Commerce serviceability');
    check(
        serviceability.data?.serviceable === true,
        'the seeded store makes the location serviceable',
        JSON.stringify(serviceability.data)
    );

    const nearby = await get('/quick/vendors/nearby', {
        query: { lat: customerLocation.latitude, lng: customerLocation.longitude },
    });
    checkStatus(nearby, 200, 'customer can list nearby stores');
    check(
        (nearby.data?.vendors || []).some(
            (v) => String(v._id) === String(world.vendor.document._id)
        ),
        'the seeded store appears in nearby results'
    );
    check(
        (nearby.data?.vendors || []).every((v) => v.location === undefined),
        'nearby payload never exposes exact store coordinates',
        'a vendor object contained a location field'
    );

    // ── 2. Checkout estimate ─────────────────────────────────────────────────
    const estimate = await customer.post('/quick/checkout/estimate', {
        body: {
            items: [{ productId: String(world.products.quick._id), quantity: 2 }],
            latitude: customerLocation.latitude,
            longitude: customerLocation.longitude,
        },
    });
    checkStatus(estimate, 200, 'customer can fetch a Quick Commerce checkout estimate');
    check(estimate.data?.available === true, 'the estimate reports the cart as deliverable',
        JSON.stringify(estimate.data));
    check(
        Number(estimate.data?.deliveryFee) > 0 && Number.isFinite(Number(estimate.data?.eta?.etaMinutes)),
        'the estimate returns a delivery fee and an ETA',
        `fee=${estimate.data?.deliveryFee} eta=${estimate.data?.eta?.etaMinutes}`
    );

    // ── 3. Placement ─────────────────────────────────────────────────────────
    const placement = await customer.post('/user/orders', {
        body: {
            items: [{ productId: String(world.products.quick._id), quantity: 2 }],
            shippingAddress: shippingAddress({ email: world.customer.email }),
            paymentMethod: 'cash',
            customerLocation,
        },
    });
    // FLOW-3: `validate()` strips `customerLocation` before placeOrder reads it,
    // so this fails unconditionally today — the order cannot even be created.
    const placed = checkStatus(
        placement,
        201,
        'customer can place a Quick Commerce order'
    );

    if (!placed) {
        blockedByGap(
            'FLOW-3',
            'the entire downstream Quick Commerce lifecycle',
            'no order exists, so store acceptance, rider assignment, tracking and OTP delivery '
            + 'cannot be exercised. Quick Commerce is non-functional from the first write.'
        );
        return;
    }

    const orderId = placement.data?.orderId || placement.data?.order?.orderId;
    const orderDoc = await Order.findOne({ orderId }).lean();

    check(Boolean(orderDoc), 'the order was persisted', `orderId=${orderId}`);
    check(orderDoc?.experience === QC, 'the order is tagged as Quick Commerce', orderDoc?.experience);
    check(
        orderDoc?.quickCommerce?.status === QUICK_COMMERCE_ORDER_STATUS.PLACED,
        'the order starts in the placed stage',
        orderDoc?.quickCommerce?.status
    );
    check(
        Number(orderDoc?.quickCommerce?.promisedEtaMinutes) > 0,
        'an ETA promise was locked in at checkout',
        String(orderDoc?.quickCommerce?.promisedEtaMinutes)
    );
    check(
        Number(orderDoc?.quickCommerce?.deliveryFee) > 0,
        'the distance-based delivery fee was persisted',
        String(orderDoc?.quickCommerce?.deliveryFee)
    );
    // The seeded product is 150 at 18% exclusive tax, quantity 2.
    // subtotal 300, tax 54 added on top, plus the distance fee and packaging.
    const expectedSubtotal = 300;
    const expectedTax = 54;
    const expectedTotal = Number(
        (
            expectedSubtotal
            + expectedTax
            + Number(orderDoc?.quickCommerce?.deliveryFee || 0)
            + Number(orderDoc?.quickCommerce?.packagingFee || 0)
        ).toFixed(2)
    );
    check(
        Number(orderDoc?.subtotal) === expectedSubtotal,
        'the persisted subtotal is server-derived from product price, not client input',
        `${orderDoc?.subtotal} (expected ${expectedSubtotal})`
    );
    check(
        Number(orderDoc?.total) === expectedTotal,
        'the charged total equals subtotal + tax + delivery fee + packaging fee',
        `${orderDoc?.total} (expected ${expectedTotal})`
    );
    check(
        Number(orderDoc?.shipping) === Number(orderDoc?.quickCommerce?.deliveryFee),
        'the shipping field carries the Quick Commerce delivery fee',
        `shipping=${orderDoc?.shipping} deliveryFee=${orderDoc?.quickCommerce?.deliveryFee}`
    );

    const orderRefId = String(orderDoc._id);

    // ── 4. Automatic rider assignment ────────────────────────────────────────
    check(
        String(orderDoc?.deliveryBoyId || '') === String(world.quickRider.document._id),
        'the nearest Quick Commerce rider was assigned automatically at placement',
        `assigned=${orderDoc?.deliveryBoyId} expected=${world.quickRider.document._id}`
    );
    check(
        orderDoc?.quickCommerce?.assignment?.status === 'assigned',
        'assignment status records success',
        orderDoc?.quickCommerce?.assignment?.status
    );

    const claimedRider = await DeliveryBoy.findById(world.quickRider.document._id).lean();
    check(
        String(claimedRider?.activeOrderId || '') === orderRefId,
        'the rider was atomically claimed for this order',
        `activeOrderId=${claimedRider?.activeOrderId}`
    );
    check(claimedRider?.status === 'busy', 'the claimed rider is marked busy', claimedRider?.status);

    // ── 5. Store accepts, prepares, readies ──────────────────────────────────
    // The endpoint exists and works; the audit's finding is that no UI calls
    // it. That is a frontend contract failure, asserted in the contract suite.
    const accept = await vendor.patch(`/vendor/orders/${orderRefId}/quick-status`, {
        body: { status: 'accepted' },
    });
    const accepted = checkStatus(accept, 200, 'store can accept the order via the API');

    const preparing = await vendor.patch(`/vendor/orders/${orderRefId}/quick-status`, {
        body: { status: 'preparing' },
    });
    checkStatus(preparing, 200, 'store can move the order to preparing');

    const ready = await vendor.patch(`/vendor/orders/${orderRefId}/quick-status`, {
        body: { status: 'ready' },
    });
    const isReady = checkStatus(ready, 200, 'store can mark the order ready for pickup');

    // Accepting must stop the escalation clock.
    const afterAccept = await Order.findById(orderRefId).lean();
    check(
        Boolean(afterAccept?.quickCommerce?.vendorAcknowledgedAt),
        'accepting the order acknowledges the urgent alert',
        String(afterAccept?.quickCommerce?.vendorAcknowledgedAt)
    );
    check(
        afterAccept?.status === 'processing',
        'the coarse Marketplace status stays in step with the Quick Commerce stage',
        afterAccept?.status
    );

    // A store must not be able to skip to a rider-owned stage.
    const illegalJump = await vendor.patch(`/vendor/orders/${orderRefId}/quick-status`, {
        body: { status: 'delivered' },
    });
    checkStatus(illegalJump, [400, 403, 409], 'store cannot mark an order delivered');

    if (!accepted || !isReady) {
        blocked('rider lifecycle steps', 'the store could not bring the order to ready');
        return;
    }

    // ── 6. Rider location reporting ──────────────────────────────────────────
    const ping = await rider.patch('/delivery/location', {
        body: { latitude: ORIGIN.latitude, longitude: ORIGIN.longitude },
    });
    checkStatus(ping, 200, 'rider can report their location');

    const pingedRider = await DeliveryBoy.findById(world.quickRider.document._id).lean();
    check(
        Array.isArray(pingedRider?.location?.coordinates)
        && Math.abs(pingedRider.location.coordinates[0] - ORIGIN.longitude) < 1e-6
        && Math.abs(pingedRider.location.coordinates[1] - ORIGIN.latitude) < 1e-6,
        'the location ping writes GeoJSON in [lng, lat] order',
        JSON.stringify(pingedRider?.location?.coordinates)
    );
    check(
        Number(pingedRider?.currentLocation?.lat) === ORIGIN.latitude
        && Number(pingedRider?.currentLocation?.lng) === ORIGIN.longitude,
        'the legacy currentLocation field is still dual-written',
        JSON.stringify(pingedRider?.currentLocation)
    );

    // ── 7. Customer tracking ─────────────────────────────────────────────────
    const tracking = await customer.get(`/user/orders/${orderRefId}/tracking`);
    checkStatus(tracking, 200, 'customer can track their own order');
    check(tracking.data?.isQuickCommerce === true, 'tracking identifies the order as Quick Commerce');
    check(
        Boolean(tracking.data?.rider?.name),
        'tracking exposes the assigned rider to the customer'
    );

    // Ownership: another customer must not be able to track this order.
    const { seedCustomer } = await import('./support/seed.mjs');
    const { loginCustomer } = await import('./support/auth.mjs');
    const stranger = await seedCustomer();
    const strangerAuth = await loginCustomer(stranger.email, stranger.password);
    const strangerTracking = await asActor(strangerAuth.token, QC).get(
        `/user/orders/${orderRefId}/tracking`
    );
    checkStatus(strangerTracking, 404, 'a different customer cannot track someone else\'s order');

    // ── 8. Rider transit and OTP delivery ────────────────────────────────────
    const pickup = await rider.patch(`/delivery/orders/${orderRefId}/quick-status`, {
        body: { status: 'picked_up' },
    });
    const pickedUp = checkStatus(pickup, 200, 'rider can mark the order picked up');

    const arriving = await rider.patch(`/delivery/orders/${orderRefId}/quick-status`, {
        body: { status: 'arriving' },
    });
    checkStatus(arriving, 200, 'rider can mark the order arriving');

    // Delivery requires the customer's OTP.
    const noOtp = await rider.patch(`/delivery/orders/${orderRefId}/quick-status`, {
        body: { status: 'delivered' },
    });
    checkStatus(noOtp, 400, 'delivery without an OTP is rejected');

    const wrongOtp = await rider.patch(`/delivery/orders/${orderRefId}/quick-status`, {
        body: { status: 'delivered', otp: '000000' },
    });
    checkStatus(wrongOtp, 400, 'delivery with an incorrect OTP is rejected');

    if (!pickedUp) {
        blocked('OTP delivery', 'the order never reached the picked_up stage');
        return;
    }

    // The OTP is hashed in storage; the debug copy exists only outside production.
    const withOtp = await Order.findById(orderRefId).select('+deliveryOtpDebug +deliveryOtpHash').lean();
    check(
        Boolean(withOtp?.deliveryOtpHash),
        'a delivery OTP was generated and stored hashed at pickup'
    );

    const otp = withOtp?.deliveryOtpDebug;
    if (!otp) {
        blocked('OTP delivery', 'no debug OTP available — set NODE_ENV to a non-production value');
        return;
    }

    const delivered = await rider.patch(`/delivery/orders/${orderRefId}/quick-status`, {
        body: { status: 'delivered', otp },
    });
    checkStatus(delivered, 200, 'rider completes delivery with the correct OTP');

    // ── 9. Completion state ──────────────────────────────────────────────────
    const finalOrder = await Order.findById(orderRefId).lean();
    check(
        finalOrder?.quickCommerce?.status === QUICK_COMMERCE_ORDER_STATUS.DELIVERED,
        'the order reaches the delivered stage',
        finalOrder?.quickCommerce?.status
    );
    check(finalOrder?.status === 'delivered', 'the Marketplace status is delivered', finalOrder?.status);
    check(
        Number(finalOrder?.quickCommerce?.actualEtaMinutes) >= 1,
        'the actual delivery time was measured and recorded',
        String(finalOrder?.quickCommerce?.actualEtaMinutes)
    );
    check(
        typeof finalOrder?.quickCommerce?.slaBreached === 'boolean',
        'the SLA outcome was evaluated against the promise'
    );

    const releasedRider = await DeliveryBoy.findById(world.quickRider.document._id).lean();
    check(
        releasedRider?.activeOrderId === null,
        'the rider is released back to the pool after delivery',
        String(releasedRider?.activeOrderId)
    );
    check(
        releasedRider?.status === 'available',
        'the released rider is available again',
        releasedRider?.status
    );
    check(
        Number(releasedRider?.totalDeliveries) === 1,
        'the rider delivery count was incremented',
        String(releasedRider?.totalDeliveries)
    );

    // ── 10. Rider enrolment — the gap that makes all of this unreachable ─────
    // Every step above depended on a Quick Commerce rider existing. In
    // production none can, because nothing can write DeliveryBoy.experiences.
    const stillMarketplaceOnly = await DeliveryBoy.findById(
        world.marketplaceRider.document._id
    ).lean();
    check(
        !(stillMarketplaceOnly?.experiences || []).includes(QC),
        'a rider not explicitly enrolled stays marketplace-only',
        JSON.stringify(stillMarketplaceOnly?.experiences)
    );

    const admin = asActor(tokens.admin.token);
    const enrolment = await admin.put(
        `/admin/delivery-boys/${world.marketplaceRider.document._id}/experiences`,
        { body: { experiences: ['marketplace', 'quick_commerce'] } }
    );
    checkStatus(
        enrolment,
        200,
        'an admin can enrol a delivery partner into Quick Commerce'
    );
};

export default run;
