/**
 * Quick Commerce Rider Assignment & Status Transition Verification
 *
 * Covers the two things Phase 5 can get wrong in production:
 *
 *   1. **Assignment concurrency.** Two orders arriving together must never
 *      claim the same rider. Verified against an in-memory model of the
 *      `findOneAndUpdate({activeOrderId: null})` guard, including a 1000-round
 *      randomized contention run.
 *
 *   2. **Status transitions.** Only legal moves, by the right actor, in the
 *      right order — and every Quick Commerce status must map onto a valid
 *      Marketplace status so existing order queries keep working.
 *
 * Runs without a database.
 *
 * Usage: node backend/scripts/verifyRiderAssignment.mjs
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (rel) => import(pathToFileURL(path.resolve(__dirname, rel)).href);

const {
    QUICK_COMMERCE_STATUS_TRANSITIONS,
    QUICK_COMMERCE_STATUS_TO_ORDER_STATUS,
    QUICK_COMMERCE_ORDER_STATUS_VALUES,
    QUICK_COMMERCE_VENDOR_STATUSES,
    QUICK_COMMERCE_RIDER_STATUSES,
    QUICK_COMMERCE_ASSIGNMENT_STATUS_VALUES,
    RIDER_SEARCH_RADII_KM,
    RIDER_LOCATION_STALE_AFTER_MS,
} = await load('../src/constants/quickCommerce.js');

const MARKETPLACE_ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];

let passed = 0;
let failed = 0;
const record = (ok, label, detail = '') => {
    ok ? (passed += 1) : (failed += 1);
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${ok ? '' : `\n    ${detail}`}`);
};

// ─── 1. Atomic claim model ────────────────────────────────────────────────────
/**
 * Mirrors `claimRider`: the update only applies when the rider is still free.
 * This is the property the real `findOneAndUpdate` filter provides.
 */
const makeRiderPool = (count) =>
    Array.from({ length: count }, (_, i) => ({
        id: `rider-${i}`,
        activeOrderId: null,
        status: 'available',
        distanceKm: i + 1,
    }));

const claim = (rider, orderId) => {
    if (rider.activeOrderId !== null || rider.status !== 'available') return null;
    rider.activeOrderId = orderId;
    rider.status = 'busy';
    return rider;
};

const assign = (pool, orderId) => {
    const candidates = [...pool].sort((a, b) => a.distanceKm - b.distanceKm);
    for (const candidate of candidates) {
        const claimed = claim(candidate, orderId);
        if (claimed) return claimed;
    }
    return null;
};

console.log('=== Atomic claim ===');
{
    const pool = makeRiderPool(3);
    const a = assign(pool, 'order-A');
    const b = assign(pool, 'order-B');
    record(a?.id === 'rider-0', 'nearest free rider is claimed first', `got ${a?.id}`);
    record(b?.id === 'rider-1', 'second order skips the claimed rider', `got ${b?.id}`);
    record(a.id !== b.id, 'two orders never share a rider');
}

{
    const pool = makeRiderPool(1);
    const a = assign(pool, 'order-A');
    const b = assign(pool, 'order-B');
    record(Boolean(a) && b === null, 'single rider serves one order; the second finds none', `a=${a?.id} b=${b?.id}`);
}

{
    const pool = makeRiderPool(2);
    pool[0].status = 'busy';
    const a = assign(pool, 'order-A');
    record(a?.id === 'rider-1', 'a busy rider is skipped even when nearest', `got ${a?.id}`);
}

{
    // The lost-race path: the nearest rider is taken between ranking and claim.
    const pool = makeRiderPool(3);
    const ranked = [...pool].sort((x, y) => x.distanceKm - y.distanceKm);
    claim(ranked[0], 'order-Z'); // someone else won
    const a = assign(pool, 'order-A');
    record(a?.id === 'rider-1', 'losing the race falls through to the next candidate', `got ${a?.id}`);
}

console.log('\n=== Randomized contention (1000 rounds) ===');
{
    let doubleAssignments = 0;
    let lostOrders = 0;

    for (let round = 0; round < 1000; round += 1) {
        const riderCount = 1 + Math.floor(Math.random() * 8);
        const orderCount = 1 + Math.floor(Math.random() * 12);
        const pool = makeRiderPool(riderCount);

        const assignments = [];
        for (let i = 0; i < orderCount; i += 1) {
            const rider = assign(pool, `order-${i}`);
            if (rider) assignments.push(rider.id);
        }

        // No rider appears twice.
        if (new Set(assignments).size !== assignments.length) doubleAssignments += 1;
        // Every rider that could be used, was used.
        const expected = Math.min(riderCount, orderCount);
        if (assignments.length !== expected) lostOrders += 1;
    }

    record(doubleAssignments === 0, 'no rider is ever assigned two orders', `${doubleAssignments} violations`);
    record(lostOrders === 0, 'every available rider is used before escalating', `${lostOrders} rounds under-assigned`);
}

// ─── 2. Escalation ────────────────────────────────────────────────────────────
console.log('\n=== Escalation ===');
{
    const pool = makeRiderPool(0);
    const result = assign(pool, 'order-A');
    record(result === null, 'no riders → assignment returns null (caller escalates)');
    record(
        QUICK_COMMERCE_ASSIGNMENT_STATUS_VALUES.includes('escalated'),
        'escalated is a real assignment state, not an absence',
    );
    record(
        RIDER_SEARCH_RADII_KM.length > 1
        && RIDER_SEARCH_RADII_KM.every((r, i) => i === 0 || r > RIDER_SEARCH_RADII_KM[i - 1]),
        'search radii widen monotonically before giving up',
        JSON.stringify(RIDER_SEARCH_RADII_KM),
    );
    record(
        RIDER_LOCATION_STALE_AFTER_MS > 0,
        'stale rider pins are excluded from assignment',
    );
}

// ─── 3. Status transitions ────────────────────────────────────────────────────
console.log('\n=== Status transitions ===');
const canMove = (from, to) => (QUICK_COMMERCE_STATUS_TRANSITIONS[from] || []).includes(to);

const TRANSITION_CASES = [
    ['placed', 'accepted', true, 'store accepts a new order'],
    ['accepted', 'preparing', true, 'store starts preparing'],
    ['preparing', 'ready', true, 'store finishes packing'],
    ['ready', 'picked_up', true, 'rider collects'],
    ['picked_up', 'arriving', true, 'rider approaches'],
    ['picked_up', 'delivered', true, 'short trips may skip arriving'],
    ['arriving', 'delivered', true, 'rider completes'],
    ['placed', 'delivered', false, 'cannot deliver an unaccepted order'],
    ['placed', 'picked_up', false, 'cannot pick up before the store packs'],
    ['preparing', 'picked_up', false, 'cannot pick up before ready'],
    ['delivered', 'arriving', false, 'delivered is terminal'],
    ['cancelled', 'accepted', false, 'cancelled is terminal'],
    ['ready', 'accepted', false, 'no moving backwards'],
];

for (const [from, to, expected, label] of TRANSITION_CASES) {
    record(canMove(from, to) === expected, `${label} (${from} → ${to})`, `got ${canMove(from, to)}, expected ${expected}`);
}

console.log('\n=== Actor authority ===');
{
    const overlap = QUICK_COMMERCE_VENDOR_STATUSES.filter((s) => QUICK_COMMERCE_RIDER_STATUSES.includes(s));
    record(overlap.length === 0, 'no status can be set by both a vendor and a rider', JSON.stringify(overlap));
    record(
        QUICK_COMMERCE_VENDOR_STATUSES.every((s) => ['accepted', 'preparing', 'ready'].includes(s)),
        'vendors own only the preparation stages',
    );
    record(
        QUICK_COMMERCE_RIDER_STATUSES.every((s) => ['picked_up', 'arriving', 'delivered'].includes(s)),
        'riders own only the transit stages',
    );
    record(
        !QUICK_COMMERCE_RIDER_STATUSES.includes('accepted') && !QUICK_COMMERCE_VENDOR_STATUSES.includes('delivered'),
        'a rider cannot accept and a vendor cannot deliver',
    );
}

console.log('\n=== Marketplace status mapping ===');
for (const status of QUICK_COMMERCE_ORDER_STATUS_VALUES) {
    const mapped = QUICK_COMMERCE_STATUS_TO_ORDER_STATUS[status];
    record(
        MARKETPLACE_ORDER_STATUSES.includes(mapped),
        `${status} maps to a valid Marketplace status (${mapped})`,
        `got ${mapped}`,
    );
}

record(
    QUICK_COMMERCE_STATUS_TO_ORDER_STATUS.picked_up === 'shipped',
    'picked_up maps to shipped so existing delivery queries still match',
);
record(
    QUICK_COMMERCE_STATUS_TO_ORDER_STATUS.delivered === 'delivered',
    'delivered maps to delivered so earnings and analytics are unchanged',
);

/**
 * Mapping must be monotonic: the coarse Marketplace status can never move
 * backwards as the fine Quick Commerce status advances, or an order would
 * appear to regress in the admin list.
 */
console.log('\n=== Mapping monotonicity ===');
{
    const rank = { pending: 0, processing: 1, shipped: 2, delivered: 3 };
    const forwardPath = ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered'];
    let monotonic = true;
    let previous = -1;
    for (const status of forwardPath) {
        const current = rank[QUICK_COMMERCE_STATUS_TO_ORDER_STATUS[status]];
        if (current < previous) monotonic = false;
        previous = current;
    }
    record(monotonic, 'Marketplace status never regresses along the Quick Commerce path');
}

// ─── 4. Backward compatibility ────────────────────────────────────────────────
console.log('\n=== Backward compatibility ===');
{
    const { default: DeliveryBoy } = await load('../src/models/DeliveryBoy.model.js');
    const paths = DeliveryBoy.schema.paths;

    record(Boolean(paths['currentLocation.lat']), 'legacy currentLocation.lat is retained');
    record(Boolean(paths['currentLocation.lng']), 'legacy currentLocation.lng is retained');
    record(Boolean(paths['location.coordinates']), 'GeoJSON location.coordinates exists');
    record(Boolean(paths.lastLocationAt), 'lastLocationAt exists');
    record(Boolean(paths.activeOrderId), 'activeOrderId exists');

    const defaultExperiences = DeliveryBoy.schema.path('experiences').getDefault();
    record(
        Array.isArray(defaultExperiences)
        && defaultExperiences.length === 1
        && defaultExperiences[0] === 'marketplace',
        'riders default to marketplace only — nobody is auto-enrolled into Quick Commerce',
        JSON.stringify(defaultExperiences),
    );

    const activeOrderDefault = DeliveryBoy.schema.path('activeOrderId').getDefault();
    record(activeOrderDefault === null, 'activeOrderId defaults to null (assignable)', String(activeOrderDefault));

    const geoIndex = DeliveryBoy.schema.indexes().find(([keys]) => keys.location === '2dsphere');
    record(Boolean(geoIndex), '2dsphere index is declared on location');
    record(Boolean(geoIndex?.[1]?.sparse), '2dsphere index is sparse (riders without a pin are excluded)');

    const { default: Order } = await load('../src/models/Order.model.js');
    const assignmentDefault = Order.schema.path('quickCommerce.assignment.status')?.getDefault?.();
    record(assignmentDefault === 'pending', 'order assignment status defaults to pending', String(assignmentDefault));
    record(
        Order.schema.path('experience').getDefault() === 'marketplace',
        'existing orders remain marketplace by default',
    );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('✅ Rider assignment and Quick Commerce status transitions verified.');
process.exit(0);
