import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SHARED_PRODUCT_FIELDS,
    CHANNEL_OWNED_PRODUCT_FIELDS,
    allowedProductFieldsForChannel,
    classifyProductFields,
} from '../../src/constants/productFieldOwnership.js';
import { productCapabilityGuard } from '../../src/modules/vendor/middleware/productCapabilityGuard.js';
import { getVendorCapabilities } from '../../src/constants/vendorCapabilities.js';

/**
 * The exact top-level key set emitted by
 * frontend/src/modules/Vendor/pages/products/ProductForm.jsx handleSubmit().
 * `formData` is a fixed superset spread on every submit regardless of
 * workspace, so this is what the guard actually receives from the real UI.
 */
const PRODUCT_FORM_PAYLOAD_KEYS = [
    'name', 'unit', 'price', 'originalPrice', 'image', 'images',
    'categoryId', 'subcategoryId', 'brandId',
    'stock', 'stockQuantity', 'totalAllowedQuantity', 'minimumOrderQuantity',
    'warrantyPeriod', 'guaranteePeriod', 'hsnCode',
    'flashSale', 'isNewArrival', 'isFeatured', 'isVisible',
    'codAllowed', 'returnable', 'cancelable',
    'taxRate', 'taxIncluded', 'description', 'tags', 'variants',
    'seoTitle', 'seoDescription', 'relatedProducts', 'faqs',
];

const payloadFrom = (keys) => Object.fromEntries(keys.map((k) => [k, null]));

const runGuard = (body, workspace) => {
    const req = { body, vendorWorkspace: workspace, vendor: { _id: 'v1' }, method: 'POST', originalUrl: '/api/vendor/products' };
    let statusCode = null;
    let payload = null;
    let nextCalled = false;
    const res = {
        status(code) { statusCode = code; return this; },
        json(body_) { payload = body_; return this; },
    };
    productCapabilityGuard(req, res, () => { nextCalled = true; });
    return { statusCode, payload, nextCalled };
};

test('shared core and channel-owned sets do not overlap', () => {
    const shared = new Set(SHARED_PRODUCT_FIELDS);
    for (const [channel, fields] of Object.entries(CHANNEL_OWNED_PRODUCT_FIELDS)) {
        for (const field of fields) {
            assert.equal(shared.has(field), false, `${field} is both shared and owned by ${channel}`);
        }
    }
});

test('every workspace accepts the real ProductForm payload', () => {
    for (const workspace of ['retail', 'wholesale', 'quick_commerce']) {
        const { crossChannel, unknown } = classifyProductFields(payloadFrom(PRODUCT_FORM_PAYLOAD_KEYS), workspace);
        assert.deepEqual(crossChannel, [], `${workspace} reported cross-channel fields`);
        assert.deepEqual(unknown, [], `${workspace} reported unknown fields`);
    }
});

test('guard passes the real ProductForm payload on all three workspaces', () => {
    for (const workspace of ['retail', 'wholesale', 'quick_commerce']) {
        const result = runGuard(payloadFrom(PRODUCT_FORM_PAYLOAD_KEYS), workspace);
        assert.equal(result.nextCalled, true, `${workspace} was rejected`);
        assert.equal(result.statusCode, null);
    }
});

test('guard passes each channel its own owned fields', () => {
    const cases = {
        retail: { retailEnabled: true },
        wholesale: { wholesaleEnabled: true, wholesale: { moqEnabled: true, moq: 10, priceTiers: [] } },
        quick_commerce: { quickCommerceEnabled: true, quickCommerce: { packSize: '1kg' }, quickCommerceCategoryId: 'abc' },
    };
    for (const [workspace, body] of Object.entries(cases)) {
        const result = runGuard({ ...payloadFrom(PRODUCT_FORM_PAYLOAD_KEYS), ...body }, workspace);
        assert.equal(result.nextCalled, true, `${workspace} rejected its own owned fields`);
    }
});

test('retail workspace cannot write wholesale or quick commerce owned fields', () => {
    for (const body of [{ wholesale: { moq: 5 } }, { wholesaleEnabled: true }, { quickCommerce: { packSize: 'x' } }, { quickCommerceCategoryId: 'abc' }]) {
        const result = runGuard(body, 'retail');
        assert.equal(result.statusCode, 403, `retail was allowed to write ${Object.keys(body)[0]}`);
        assert.equal(result.payload.errorCode, 'CROSS_CHANNEL_FIELD_DENIED');
        assert.equal(result.nextCalled, false);
    }
});

test('wholesale workspace cannot write quick commerce or retail owned fields', () => {
    for (const body of [{ quickCommerceEnabled: true }, { quickCommerce: { packSize: 'x' } }, { retailEnabled: false }]) {
        const result = runGuard(body, 'wholesale');
        assert.equal(result.statusCode, 403, `wholesale was allowed to write ${Object.keys(body)[0]}`);
        assert.equal(result.payload.errorCode, 'CROSS_CHANNEL_FIELD_DENIED');
    }
});

test('quick commerce workspace cannot write retail or wholesale owned fields', () => {
    for (const body of [{ retailEnabled: true }, { wholesaleEnabled: true }, { wholesale: { moq: 2 } }]) {
        const result = runGuard(body, 'quick_commerce');
        assert.equal(result.statusCode, 403, `quick_commerce was allowed to write ${Object.keys(body)[0]}`);
        assert.equal(result.payload.errorCode, 'CROSS_CHANNEL_FIELD_DENIED');
    }
});

test('cross-channel writes are rejected even in observe-only mode', () => {
    const previous = process.env.PRODUCT_FIELD_STRICT;
    process.env.PRODUCT_FIELD_STRICT = 'false';
    try {
        const result = runGuard({ wholesale: { moq: 5 } }, 'retail');
        assert.equal(result.statusCode, 403);
        assert.equal(result.payload.errorCode, 'CROSS_CHANNEL_FIELD_DENIED');
    } finally {
        if (previous === undefined) delete process.env.PRODUCT_FIELD_STRICT;
        else process.env.PRODUCT_FIELD_STRICT = previous;
    }
});

test('unknown fields are rejected in strict mode and tolerated in observe-only mode', () => {
    const previous = process.env.PRODUCT_FIELD_STRICT;
    try {
        delete process.env.PRODUCT_FIELD_STRICT;
        const strict = runGuard({ commissionRate: 0 }, 'retail');
        assert.equal(strict.statusCode, 400);
        assert.equal(strict.payload.errorCode, 'UNKNOWN_PRODUCT_FIELD');

        process.env.PRODUCT_FIELD_STRICT = 'false';
        const observe = runGuard({ commissionRate: 0 }, 'retail');
        assert.equal(observe.nextCalled, true);
    } finally {
        if (previous === undefined) delete process.env.PRODUCT_FIELD_STRICT;
        else process.env.PRODUCT_FIELD_STRICT = previous;
    }
});

test('system fields never trip the guard', () => {
    const result = runGuard({ _id: 'x', __v: 2, expectedVersion: 2, vendorId: 'v', workspace: 'retail' }, 'retail');
    assert.equal(result.nextCalled, true);
});

test('guard defers when workspace or vendor is missing (authorization runs first)', () => {
    let called = false;
    productCapabilityGuard({ body: { wholesale: {} }, vendor: null }, {}, () => { called = true; });
    assert.equal(called, true);
    called = false;
    productCapabilityGuard({ body: { wholesale: {} }, vendor: { _id: 'v' } }, {}, () => { called = true; });
    assert.equal(called, true);
});

test('capability lists are derived from the ownership model', () => {
    for (const [type, channel] of [['retail', 'retail'], ['wholesale', 'wholesale'], ['quick_commerce', 'quick_commerce']]) {
        assert.deepEqual(
            getVendorCapabilities(type).allowedProductFields,
            allowedProductFieldsForChannel(channel)
        );
    }
});
