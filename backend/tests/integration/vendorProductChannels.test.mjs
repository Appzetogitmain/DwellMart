/**
 * F-01 / F-09 — vendor product operations across all three workspaces,
 * exercised over real HTTP against an isolated in-memory replica set.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    startHarness, stopHarness, resetDatabase, getMongoose,
    get, post, put, patch,
    vendorToken, seedVendor, seedActiveSubscription, seedCategory, seedProduct,
    COMPLETE_WHOLESALE_PROFILE, COMPLETE_QC_PROFILE, setFeatureFlags,
} from './helpers/harness.mjs';

let ctx = {};

before(async () => {
    await startHarness();
    await resetDatabase();
    await setFeatureFlags({ wholesaleMarketplaceEnabled: true, quickCommerceEnabled: true });

    const vendor = await seedVendor({
        storeName: 'Tri Channel Store',
        channels: { retail: 'active', wholesale: 'active', quickCommerce: 'active' },
        wholesaleProfile: COMPLETE_WHOLESALE_PROFILE,
        quickCommerceProfile: COMPLETE_QC_PROFILE,
    });
    await seedActiveSubscription(vendor._id);
    const marketplaceCategory = await seedCategory({ name: 'Marketplace Cat', experience: 'marketplace' });
    const qcCategory = await seedCategory({ name: 'QC Cat', experience: 'quick_commerce', supportedExperiences: ['quick_commerce'] });

    ctx = {
        vendor,
        token: await vendorToken(vendor._id),
        marketplaceCategory,
        qcCategory,
    };
});

after(async () => { await stopHarness(); });

/** The exact top-level payload the vendor ProductForm submits. */
const productFormPayload = (overrides = {}) => ({
    name: 'Integration Product',
    unit: 'Piece',
    price: 250,
    originalPrice: 300,
    image: '',
    images: [],
    categoryId: String(ctx.marketplaceCategory._id),
    subcategoryId: null,
    brandId: null,
    stock: 'in_stock',
    stockQuantity: 40,
    totalAllowedQuantity: null,
    minimumOrderQuantity: 1,
    warrantyPeriod: '',
    guaranteePeriod: '',
    hsnCode: '',
    flashSale: false,
    isNewArrival: false,
    isFeatured: false,
    isVisible: true,
    codAllowed: true,
    returnable: true,
    cancelable: true,
    taxRate: 18,
    taxIncluded: false,
    description: 'Created by integration test',
    tags: [],
    variants: { sizes: [], colors: [], materials: [], attributes: [], prices: {}, stockMap: {}, imageMap: {}, defaultVariant: {}, defaultSelection: {} },
    seoTitle: '',
    seoDescription: '',
    relatedProducts: [],
    faqs: [],
    ...overrides,
});

test('F-01: retail workspace can create a product with the real form payload', async () => {
    const res = await post('/api/vendor/products', productFormPayload({ name: 'Retail Item' }), { token: ctx.token, workspace: 'retail' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.retailEnabled, true);
    assert.equal(res.body.data.wholesaleEnabled, false);
    assert.equal(res.body.data.quickCommerceEnabled, false);
});

test('F-01: wholesale workspace can create a product with the real form payload', async () => {
    // The Wholesale workspace renders the bulk-pricing section, so a real
    // submission carries tiers. `resolveWholesalePayload` requires at least one
    // — that is a business rule, not a field-permission problem.
    const res = await post('/api/vendor/products', productFormPayload({
        name: 'Wholesale Item',
        wholesale: { moqEnabled: true, moq: 5, priceTiers: [{ minQty: 5, price: 220 }] },
    }), { token: ctx.token, workspace: 'wholesale' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.wholesaleEnabled, true);
    assert.equal(res.body.data.retailEnabled, false);
});

test('F-01: quick commerce workspace can create a product with the real form payload', async () => {
    // Quick Commerce has its own category tree, so the QC workspace form
    // supplies quickCommerceCategoryId. Required by business rule.
    const res = await post('/api/vendor/products', productFormPayload({
        name: 'QC Item',
        categoryId: String(ctx.qcCategory._id),
        quickCommerceCategoryId: String(ctx.qcCategory._id),
    }), { token: ctx.token, workspace: 'quick_commerce' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.quickCommerceEnabled, true);
    assert.equal(res.body.data.retailEnabled, false);
});

test('F-01: wholesale workspace can create a product carrying MOQ and price tiers', async () => {
    const res = await post('/api/vendor/products', productFormPayload({
        name: 'Wholesale Tiered Item',
        wholesaleEnabled: true,
        wholesale: { moqEnabled: true, moq: 10, priceTiers: [{ minQty: 10, price: 200 }, { minQty: 50, price: 180 }] },
    }), { token: ctx.token, workspace: 'wholesale' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.wholesale.moq, 10);
    assert.equal(res.body.data.wholesale.priceTiers.length, 2);
});

test('F-01: quick commerce workspace can create a product carrying QC-specific fields', async () => {
    const res = await post('/api/vendor/products', productFormPayload({
        name: 'QC Detailed Item',
        categoryId: String(ctx.qcCategory._id),
        quickCommerceEnabled: true,
        quickCommerceCategoryId: String(ctx.qcCategory._id),
        quickCommerce: { packSize: '500g', isPerishable: true, maxOrderQty: 4 },
    }), { token: ctx.token, workspace: 'quick_commerce' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.quickCommerce.packSize, '500g');
    assert.equal(res.body.data.quickCommerce.maxOrderQty, 4);
});

test('F-01: each workspace can update a product with the real form payload', async () => {
    for (const [workspace, flag] of [['retail', 'retailEnabled'], ['wholesale', 'wholesaleEnabled'], ['quick_commerce', 'quickCommerceEnabled']]) {
        const created = await seedProduct({
            vendorId: ctx.vendor._id,
            categoryId: ctx.marketplaceCategory._id,
            name: `Update Target ${workspace}`,
            retailEnabled: flag === 'retailEnabled',
            wholesaleEnabled: flag === 'wholesaleEnabled',
            quickCommerceEnabled: flag === 'quickCommerceEnabled',
        });
        const res = await put(`/api/vendor/products/${created._id}`, productFormPayload({ name: `Renamed ${workspace}` }), { token: ctx.token, workspace });
        assert.equal(res.status, 200, `${workspace}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.data.name, `Renamed ${workspace}`);
    }
});

test('F-01 security: retail workspace cannot write wholesale-owned fields', async () => {
    const res = await post('/api/vendor/products', productFormPayload({
        name: 'Escalation Attempt',
        wholesale: { moqEnabled: true, moq: 1, priceTiers: [{ minQty: 1, price: 1 }] },
    }), { token: ctx.token, workspace: 'retail' });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.errorCode, 'CROSS_CHANNEL_FIELD_DENIED');
});

test('F-01 security: wholesale workspace cannot write quick commerce-owned fields', async () => {
    const res = await post('/api/vendor/products', productFormPayload({
        name: 'QC Escalation Attempt',
        quickCommerce: { packSize: '1kg' },
    }), { token: ctx.token, workspace: 'wholesale' });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.errorCode, 'CROSS_CHANNEL_FIELD_DENIED');
});

test('F-01 security: quick commerce workspace cannot flip the retail publication flag', async () => {
    const res = await post('/api/vendor/products', productFormPayload({
        name: 'Retail Flag Attempt',
        categoryId: String(ctx.qcCategory._id),
        retailEnabled: true,
    }), { token: ctx.token, workspace: 'quick_commerce' });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.errorCode, 'CROSS_CHANNEL_FIELD_DENIED');
});

test('F-01: unknown fields are still rejected', async () => {
    const res = await post('/api/vendor/products', productFormPayload({ name: 'Unknown Field', commissionRate: 0 }), { token: ctx.token, workspace: 'retail' });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.errorCode, 'UNKNOWN_PRODUCT_FIELD');
});

test('legacy product without channel flags remains editable from retail', async () => {
    const Product = getMongoose().model('Product');
    const legacy = await Product.collection.insertOne({
        name: 'Legacy Product', slug: `legacy-${Date.now()}`,
        vendorId: ctx.vendor._id, categoryId: ctx.marketplaceCategory._id,
        price: 99, stockQuantity: 5, stock: 'in_stock', isActive: true,
        createdAt: new Date(), updatedAt: new Date(), __v: 0,
    });
    const res = await put(`/api/vendor/products/${legacy.insertedId}`, productFormPayload({ name: 'Legacy Renamed' }), { token: ctx.token, workspace: 'retail' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.name, 'Legacy Renamed');
});

test('channel publishing endpoint works per workspace and preserves channel config', async () => {
    const product = await seedProduct({
        vendorId: ctx.vendor._id, categoryId: ctx.marketplaceCategory._id,
        name: 'Publishable', retailEnabled: true,
        wholesaleEnabled: true, wholesale: { moqEnabled: true, moq: 12, priceTiers: [{ minQty: 12, price: 90 }] },
    });

    const unpublish = await patch(`/api/vendor/products/${product._id}/channels/wholesale`, { enabled: false }, { token: ctx.token, workspace: 'wholesale' });
    assert.equal(unpublish.status, 200, JSON.stringify(unpublish.body));
    assert.equal(unpublish.body.data.wholesaleEnabled, false);
    assert.equal(unpublish.body.data.wholesale.moq, 12, 'wholesale config must survive unpublish');

    const republish = await patch(`/api/vendor/products/${product._id}/channels/wholesale`, { enabled: true }, { token: ctx.token, workspace: 'wholesale' });
    assert.equal(republish.status, 200, JSON.stringify(republish.body));
    assert.equal(republish.body.data.wholesaleEnabled, true);
    assert.equal(republish.body.data.wholesale.moq, 12, 'wholesale config must be restored on republish');
});

test('publishing another channel from the wrong workspace is refused', async () => {
    const product = await seedProduct({ vendorId: ctx.vendor._id, categoryId: ctx.marketplaceCategory._id, name: 'Wrong WS Publish' });
    const res = await patch(`/api/vendor/products/${product._id}/channels/wholesale`, { enabled: true }, { token: ctx.token, workspace: 'retail' });
    assert.equal(res.status, 403, JSON.stringify(res.body));
});

test('product list is scoped to the active workspace', async () => {
    await seedProduct({ vendorId: ctx.vendor._id, categoryId: ctx.marketplaceCategory._id, name: 'Only Retail', retailEnabled: true });
    await seedProduct({ vendorId: ctx.vendor._id, categoryId: ctx.marketplaceCategory._id, name: 'Only QC', retailEnabled: false, quickCommerceEnabled: true });

    const retail = await get('/api/vendor/products?limit=200', { token: ctx.token, workspace: 'retail' });
    const qc = await get('/api/vendor/products?limit=200', { token: ctx.token, workspace: 'quick_commerce' });
    assert.equal(retail.status, 200);
    assert.equal(qc.status, 200);
    const retailNames = retail.body.data.products.map((p) => p.name);
    const qcNames = qc.body.data.products.map((p) => p.name);
    assert.ok(retailNames.includes('Only Retail'));
    assert.ok(!retailNames.includes('Only QC'));
    assert.ok(qcNames.includes('Only QC'));
    assert.ok(!qcNames.includes('Only Retail'));
});
