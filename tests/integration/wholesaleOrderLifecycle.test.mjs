/**
 * B2B / Wholesale order lifecycle.
 *
 * The audit rated Wholesale materially healthier than Quick Commerce, so this
 * suite serves a different purpose from its QC counterpart: it is the
 * regression baseline that protects a working module while five phases of
 * repair work happen around it.
 *
 * It asserts the rules that actually make wholesale wholesale — MOQ enforced
 * server-side, tier pricing applied at the right quantity, and the ordinary
 * retail path left untouched — plus the feature-flag contract, which the audit
 * found is honoured for Quick Commerce and ignored for Wholesale.
 */

import Order from '../../src/models/Order.model.js';
import { asActor } from './support/client.mjs';
import { beginSuite, check, checkStatus, checkKnownGap, blocked } from './support/gate.mjs';
import {
    seedStandardWorld,
    seedProduct,
    seedPlatformSettings,
    shippingAddress,
} from './support/seed.mjs';
import { authenticateWorld } from './support/auth.mjs';
import { resetTestDatabase } from './support/database.mjs';
import { clearResponseCache } from '../../src/middlewares/responseCache.js';
import { EXPERIENCES } from '../../src/constants/experiences.js';

const MARKETPLACE = EXPERIENCES.MARKETPLACE;

export const run = async () => {
    beginSuite('Wholesale — order lifecycle & pricing rules');

    await resetTestDatabase();
    clearResponseCache();

    const world = await seedStandardWorld();
    const tokens = await authenticateWorld(world);
    const customer = asActor(tokens.customer.token, MARKETPLACE);

    const wholesaleProductId = String(world.products.wholesale._id);
    const retailProductId = String(world.products.retail._id);

    // A wholesale-only SKU: no retail fallback below MOQ.
    const wholesaleOnly = await seedProduct({
        vendorId: world.vendor.document._id,
        categoryId: world.categories.marketplace._id,
        name: 'Harness Wholesale Only Product',
        price: 500,
        retailEnabled: false,
        wholesaleEnabled: true,
        wholesale: {
            moqEnabled: true,
            moq: 20,
            priceTiers: [{ minQty: 20, price: 400 }],
        },
    });

    // ── 1. MOQ is enforced by the server, not just the UI ────────────────────
    const belowMoq = await customer.post('/user/orders', {
        body: {
            items: [{ productId: String(wholesaleOnly._id), quantity: 1 }],
            shippingAddress: shippingAddress({ email: world.customer.email }),
            paymentMethod: 'cash',
        },
    });
    checkStatus(belowMoq, 422, 'a wholesale-only product below MOQ is rejected at checkout');
    check(
        belowMoq.body?.errors?.[0]?.code === 'BELOW_MINIMUM_ORDER_QUANTITY',
        'the MOQ rejection is machine-readable',
        JSON.stringify(belowMoq.body?.errors)
    );
    check(
        Number(belowMoq.body?.errors?.[0]?.minimumQuantity) === 20,
        'the rejection states the minimum quantity required',
        String(belowMoq.body?.errors?.[0]?.minimumQuantity)
    );

    // ── 2. Hybrid product falls back to retail below the floor ───────────────
    const hybridBelowFloor = await customer.post('/user/orders', {
        body: {
            items: [{ productId: wholesaleProductId, quantity: 1 }],
            shippingAddress: shippingAddress({ email: world.customer.email }),
            paymentMethod: 'cash',
        },
    });
    const hybridPlaced = checkStatus(
        hybridBelowFloor,
        201,
        'a hybrid product below MOQ still sells at retail price'
    );

    if (hybridPlaced) {
        const retailOrder = await Order.findOne({
            orderId: hybridBelowFloor.data?.orderId,
        }).lean();
        check(
            retailOrder?.items?.[0]?.pricingType === 'retail',
            'the hybrid line is priced as retail below the floor',
            retailOrder?.items?.[0]?.pricingType
        );
        check(
            Number(retailOrder?.items?.[0]?.price) === 1000,
            'the retail unit price is the base price',
            String(retailOrder?.items?.[0]?.price)
        );
        check(
            retailOrder?.orderType === 'retail',
            'an order with no wholesale lines is typed retail',
            retailOrder?.orderType
        );
    }

    // ── 3. Tier pricing applies at quantity ──────────────────────────────────
    const atTier = await customer.post('/user/orders', {
        body: {
            items: [{ productId: wholesaleProductId, quantity: 50 }],
            shippingAddress: shippingAddress({ email: world.customer.email }),
            paymentMethod: 'cash',
        },
    });
    const tierPlaced = checkStatus(atTier, 201, 'a wholesale order at tier quantity is accepted');

    if (!tierPlaced) {
        blocked('tier pricing assertions', 'the wholesale order could not be placed');
    } else {
        const bulkOrder = await Order.findOne({ orderId: atTier.data?.orderId }).lean();
        const line = bulkOrder?.items?.[0];

        check(line?.pricingType === 'wholesale', 'the line is priced as wholesale', line?.pricingType);
        check(
            Number(line?.price) === 800,
            'the highest applicable tier wins at quantity 50',
            String(line?.price)
        );
        check(
            Number(line?.unitRetailPrice) === 1000,
            'the retail reference price is retained for savings reporting',
            String(line?.unitRetailPrice)
        );
        check(
            Number(line?.savings) === 200 * 50,
            'per-line savings are recorded against the retail price',
            String(line?.savings)
        );
        check(
            Number(bulkOrder?.subtotal) === 800 * 50,
            'the subtotal uses the tier price, not the base price',
            String(bulkOrder?.subtotal)
        );
        check(
            bulkOrder?.orderType === 'wholesale',
            'the order is typed wholesale',
            bulkOrder?.orderType
        );
        check(
            bulkOrder?.experience === MARKETPLACE,
            'a wholesale order belongs to the marketplace experience',
            bulkOrder?.experience
        );
    }

    // ── 4. Retail is untouched by the wholesale machinery ────────────────────
    const retailOrder = await customer.post('/user/orders', {
        body: {
            items: [{ productId: retailProductId, quantity: 3 }],
            shippingAddress: shippingAddress({ email: world.customer.email }),
            paymentMethod: 'cash',
        },
    });
    const retailPlaced = checkStatus(retailOrder, 201, 'an ordinary retail order still completes');

    if (retailPlaced) {
        const doc = await Order.findOne({ orderId: retailOrder.data?.orderId }).lean();
        check(
            Number(doc?.subtotal) === 600,
            'retail pricing is unaffected by wholesale logic',
            String(doc?.subtotal)
        );
        check(Number(doc?.totalSavings) === 0, 'a retail order records no savings');
    }

    // ── 5. Stock is decremented atomically ───────────────────────────────────
    const { default: Product } = await import('../../src/models/Product.model.js');
    const afterOrders = await Product.findById(retailProductId).lean();
    check(
        Number(afterOrders?.stockQuantity) === 500 - 3,
        'stock is decremented by the ordered quantity',
        String(afterOrders?.stockQuantity)
    );

    const oversell = await customer.post('/user/orders', {
        body: {
            items: [{ productId: retailProductId, quantity: 100000 }],
            shippingAddress: shippingAddress({ email: world.customer.email }),
            paymentMethod: 'cash',
        },
    });
    checkStatus(oversell, 400, 'ordering more than available stock is rejected');

    // ── 6. Wholesale feature flag contract ───────────────────────────────────
    // With the flag off, wholesale pricing must not apply. The audit found this
    // flag only gates vendor channel enablement.
    await seedPlatformSettings({ quickCommerceEnabled: true, wholesaleEnabled: false });
    clearResponseCache();

    const flagOffOrder = await customer.post('/user/orders', {
        body: {
            items: [{ productId: wholesaleProductId, quantity: 50 }],
            shippingAddress: shippingAddress({ email: world.customer.email }),
            paymentMethod: 'cash',
        },
    });

    if (flagOffOrder.ok) {
        const doc = await Order.findOne({ orderId: flagOffOrder.data?.orderId }).lean();
        check(
            doc?.items?.[0]?.pricingType === 'retail',
            'with the wholesale flag off, tier pricing no longer applies',
            `line priced as "${doc?.items?.[0]?.pricingType}" at ${doc?.items?.[0]?.price}`
        );
    } else {
        check(
            true,
            'with the wholesale flag off, tier pricing no longer applies',
            `order rejected with HTTP ${flagOffOrder.status}`
        );
    }

    // Restore, so suite order never changes another suite's result.
    await seedPlatformSettings();
    clearResponseCache();
};

export default run;
