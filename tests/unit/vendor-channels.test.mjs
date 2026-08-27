import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    canTransitionVendorChannel,
    channelToProductFlag,
    listVendorChannels,
    normalizeVendorChannel,
} from '../../src/constants/vendorChannels.js';
import { requestedChannelsFromSellingChannels, channelSummary } from '../../src/services/vendorChannel.service.js';
import { resolveVendorWorkspace, requireChannel } from '../../src/middlewares/vendorChannel.js';
import { buildChannelsForLegacyVendor } from '../../src/migrations/0008_vendor_channels.js';

const vendor = {
    channels: {
        retail: { status: 'active' },
        wholesale: { status: 'paused' },
        quickCommerce: { status: 'disabled' },
    },
};

test('normalizes only supported workspace aliases', () => {
    assert.equal(normalizeVendorChannel('quickCommerce'), 'quick_commerce');
    assert.equal(normalizeVendorChannel('QC'), 'quick_commerce');
    assert.equal(normalizeVendorChannel('wholesale'), 'wholesale');
    assert.equal(normalizeVendorChannel('admin'), null);
});

test('active and readable workspace lists preserve paused read access', () => {
    assert.deepEqual(listVendorChannels(vendor), ['retail']);
    assert.deepEqual(listVendorChannels(vendor, { readable: true }), ['retail', 'wholesale']);
});

test('registration creates requested states and never active grants', () => {
    const states = requestedChannelsFromSellingChannels({
        retail: { enabled: true }, wholesale: { enabled: true }, quickCommerce: { enabled: false },
    }, new Date('2026-01-01T00:00:00Z'));
    assert.equal(states.retail.status, 'requested');
    assert.equal(states.wholesale.status, 'requested');
    assert.equal(states.quickCommerce.status, 'disabled');
});

test('product flags are selected from server-normalized workspaces', () => {
    assert.equal(channelToProductFlag('retail'), 'retailEnabled');
    assert.equal(channelToProductFlag('quick-commerce'), 'quickCommerceEnabled');
    assert.equal(channelToProductFlag('unknown'), null);
});

test('channel status transitions require approval and safe pause/disable flow', () => {
    assert.equal(canTransitionVendorChannel('requested', 'active'), true);
    assert.equal(canTransitionVendorChannel('requested', 'rejected'), true);
    assert.equal(canTransitionVendorChannel('active', 'paused'), true);
    assert.equal(canTransitionVendorChannel('paused', 'active'), true);
    assert.equal(canTransitionVendorChannel('paused', 'disabled'), true);
    assert.equal(canTransitionVendorChannel('disabled', 'active'), false);
    assert.equal(canTransitionVendorChannel('rejected', 'active'), false);
    assert.equal(canTransitionVendorChannel('active', 'requested'), false);
});

test('multiple channels require an explicit workspace and forged access is denied', () => {
    const previous = process.env.VENDOR_CHANNEL_AUTHORITY_MODE;
    process.env.VENDOR_CHANNEL_AUTHORITY_MODE = 'channels';
    try {
        let error;
        resolveVendorWorkspace({ query: {}, headers: {}, body: {}, vendor, user: { id: 'v1' } }, { setHeader() {} }, (value) => { error = value; });
        assert.equal(error?.errorCode || error?.code, 'WORKSPACE_REQUIRED');

        const request = { query: { workspace: 'quick_commerce' }, headers: {}, body: {}, vendor, user: { id: 'v1' } };
        resolveVendorWorkspace(request, { setHeader() {} }, (value) => { error = value; });
        assert.equal(error, undefined);
        requireChannel({ write: false })(request, {}, (value) => { error = value; });
        assert.equal(error?.errorCode || error?.code, 'CHANNEL_ACCESS_DENIED');
    } finally {
        if (previous === undefined) delete process.env.VENDOR_CHANNEL_AUTHORITY_MODE;
        else process.env.VENDOR_CHANNEL_AUTHORITY_MODE = previous;
    }
});

test('migration is registered and authority hook does not derive channels from vendorType', () => {
    const registry = fs.readFileSync(new URL('../../src/migrations/index.js', import.meta.url), 'utf8');
    const model = fs.readFileSync(new URL('../../src/models/Vendor.model.js', import.meta.url), 'utf8');
    assert.match(registry, /0008_vendor_channels/);
    assert.match(model, /projectSellingChannels\(this\)/);
    assert.doesNotMatch(model, /this\.channels\s*=\s*.*VendorCapabilities/s);
});

// ─── Migration 0008 backfill unit tests ─────────────────────────────────────

test('migration backfill: retail-only vendorType → only retail active', () => {
    const vendor = { vendorType: 'retail', status: 'approved', isActive: true };
    const { channels, canonicalType } = buildChannelsForLegacyVendor(vendor, new Date('2026-01-01T00:00:00Z'));
    assert.equal(canonicalType, 'retail');
    assert.equal(channels.retail.status, 'active');
    assert.equal(channels.wholesale.status, 'disabled');
    assert.equal(channels.quickCommerce.status, 'disabled');
});

test('migration backfill: wholesale vendorType → only wholesale active', () => {
    const vendor = { vendorType: 'wholesale', status: 'approved', isActive: true };
    const { channels } = buildChannelsForLegacyVendor(vendor, new Date('2026-01-01T00:00:00Z'));
    assert.equal(channels.retail.status, 'disabled');
    assert.equal(channels.wholesale.status, 'active');
    assert.equal(channels.quickCommerce.status, 'disabled');
});

test('migration backfill: historical multi-select sellingChannels wins over vendorType alone', () => {
    // This was the critical defect: a vendor marked both retail + wholesale via
    // legacy sellingChannels would lose wholesale if only vendorType was read.
    const vendor = {
        vendorType: 'retail',
        status: 'approved',
        isActive: true,
        sellingChannels: {
            retail: { enabled: true },
            wholesale: { enabled: true },
            quickCommerce: { enabled: false },
        },
    };
    const { channels } = buildChannelsForLegacyVendor(vendor, new Date('2026-01-01T00:00:00Z'));
    assert.equal(channels.retail.status, 'active', 'retail must be active');
    assert.equal(channels.wholesale.status, 'active', 'wholesale must be active — was previously lost');
    assert.equal(channels.quickCommerce.status, 'disabled');
});

test('migration backfill: deactivated vendor → channels disabled even if sellingChannels enabled', () => {
    const vendor = {
        vendorType: 'retail',
        status: 'approved',
        isActive: false,
        sellingChannels: { retail: { enabled: true }, wholesale: { enabled: true } },
    };
    const { channels } = buildChannelsForLegacyVendor(vendor, new Date('2026-01-01T00:00:00Z'));
    assert.equal(channels.retail.status, 'disabled');
    assert.equal(channels.wholesale.status, 'disabled');
});

test('migration backfill: pending vendor → requested state preserved', () => {
    const vendor = { vendorType: 'retail', status: 'pending', isActive: true };
    const { channels } = buildChannelsForLegacyVendor(vendor, new Date('2026-01-01T00:00:00Z'));
    assert.equal(channels.retail.status, 'requested');
});

test('migration backfill: invalid vendorType defaults to retail', () => {
    const vendor = { vendorType: 'marketplace', status: 'approved', isActive: true };
    const { canonicalType, channels } = buildChannelsForLegacyVendor(vendor, new Date('2026-01-01T00:00:00Z'));
    assert.equal(canonicalType, 'retail');
    assert.equal(channels.retail.status, 'active');
});

test('migration backfill: quick_commerce channel via sellingChannels', () => {
    const vendor = {
        vendorType: 'quick_commerce',
        status: 'approved',
        isActive: true,
        sellingChannels: {
            retail: { enabled: false },
            wholesale: { enabled: false },
            quickCommerce: { enabled: true },
        },
    };
    const { channels } = buildChannelsForLegacyVendor(vendor, new Date('2026-01-01T00:00:00Z'));
    assert.equal(channels.quickCommerce.status, 'active');
    assert.equal(channels.retail.status, 'disabled');
    assert.equal(channels.wholesale.status, 'disabled');
});

// ─── channelSummary & quickCommerceReadiness tests ───────────────────────────

test('channelSummary returns quickCommerceReadiness indicating missing fields for unconfigured vendor', () => {
    const vendorRecord = {
        channels: {
            retail: { status: 'active' },
            quickCommerce: { status: 'requested' },
        },
        quickCommerceProfile: {},
    };
    const summary = channelSummary(vendorRecord);
    assert.equal(summary.quickCommerceReadiness.ready, false);
    assert.ok(summary.quickCommerceReadiness.missing.length > 0);
    assert.ok(summary.quickCommerceReadiness.missing.includes('storeType'));
    assert.ok(summary.quickCommerceReadiness.missing.includes('serviceRadiusKm'));
    assert.ok(summary.quickCommerceReadiness.missing.includes('preparationTimeMins'));
});

test('channelSummary returns quickCommerceReadiness ready: true for fully configured store', () => {
    const vendorRecord = {
        channels: {
            retail: { status: 'active' },
            quickCommerce: { status: 'requested' },
        },
        quickCommerceProfile: {
            storeType: 'dark_store',
            location: { type: 'Point', coordinates: [75.8577, 22.7196] },
            serviceRadiusKm: 5,
            preparationTimeMins: 10,
        },
    };
    const summary = channelSummary(vendorRecord);
    assert.equal(summary.quickCommerceReadiness.ready, true);
    assert.deepEqual(summary.quickCommerceReadiness.missing, []);
});

test('channelSummary returns quickCommerceReadiness ready: true when servicedPincodes replaces coordinates', () => {
    const vendorRecord = {
        channels: {
            quickCommerce: { status: 'requested' },
        },
        quickCommerceProfile: {
            storeType: 'retail_outlet',
            servicedPincodes: ['452001'],
            serviceRadiusKm: 3,
            preparationTimeMins: 15,
        },
    };
    const summary = channelSummary(vendorRecord);
    assert.equal(summary.quickCommerceReadiness.ready, true);
    assert.deepEqual(summary.quickCommerceReadiness.missing, []);
});
