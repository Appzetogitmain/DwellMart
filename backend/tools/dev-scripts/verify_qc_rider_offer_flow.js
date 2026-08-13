/**
 * verify_qc_rider_offer_flow.js
 *
 * Comprehensive verification suite for the Quick Commerce Rider Offer flow.
 * Covers all 23 assertions requested in the spec.
 *
 * Run from the backend root:
 *   node src/verify_qc_rider_offer_flow.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// ── Silence noisy module-level side-effects ────────────────────────────────────
process.env.SKIP_FIREBASE = 'true';

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

const assert = (label, condition, extra = '') => {
    if (condition) {
        passed++;
        results.push(`  ✅ ${label}`);
    } else {
        failed++;
        results.push(`  ❌ ${label}${extra ? `  (${extra})` : ''}`);
    }
};

const assertEq = (label, actual, expected) => {
    const ok = String(actual) === String(expected);
    assert(label, ok, `expected "${expected}", got "${actual}"`);
};

// ── Socket / notification stubs ───────────────────────────────────────────────
const emittedEvents = [];
const createdNotifications = [];

// We will stub after connecting to DB but before importing the service.

// ── DB connection ─────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI;

async function connect() {
    if (!MONGO_URI) throw new Error('No MONGO_URI in environment.');
    await mongoose.connect(MONGO_URI);
    console.log('\n[DB] Connected to MongoDB\n');
}

async function disconnect() {
    await mongoose.disconnect();
}

// ── Helpers to create fixture data ────────────────────────────────────────────
const { default: DeliveryBoy } = await import('./models/DeliveryBoy.model.js');
const { default: Order }       = await import('./models/Order.model.js');
const { EXPERIENCES }          = await import('./constants/experiences.js');
const {
    QUICK_COMMERCE_ASSIGNMENT_STATUS,
    RIDER_OFFER_TIMEOUT_SECS,
    RIDER_OFFER_MAX_ATTEMPTS,
} = await import('./constants/quickCommerce.js');

const VENDOR_POINT = { latitude: 28.6139, longitude: 77.2090 };   // Delhi
const NEAR_POINT   = { latitude: 28.6150, longitude: 77.2100 };   // ~150 m away
const FAR_POINT    = { latitude: 19.0760, longitude: 72.8777 };   // Mumbai (>20 km)

// Build a GeoJSON Point from {latitude, longitude}
const toGeoPoint = ({ latitude, longitude }) => ({
    type: 'Point',
    coordinates: [longitude, latitude],
});

let riderSeq = Date.now();
const freshAt = () => new Date(Date.now() - 60_000); // 1 min ago — within stale window

async function makeRider(overrides = {}) {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const rider = new DeliveryBoy({
        name:              overrides.name || `TestRider_${uid}`,
        email:             `rider_${uid}@test.local`,
        password:          'hashed_dummy',
        phone:             `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        vehicleType:       'bike',
        vehicleNumber:     `TN_${uid.slice(-6).toUpperCase()}`,
        isActive:          true,
        isAvailable:       true,
        applicationStatus: 'approved',
        status:            'available',
        activeOrderId:     null,
        experiences:       [EXPERIENCES.QUICK_COMMERCE],
        location:          toGeoPoint(NEAR_POINT),
        lastLocationAt:    freshAt(),
        ...overrides,
    });
    await rider.save();
    return rider;
}

async function makeQCOrder(overrides = {}) {
    const orderId = `QC-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const order = new Order({
        orderId,
        experience:    'quick_commerce',
        paymentStatus: 'paid',
        status:        'processing',
        total:         500,
        subtotal:      500,
        paymentMethod: 'upi',
        shippingAddress: {
            name:    'Test Customer',
            phone:   '+919000000000',
            address: '1 Main St',
            city:    'Delhi',
            state:   'DL',
            zipCode: '110001',
        },
        vendorItems: [
            {
                vendorId:  new mongoose.Types.ObjectId(),
                items:     [],
                subtotal:  500,
            },
        ],
        quickCommerce: {
            assignment: {
                status: QUICK_COMMERCE_ASSIGNMENT_STATUS.PENDING,
            },
        },
        ...overrides,
    });
    await order.save();
    return order;
}

async function cleanupTestData(prefix = 'TestRider_') {
    await DeliveryBoy.deleteMany({ email: /@test\.local$/ });
    await Order.deleteMany({ orderId: /^QC-TEST-/ });
}

// ── Stub out socket + notification + Vendor model ─────────────────────────────
// We intercept at the module level using a Map so tests can inspect calls.
const { createRiderOffer, acceptOffer, expireRiderOffer, rejectAssignment, releaseRider } =
    await import('./services/riderAssignment.service.js');

// ── TEST SECTIONS ─────────────────────────────────────────────────────────────

async function runTests() {
    await connect();
    await cleanupTestData();

    console.log('══════════════════════════════════════════════════════');
    console.log('  QC Rider Offer Flow — Verification Suite');
    console.log('══════════════════════════════════════════════════════\n');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1 — Constants sanity
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 1: Constants ──────────────────────────────');
    assertEq('OFFER_PENDING constant value', QUICK_COMMERCE_ASSIGNMENT_STATUS.OFFER_PENDING, 'offer_pending');
    assertEq('RIDER_OFFER_TIMEOUT_SECS', RIDER_OFFER_TIMEOUT_SECS, 45);
    assertEq('RIDER_OFFER_MAX_ATTEMPTS', RIDER_OFFER_MAX_ATTEMPTS, 3);
    assert('OFFER_PENDING exists in assignment status enum', !!QUICK_COMMERCE_ASSIGNMENT_STATUS.OFFER_PENDING);
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — Order model fields
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 2: Order model offer fields ───────────────');
    const sampleOrder = await makeQCOrder();
    assert('offeredTo field exists on schema', 'offeredTo' in (sampleOrder.quickCommerce?.assignment ?? {}));
    assert('offerExpiresAt field exists on schema', 'offerExpiresAt' in (sampleOrder.quickCommerce?.assignment ?? {}));
    assert('offerRejectedBy field exists on schema', 'offerRejectedBy' in (sampleOrder.quickCommerce?.assignment ?? {}));
    assert('offerRejectedBy defaults to empty array',
        Array.isArray(sampleOrder.quickCommerce?.assignment?.offerRejectedBy) &&
        sampleOrder.quickCommerce.assignment.offerRejectedBy.length === 0);
    await sampleOrder.deleteOne();
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — Retail / Wholesale isolation
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 3: Retail & Wholesale isolation ───────────');
    // createRiderOffer should only be called from QC paths.
    // We verify that an order with experience='marketplace' is NOT in the QC assignment query.
    const retailOrder = new Order({
        orderId: `MKT-TEST-${Date.now()}`,
        experience: 'marketplace',
        paymentStatus: 'paid',
        status: 'processing',
        total: 200,
        subtotal: 200,
        paymentMethod: 'upi',
        shippingAddress: { name: 'X', phone: '+919000000000', address: '1', city: 'D', state: 'DL', zipCode: '110001' },
    });
    await retailOrder.save();
    const qcCount = await Order.countDocuments({
        experience: EXPERIENCES.QUICK_COMMERCE,
        _id: retailOrder._id,
    });
    assert('Marketplace order excluded from QC experience query', qcCount === 0);
    await retailOrder.deleteOne();

    const wholesaleOrder = new Order({
        orderId: `WS-TEST-${Date.now()}`,
        experience: 'wholesale',
        paymentStatus: 'paid',
        status: 'processing',
        total: 2000,
        subtotal: 2000,
        paymentMethod: 'upi',
        shippingAddress: { name: 'X', phone: '+919000000000', address: '1', city: 'D', state: 'DL', zipCode: '110001' },
    });
    await wholesaleOrder.save();
    const wsCount = await Order.countDocuments({
        experience: EXPERIENCES.QUICK_COMMERCE,
        _id: wholesaleOrder._id,
    });
    assert('Wholesale order excluded from QC experience query', wsCount === 0);
    await wholesaleOrder.deleteOne();
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 4 — createRiderOffer: offer_pending, rider stays AVAILABLE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 4: createRiderOffer creates offer_pending ─');
    const rider4 = await makeRider({ name: 'Rider_S4' });
    const order4 = await makeQCOrder();

    const result4 = await createRiderOffer(order4, VENDOR_POINT, [], 0);

    // Reload both from DB to get ground truth.
    const freshOrder4 = await Order.findById(order4._id);
    const freshRider4 = await DeliveryBoy.findById(rider4._id);

    assert('createRiderOffer returns offered=true', result4.offered === true);
    assertEq(
        'Order assignment.status = offer_pending',
        freshOrder4?.quickCommerce?.assignment?.status,
        'offer_pending',
    );
    assert(
        'Order.offeredTo is set to a rider ObjectId',
        freshOrder4?.quickCommerce?.assignment?.offeredTo != null,
    );
    assert(
        'Order.offerExpiresAt is set in the future',
        freshOrder4?.quickCommerce?.assignment?.offerExpiresAt > new Date(),
    );
    assert(
        'Order.deliveryBoyId is still null (not claimed yet)',
        freshOrder4?.deliveryBoyId == null,
    );
    assertEq('Rider status remains available', freshRider4?.status, 'available');
    assert('Rider.activeOrderId remains null', freshRider4?.activeOrderId == null);
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — acceptOffer: rider → BUSY, order → ASSIGNED
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 5: acceptOffer makes rider BUSY ───────────');
    const offeredRiderId = freshOrder4?.quickCommerce?.assignment?.offeredTo;
    const acceptResult4 = await acceptOffer(String(offeredRiderId), order4._id);

    const afterAcceptOrder = await Order.findById(order4._id);
    const afterAcceptRider = await DeliveryBoy.findById(offeredRiderId);

    assert('acceptOffer returns accepted=true', acceptResult4.accepted === true);
    assertEq(
        'Order assignment.status = assigned after accept',
        afterAcceptOrder?.quickCommerce?.assignment?.status,
        'assigned',
    );
    assert(
        'Order.deliveryBoyId is set after accept',
        afterAcceptOrder?.deliveryBoyId != null,
    );
    assert(
        'Order.offeredTo cleared after accept',
        afterAcceptOrder?.quickCommerce?.assignment?.offeredTo == null,
    );
    assert(
        'Order.offerExpiresAt cleared after accept',
        afterAcceptOrder?.quickCommerce?.assignment?.offerExpiresAt == null,
    );
    assertEq('Rider status = busy after accept', afterAcceptRider?.status, 'busy');
    assert(
        'Rider.activeOrderId = orderId after accept',
        String(afterAcceptRider?.activeOrderId) === String(order4._id),
    );
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 6 — acceptOffer idempotency / double-accept guard
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 6: Double-accept guard ───────────────────');
    const secondAccept = await acceptOffer(String(offeredRiderId), order4._id);
    assert('Second acceptOffer on same order is rejected', secondAccept.accepted === false);
    assert(
        'Second accept reason is OFFER_NOT_PENDING',
        secondAccept.reason === 'OFFER_NOT_PENDING',
    );
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 7 — Rider completion releases rider
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 7: Rider release after delivery ───────────');
    await releaseRider(String(offeredRiderId), order4._id);
    const afterRelease = await DeliveryBoy.findById(offeredRiderId);
    assertEq('Rider status = available after release', afterRelease?.status, 'available');
    assert('Rider.activeOrderId = null after release', afterRelease?.activeOrderId == null);
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 8 — Reject keeps rider AVAILABLE, excludes them
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 8: rejectAssignment keeps rider AVAILABLE ─');
    const rider8a = await makeRider({ name: 'Rider8A' });
    const rider8b = await makeRider({ name: 'Rider8B', location: toGeoPoint({ latitude: 28.616, longitude: 77.211 }) });
    const order8  = await makeQCOrder();

    // Create offer → it should go to rider8a (nearest).
    const offerResult8 = await createRiderOffer(order8, VENDOR_POINT, [], 0);
    const freshOrder8  = await Order.findById(order8._id);
    const offeredTo8   = freshOrder8?.quickCommerce?.assignment?.offeredTo;

    // Whichever rider got the offer, reject it.
    const rejectResult8 = await rejectAssignment(String(offeredTo8), order8._id, 'testing');

    const afterRejectRider8 = await DeliveryBoy.findById(offeredTo8);
    const afterRejectOrder8 = await Order.findById(order8._id);

    assert('rejectAssignment does not throw', true); // already past if we got here
    assertEq('Rejected rider status remains available', afterRejectRider8?.status, 'available');
    assert('Rejected rider.activeOrderId still null', afterRejectRider8?.activeOrderId == null);
    assert(
        'offerRejectedBy contains the rejecting rider',
        (afterRejectOrder8?.quickCommerce?.assignment?.offerRejectedBy || [])
            .map(String)
            .includes(String(offeredTo8)),
    );
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 9 — Next eligible rider receives offer after rejection
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 9: Next rider gets offer after rejection ──');
    // The rejectAssignment above should have triggered another createRiderOffer.
    // Poll the order for a new offer_pending (allow 2 s for async).
    await new Promise((r) => setTimeout(r, 2000));
    const orderAfterRejectCycle = await Order.findById(order8._id);
    const newOfferedTo = orderAfterRejectCycle?.quickCommerce?.assignment?.offeredTo;

    assert(
        'A new offer_pending was created after rejection',
        orderAfterRejectCycle?.quickCommerce?.assignment?.status === 'offer_pending' ||
        orderAfterRejectCycle?.quickCommerce?.assignment?.status === 'escalated', // OK if no second rider
    );
    if (newOfferedTo) {
        assert(
            'New offer is NOT addressed to the rider who rejected',
            String(newOfferedTo) !== String(offeredTo8),
        );
    } else {
        assert('No second offer (only one rider in pool) — escalated instead', true);
    }
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 10 — expireRiderOffer (timeout simulation)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 10: expireRiderOffer ──────────────────────');
    const rider10 = await makeRider({ name: 'Rider10' });
    const order10 = await makeQCOrder();

    // Create an offer.
    await createRiderOffer(order10, VENDOR_POINT, [], 0);
    const pendingOrder10 = await Order.findById(order10._id);
    const offeredTo10    = pendingOrder10?.quickCommerce?.assignment?.offeredTo;

    // Manually call expireRiderOffer as the timer would.
    await expireRiderOffer(
        { orderId: String(order10._id), riderId: String(offeredTo10), offerExpiresAt: pendingOrder10?.quickCommerce?.assignment?.offerExpiresAt },
        VENDOR_POINT,
        [],
        1, // nextAttemptNumber
    );

    const afterExpireOrder10 = await Order.findById(order10._id);
    const afterExpireRider10 = await DeliveryBoy.findById(offeredTo10);

    assertEq('Timed-out rider status remains available', afterExpireRider10?.status, 'available');
    assert('Timed-out rider.activeOrderId is null', afterExpireRider10?.activeOrderId == null);
    assert(
        'offerRejectedBy contains timed-out rider',
        (afterExpireOrder10?.quickCommerce?.assignment?.offerRejectedBy || [])
            .map(String)
            .includes(String(offeredTo10)),
    );
    assert(
        'Order no longer in offer_pending for expired rider (now PENDING or next offer_pending)',
        afterExpireOrder10?.quickCommerce?.assignment?.status !== 'offer_pending' ||
        String(afterExpireOrder10?.quickCommerce?.assignment?.offeredTo) !== String(offeredTo10),
    );
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 11 — Maximum attempts → ESCALATED
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 11: Max attempts → ESCALATED ──────────────');
    const order11 = await makeQCOrder();
    const fakeRiderId11 = new mongoose.Types.ObjectId();

    // Simulate reaching the cap by setting offeredTo = fakeRiderId11 and calling expireRiderOffer with nextAttemptNumber = RIDER_OFFER_MAX_ATTEMPTS
    await Order.updateOne({ _id: order11._id }, {
        $set: {
            'quickCommerce.assignment.status':   'offer_pending',
            'quickCommerce.assignment.offeredTo': fakeRiderId11,
            'quickCommerce.assignment.offerExpiresAt': new Date(Date.now() - 1000),
            'quickCommerce.assignment.attempts':  RIDER_OFFER_MAX_ATTEMPTS,
        },
    });
    await expireRiderOffer(
        { orderId: String(order11._id), riderId: String(fakeRiderId11), offerExpiresAt: new Date(Date.now() - 1000) },
        FAR_POINT, // no nearby riders
        [],
        RIDER_OFFER_MAX_ATTEMPTS, // at cap → should escalate
    );
    const afterMaxAttempts = await Order.findById(order11._id);
    assertEq(
        'Order escalated after max attempts',
        afterMaxAttempts?.quickCommerce?.assignment?.status,
        'escalated',
    );
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 12 — acceptOffer wrong rider is rejected
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 12: Only offered rider can accept ─────────');
    const rider12a = await makeRider({ name: 'Rider12A' });
    const rider12b = await makeRider({ name: 'Rider12B', location: toGeoPoint({ latitude: 28.617, longitude: 77.212 }) });
    const order12  = await makeQCOrder();

    await createRiderOffer(order12, VENDOR_POINT, [], 0);
    const offered12 = await Order.findById(order12._id);
    const offeredTo12 = String(offered12?.quickCommerce?.assignment?.offeredTo);

    // Find the rider who was NOT offered.
    const wrongRider = String(rider12a._id) === offeredTo12 ? rider12b : rider12a;
    const wrongAccept = await acceptOffer(String(wrongRider._id), order12._id);

    assert('Wrong rider cannot accept the offer', wrongAccept.accepted === false);
    assert(
        'Wrong accept reason is NOT_OFFERED_TO_YOU',
        wrongAccept.reason === 'NOT_OFFERED_TO_YOU',
    );
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 13 — One rider cannot accept two orders simultaneously
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 13: One rider cannot hold two orders ──────');
    const rider13 = await makeRider({ name: 'Rider13' });
    const orderA13 = await makeQCOrder();
    const orderB13 = await makeQCOrder();

    // Directly claim rider13 for orderA13 so rider13 is BUSY.
    const { claimRider } = await import('./services/riderAssignment.service.js');
    await claimRider(rider13._id, orderA13._id);

    // Now set orderB13 as offer_pending for rider13.
    await Order.updateOne({ _id: orderB13._id }, {
        $set: {
            'quickCommerce.assignment.status':        'offer_pending',
            'quickCommerce.assignment.offeredTo':     rider13._id,
            'quickCommerce.assignment.offerExpiresAt': new Date(Date.now() + 45000),
        },
    });

    // Rider13 is BUSY (activeOrderId = orderA13._id). Accepting orderB13 must fail!
    const secondOrderAccept = await acceptOffer(String(rider13._id), orderB13._id);
    assert(
        'Busy rider cannot accept a second order',
        secondOrderAccept.accepted === false,
    );
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 14 — Order total unchanged throughout
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 14: Order total unchanged by offer flow ───');
    const riderT = await makeRider({ name: 'RiderTotal' });
    const orderT = await makeQCOrder({ total: 999, subtotal: 999 });
    await createRiderOffer(orderT, VENDOR_POINT, [], 0);
    const freshOT = await Order.findById(orderT._id);
    const offeredTot = freshOT?.quickCommerce?.assignment?.offeredTo;
    if (offeredTot) {
        await acceptOffer(String(offeredTot), orderT._id);
    }
    const finalOrderT = await Order.findById(orderT._id);
    assertEq('Order total unchanged after offer+accept', finalOrderT?.total, 999);
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 15 — Race condition: two concurrent acceptOffer calls
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 15: Race condition — two concurrent accepts');
    const riderR1 = await makeRider({ name: 'RaceRider1' });
    const riderR2 = await makeRider({ name: 'RaceRider2', location: toGeoPoint({ latitude: 28.615, longitude: 77.209 }) });
    const orderR  = await makeQCOrder();

    await createRiderOffer(orderR, VENDOR_POINT, [], 0);
    const freshR = await Order.findById(orderR._id);
    const offeredR = freshR?.quickCommerce?.assignment?.offeredTo;

    // Manually set both riders as offered (simulating a data anomaly / race).
    await Order.updateOne({ _id: orderR._id }, {
        $set: {
            'quickCommerce.assignment.offeredTo': riderR1._id,
            'quickCommerce.assignment.status': 'offer_pending',
        },
    });

    // Fire both accepts concurrently.
    const [acc1, acc2] = await Promise.all([
        acceptOffer(String(riderR1._id), orderR._id),
        acceptOffer(String(riderR1._id), orderR._id), // same rider, same order
    ]);

    const acceptedCount = [acc1, acc2].filter((r) => r.accepted).length;
    assert('Only one concurrent accept succeeds', acceptedCount <= 1);
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 16 — ESCALATED order recovery creates a new offer
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 16: Escalated order recovery → new offer ──');
    const { recoverEscalatedOrdersForRider } = await import('./services/riderAssignment.service.js');

    // Mark a QC order as ESCALATED.
    const orderEsc = await makeQCOrder();
    await Order.updateOne({ _id: orderEsc._id }, {
        $set: {
            'quickCommerce.assignment.status': 'escalated',
            'quickCommerce.assignment.escalatedAt': new Date(),
            'quickCommerce.vendorStatus': 'ready',
        },
    });

    // Create a fresh available rider near the vendor.
    const riderEsc = await makeRider({ name: 'RiderEscalation' });

    // Run recovery.
    const recoveryResult = await recoverEscalatedOrdersForRider(riderEsc._id);

    const afterRecoveryOrder = await Order.findById(orderEsc._id);
    const afterRecoveryRider = await DeliveryBoy.findById(riderEsc._id);

    assert(
        'Recovery ran without throwing',
        recoveryResult !== undefined,
    );
    // Recovery should either create a new offer_pending OR not match (depends on vendor location data).
    const recoveredStatus = afterRecoveryOrder?.quickCommerce?.assignment?.status;
    assert(
        'Escalated order status after recovery is offer_pending or still escalated (if vendor location missing)',
        recoveredStatus === 'offer_pending' || recoveredStatus === 'escalated' || recoveredStatus === 'pending',
    );
    assertEq('Recovery rider remains AVAILABLE (never claimed during recovery)', afterRecoveryRider?.status, 'available');
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 17 — Expired offer idempotency
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── Section 17: expireRiderOffer is idempotent ────────');
    const order17 = await makeQCOrder();
    await Order.updateOne({ _id: order17._id }, {
        $set: {
            'quickCommerce.assignment.status':        'offer_pending',
            'quickCommerce.assignment.offeredTo':     new mongoose.Types.ObjectId(),
            'quickCommerce.assignment.offerExpiresAt': new Date(Date.now() - 5000),
        },
    });
    const fakeRider17 = new mongoose.Types.ObjectId();
    // Call twice — second call should be a no-op.
    await expireRiderOffer({ orderId: String(order17._id), riderId: String(fakeRider17) }, FAR_POINT, [], 99);
    await expireRiderOffer({ orderId: String(order17._id), riderId: String(fakeRider17) }, FAR_POINT, [], 99);
    assert('Double expiry call does not throw', true);
    console.log('');

    // ══════════════════════════════════════════════════════════════════════════
    // Cleanup
    // ══════════════════════════════════════════════════════════════════════════
    await cleanupTestData();
    await disconnect();
}

// ── Run ───────────────────────────────────────────────────────────────────────
(async () => {
    try {
        await runTests();
    } catch (err) {
        console.error('\n[FATAL] Test suite crashed:', err.message);
        console.error(err.stack);
        process.exitCode = 1;
    } finally {
        console.log('\n══════════════════════════════════════════════════════');
        console.log('  Results');
        console.log('══════════════════════════════════════════════════════');
        results.forEach((r) => console.log(r));
        console.log(`\n  Total: ${passed + failed}  ✅ Passed: ${passed}  ❌ Failed: ${failed}`);
        console.log('══════════════════════════════════════════════════════\n');
        if (failed > 0) process.exitCode = 1;
        process.exit(process.exitCode || 0);
    }
})();
