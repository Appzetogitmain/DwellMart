import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyChannelTransition,
    assertChannelRevision,
    quickCommerceReadiness,
    assertQuickCommerceReady,
    canReopenChannel,
} from '../../src/services/vendorChannelTransition.service.js';
import {
    resolveOrderChannel,
    orderChannelFilter,
    orderBelongsToChannel,
} from '../../src/services/orderChannel.service.js';
import {
    channelPathForExperience,
    productFlagForChannelPath,
    andCondition,
} from '../../src/services/catalogEligibility.service.js';
import { reconcileOrderChannel } from '../../src/migrations/0009_order_channel_attribution.js';

const vendorWith = (statuses, revision = 1) => ({
    channels: {
        retail: { status: statuses.retail || 'disabled' },
        wholesale: { status: statuses.wholesale || 'disabled' },
        quickCommerce: { status: statuses.quickCommerce || 'disabled' },
    },
    channelsRevision: revision,
});

// ── F-11 / F-12: one authoritative state machine ────────────────────────────

test('F-12: admin cannot activate a channel from a terminal state', () => {
    for (const from of ['disabled', 'rejected']) {
        const vendor = vendorWith({ retail: from });
        assert.throws(
            () => applyChannelTransition(vendor, 'retail', 'active', { actor: 'admin', actorId: 'a1' }),
            /Invalid channel transition/
        );
    }
});

test('F-12: admin can activate only from requested or paused', () => {
    for (const from of ['requested', 'paused']) {
        const vendor = vendorWith({ retail: from });
        const result = applyChannelTransition(vendor, 'retail', 'active', { actor: 'admin', actorId: 'a1' });
        assert.equal(result.status, 'active');
        assert.equal(vendor.channels.retail.status, 'active');
        assert.equal(vendor.channelsRevision, 2);
    }
});

test('F-11: a vendor can never self-activate a channel', () => {
    const vendor = vendorWith({ retail: 'requested' });
    assert.throws(
        () => applyChannelTransition(vendor, 'retail', 'active', { actor: 'vendor' }),
        /VENDOR_CANNOT_SELF_ACTIVATE|may only request or withdraw/
    );
});

test('F-11: re-applying after a terminal decision is an explicit, validated reopen', () => {
    assert.equal(canReopenChannel('disabled', 'requested', 'vendor'), true);
    assert.equal(canReopenChannel('rejected', 'requested', 'vendor'), true);
    // never straight to active, and never by an admin through this door
    assert.equal(canReopenChannel('disabled', 'active', 'vendor'), false);
    assert.equal(canReopenChannel('disabled', 'requested', 'admin'), false);

    const vendor = vendorWith({ wholesale: 'rejected' });
    const result = applyChannelTransition(vendor, 'wholesale', 'requested', { actor: 'vendor' });
    assert.equal(result.status, 'requested');
    assert.equal(vendor.channels.wholesale.requestedBy, 'vendor');
    assert.equal(vendor.channels.wholesale.reviewedAt, null, 'a fresh application supersedes the old review');
});

test('transition records admin identity, timestamp and reason', () => {
    const vendor = vendorWith({ retail: 'active' });
    applyChannelTransition(vendor, 'retail', 'paused', { actor: 'admin', actorId: 'admin-1', reason: 'Quality review' });
    assert.equal(vendor.channels.retail.status, 'paused');
    assert.equal(vendor.channels.retail.reviewedBy, 'admin-1');
    assert.equal(vendor.channels.retail.reason, 'Quality review');
    assert.ok(vendor.channels.retail.pausedAt instanceof Date);
});

test('one channel change never alters another', () => {
    const vendor = vendorWith({ retail: 'active', wholesale: 'active', quickCommerce: 'active' });
    applyChannelTransition(vendor, 'wholesale', 'paused', { actor: 'admin', actorId: 'a1' });
    assert.equal(vendor.channels.retail.status, 'active');
    assert.equal(vendor.channels.quickCommerce.status, 'active');
});

test('revision increments exactly once per change', () => {
    const vendor = vendorWith({ retail: 'active' }, 7);
    applyChannelTransition(vendor, 'retail', 'paused', { actor: 'admin', actorId: 'a1' });
    assert.equal(vendor.channelsRevision, 8);
});

// ── F-14: mandatory optimistic concurrency ──────────────────────────────────

test('F-14: expectedRevision is mandatory and mismatches conflict', () => {
    const vendor = vendorWith({ retail: 'active' }, 3);
    assert.throws(() => assertChannelRevision(vendor, undefined), /required/i);
    assert.throws(() => assertChannelRevision(vendor, 2), /Refresh and try again/);
    assert.doesNotThrow(() => assertChannelRevision(vendor, 3));
});

// ── F-15: Quick Commerce readiness ──────────────────────────────────────────

test('F-15: an unconfigured Quick Commerce store is not activation-ready', () => {
    const { ready, missing } = quickCommerceReadiness({ quickCommerceProfile: {} });
    assert.equal(ready, false);
    assert.ok(missing.includes('storeType'));
    assert.ok(missing.some((m) => m.includes('location')));
});

test('F-15: a configured store passes, and pincodes substitute for a geo-point', () => {
    assert.doesNotThrow(() => assertQuickCommerceReady({
        quickCommerceProfile: {
            storeType: 'dark_store',
            location: { type: 'Point', coordinates: [77.2, 28.6] },
            serviceRadiusKm: 5,
            preparationTimeMins: 10,
        },
    }));
    assert.doesNotThrow(() => assertQuickCommerceReady({
        quickCommerceProfile: {
            storeType: 'retail_outlet',
            servicedPincodes: ['110001'],
            serviceRadiusKm: 3,
            preparationTimeMins: 15,
        },
    }));
});

// ── F-06: order channel attribution ─────────────────────────────────────────

test('F-06: fulfillmentType wins over a stale legacy orderType', () => {
    assert.equal(resolveOrderChannel({ orderType: 'retail', fulfillmentType: 'wholesale' }), 'wholesale');
    assert.equal(resolveOrderChannel({ orderType: 'retail', fulfillmentType: 'quick_commerce' }), 'quick_commerce');
});

test('F-06: legacy documents fall back correctly', () => {
    assert.equal(resolveOrderChannel({ orderType: 'wholesale' }), 'wholesale');
    assert.equal(resolveOrderChannel({ orderType: 'marketplace' }), 'retail');
    assert.equal(resolveOrderChannel({}), 'retail');
});

test('F-06: a vendor slice overrides the parent order channel', () => {
    const order = {
        orderType: 'retail',
        fulfillmentType: 'retail',
        vendorItems: [
            { vendorId: 'v1', orderType: 'wholesale' },
            { vendorId: 'v2', orderType: 'retail' },
        ],
    };
    assert.equal(resolveOrderChannel(order, 'v1'), 'wholesale');
    assert.equal(resolveOrderChannel(order, 'v2'), 'retail');
});

test('F-06: an order cannot belong to two workspaces at once', () => {
    const order = { orderType: 'retail', fulfillmentType: 'wholesale' };
    assert.equal(orderBelongsToChannel(order, 'wholesale'), true);
    assert.equal(orderBelongsToChannel(order, 'retail'), false);
});

test('F-06: the list filter mirrors the resolver — fulfillmentType is only overridden when absent', () => {
    const wholesale = orderChannelFilter('wholesale');
    const branches = JSON.stringify(wholesale.$or);
    assert.ok(branches.includes('"fulfillmentType":"wholesale"'));
    // legacy fallback branches must all require fulfillmentType to be absent
    assert.ok(branches.includes('"$exists":false') || branches.includes('"$in":[null,""]'));
    // retail additionally matches documents carrying neither field
    const retail = orderChannelFilter('retail');
    assert.ok(JSON.stringify(retail.$or).includes('marketplace'));
});

// ── migration 0009 reconciliation ───────────────────────────────────────────

test('migration 0009 aligns orderType to fulfillmentType', () => {
    assert.deepEqual(
        reconcileOrderChannel({ orderType: 'retail', fulfillmentType: 'wholesale' }),
        { orderType: 'wholesale', fulfillmentType: 'wholesale', source: 'fulfillmentType' }
    );
});

test('migration 0009 backfills fulfillmentType from orderType when absent', () => {
    assert.deepEqual(
        reconcileOrderChannel({ orderType: 'wholesale' }),
        { orderType: 'wholesale', fulfillmentType: 'wholesale', source: 'orderType' }
    );
});

test('migration 0009 leaves already-consistent and mixed orders alone', () => {
    assert.equal(reconcileOrderChannel({ orderType: 'retail', fulfillmentType: 'retail' }), null);
    assert.equal(reconcileOrderChannel({ orderType: 'mixed', fulfillmentType: 'retail' }), null);
});

test('migration 0009 defaults orders carrying neither field to retail', () => {
    assert.deepEqual(
        reconcileOrderChannel({}),
        { orderType: 'retail', fulfillmentType: 'retail', source: 'default' }
    );
});

// ── F-03 / F-04: catalog channel resolution and filter composition ──────────

test('F-03: channel comes from the requested experience, not product flag priority', () => {
    assert.equal(channelPathForExperience('quick_commerce'), 'quickCommerce');
    assert.equal(channelPathForExperience('marketplace'), 'retail');
    assert.equal(channelPathForExperience('marketplace', 'wholesale'), 'wholesale');
    assert.equal(productFlagForChannelPath('quickCommerce'), 'quickCommerceEnabled');
    assert.equal(productFlagForChannelPath('retail'), 'retailEnabled');
});

test('F-04: andCondition preserves an existing $or instead of clobbering it', () => {
    const filter = { $or: [{ categoryId: 'c1' }, { quickCommerceCategoryId: 'c1' }] };
    andCondition(filter, { $or: [{ name: /x/ }] });
    assert.equal(filter.$or.length, 2, 'original $or must survive');
    assert.equal(filter.$and.length, 1, 'search goes into $and');
});

test('F-04b: andCondition preserves an _id kill switch', () => {
    const filter = { _id: { $in: [] } };
    andCondition(filter, { _id: { $nin: ['a'] } });
    assert.deepEqual(filter._id, { $in: [] }, 'kill switch must not be overwritten');
    assert.equal(filter.$and.length, 1);
});
