/**
 * Wholesale Analytics Aggregation Verification (Phase 4)
 *
 * Replicates the vendor analytics rollup from
 * `modules/vendor/controllers/analytics.controller.js` against hand-built order
 * fixtures, asserting correct per-vendor isolation, tier attribution, and
 * legacy-order handling.
 *
 * Usage: node backend/scripts/verifyWholesaleAnalytics.mjs
 */

let pass = 0;
let fail = 0;
const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${ok ? '' : ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`}`);
};

/** Mirrors the vendor analytics loop exactly. */
const rollup = (orders, vendorId) => {
    let retailOrders = 0;
    let wholesaleOrders = 0;
    let bulkRevenue = 0;
    let customerSavings = 0;
    const tierUsage = {};
    const bulkProductMap = {};

    for (const order of orders) {
        const vendorItem = order.vendorItems.find((vi) => String(vi.vendorId) === String(vendorId));
        if (!vendorItem) continue;
        if (String(vendorItem.status || '').toLowerCase() === 'cancelled') continue;

        const vendorOrderType = String(vendorItem.orderType || 'retail');
        if (vendorOrderType === 'retail') retailOrders += 1;
        else wholesaleOrders += 1;

        for (const line of vendorItem.items || []) {
            if (String(line.pricingType) !== 'wholesale') continue;
            const lineRevenue = Number(line.price || 0) * Number(line.quantity || 0);
            bulkRevenue += lineRevenue;
            customerSavings += Number(line.savings || 0);

            const tierMinQty = line.appliedTier?.minQty;
            if (Number.isFinite(Number(tierMinQty))) {
                const key = String(tierMinQty);
                if (!tierUsage[key]) tierUsage[key] = { minQty: Number(tierMinQty), timesUsed: 0, unitsSold: 0, revenue: 0 };
                tierUsage[key].timesUsed += 1;
                tierUsage[key].unitsSold += Number(line.quantity || 0);
                tierUsage[key].revenue += lineRevenue;
            }

            const pid = String(line.productId || '');
            if (!pid) continue;
            if (!bulkProductMap[pid]) bulkProductMap[pid] = { productId: pid, name: line.name, unitsSold: 0, revenue: 0, orders: 0 };
            bulkProductMap[pid].unitsSold += Number(line.quantity || 0);
            bulkProductMap[pid].revenue += lineRevenue;
            bulkProductMap[pid].orders += 1;
        }
    }

    const pricingTiers = Object.values(tierUsage).sort((a, b) => b.timesUsed - a.timesUsed);
    return {
        retailOrders,
        wholesaleOrders,
        bulkRevenue: parseFloat(bulkRevenue.toFixed(2)),
        customerSavings: parseFloat(customerSavings.toFixed(2)),
        mostUsedTier: pricingTiers[0] || null,
        topBulkProducts: Object.values(bulkProductMap).sort((a, b) => b.revenue - a.revenue),
    };
};

const V1 = 'vendor-1';
const V2 = 'vendor-2';

const wholesaleLine = (productId, name, price, qty, tierMinQty, savings) => ({
    productId, name, price, quantity: qty, pricingType: 'wholesale',
    appliedTier: { minQty: tierMinQty, price }, savings,
});
const retailLine = (productId, name, price, qty) => ({
    productId, name, price, quantity: qty, pricingType: 'retail', savings: 0,
});

console.log('=== A. Legacy orders (pre-wholesale) ===');
{
    const orders = [
        { vendorItems: [{ vendorId: V1, status: 'delivered', items: [{ productId: 'p1', name: 'A', price: 100, quantity: 2 }] }] },
    ];
    const r = rollup(orders, V1);
    check('legacy order counts as retail', r.retailOrders, 1);
    check('no wholesale orders', r.wholesaleOrders, 0);
    check('no bulk revenue', r.bulkRevenue, 0);
    check('no tier attributed', r.mostUsedTier, null);
}

console.log('\n=== B. Per-vendor isolation in a multi-vendor order ===');
{
    const orders = [{
        vendorItems: [
            { vendorId: V1, status: 'pending', orderType: 'retail', items: [retailLine('p1', 'A', 500, 2)] },
            { vendorId: V2, status: 'pending', orderType: 'wholesale', items: [wholesaleLine('p2', 'B', 900, 10, 10, 1000)] },
        ],
    }];
    const r1 = rollup(orders, V1);
    const r2 = rollup(orders, V2);
    check('V1 sees only its retail slice', [r1.retailOrders, r1.wholesaleOrders], [1, 0]);
    check('V1 has no bulk revenue from V2', r1.bulkRevenue, 0);
    check('V2 sees only its wholesale slice', [r2.retailOrders, r2.wholesaleOrders], [0, 1]);
    check('V2 bulk revenue = 900 x 10', r2.bulkRevenue, 9000);
    check('V2 savings recorded', r2.customerSavings, 1000);
}

console.log('\n=== C. Mixed order counts as wholesale for the vendor ===');
{
    const orders = [{
        vendorItems: [{
            vendorId: V1, status: 'pending', orderType: 'mixed',
            items: [retailLine('p1', 'A', 500, 1), wholesaleLine('p2', 'B', 900, 10, 10, 1000)],
        }],
    }];
    const r = rollup(orders, V1);
    check('mixed counts in wholesale bucket', [r.retailOrders, r.wholesaleOrders], [0, 1]);
    check('bulk revenue excludes the retail line', r.bulkRevenue, 9000);
    check('savings only from wholesale line', r.customerSavings, 1000);
}

console.log('\n=== D. Most-used tier ranking ===');
{
    const orders = [
        { vendorItems: [{ vendorId: V1, orderType: 'wholesale', items: [wholesaleLine('p1', 'A', 950, 10, 10, 500)] }] },
        { vendorItems: [{ vendorId: V1, orderType: 'wholesale', items: [wholesaleLine('p1', 'A', 950, 12, 10, 600)] }] },
        { vendorItems: [{ vendorId: V1, orderType: 'wholesale', items: [wholesaleLine('p1', 'A', 800, 100, 100, 20000)] }] },
    ];
    const r = rollup(orders, V1);
    check('tier 10 used most often', r.mostUsedTier.minQty, 10);
    check('tier 10 timesUsed', r.mostUsedTier.timesUsed, 2);
    check('tier 10 units aggregated', r.mostUsedTier.unitsSold, 22);
    check('total bulk revenue across tiers', r.bulkRevenue, 950 * 10 + 950 * 12 + 800 * 100);
}

console.log('\n=== E. Top bulk products ranked by revenue ===');
{
    const orders = [
        { vendorItems: [{ vendorId: V1, orderType: 'wholesale', items: [wholesaleLine('p1', 'Cheap', 100, 5, 5, 50)] }] },
        { vendorItems: [{ vendorId: V1, orderType: 'wholesale', items: [wholesaleLine('p2', 'Pricey', 900, 20, 20, 2000)] }] },
        { vendorItems: [{ vendorId: V1, orderType: 'wholesale', items: [wholesaleLine('p1', 'Cheap', 100, 5, 5, 50)] }] },
    ];
    const r = rollup(orders, V1);
    check('highest-revenue product first', r.topBulkProducts[0].productId, 'p2');
    check('repeat product aggregated', r.topBulkProducts[1].unitsSold, 10);
    check('repeat product order count', r.topBulkProducts[1].orders, 2);
}

console.log('\n=== F. Cancelled vendor slices excluded ===');
{
    const orders = [
        { vendorItems: [{ vendorId: V1, status: 'cancelled', orderType: 'wholesale', items: [wholesaleLine('p1', 'A', 900, 10, 10, 1000)] }] },
        { vendorItems: [{ vendorId: V1, status: 'delivered', orderType: 'wholesale', items: [wholesaleLine('p1', 'A', 900, 10, 10, 1000)] }] },
    ];
    const r = rollup(orders, V1);
    check('cancelled slice excluded from counts', r.wholesaleOrders, 1);
    check('cancelled slice excluded from revenue', r.bulkRevenue, 9000);
}

console.log('\n=== G. Vendor with no orders ===');
{
    const r = rollup([], V1);
    check('zeroed metrics', [r.retailOrders, r.wholesaleOrders, r.bulkRevenue], [0, 0, 0]);
    check('no tier', r.mostUsedTier, null);
    check('no products', r.topBulkProducts, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
