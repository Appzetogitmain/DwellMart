import test from 'node:test';
import assert from 'node:assert/strict';
import { quickCommerceReadiness } from '../../src/services/vendorChannelTransition.service.js';
import { channelSummary } from '../../src/services/vendorChannel.service.js';

// Evaluator function matching frontend QuickCommerceSetupReminderModal trigger logic
const evaluateQuickCommerceReminderVisibility = (vendor, isDismissedInSession = false) => {
    const isApproved = vendor?.status === 'approved';
    const isQcRequested = vendor?.channels?.quickCommerce?.status === 'requested';
    const readiness = vendor?.quickCommerceReadiness ?? quickCommerceReadiness(vendor);
    const isQcReady = readiness?.ready === true;

    return isApproved && isQcRequested && !isQcReady && !isDismissedInSession;
};

test('1. QC requested + setup incomplete → reminder appears', () => {
    const vendor = {
        _id: 'v1',
        status: 'approved',
        channels: {
            retail: { status: 'active' },
            quickCommerce: { status: 'requested' },
        },
        quickCommerceProfile: {},
    };
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(summary.quickCommerceReadiness.ready, false);
    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, false), true);
});

test('2. QC requested + setup complete → reminder does NOT appear', () => {
    const vendor = {
        _id: 'v2',
        status: 'approved',
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
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(summary.quickCommerceReadiness.ready, true);
    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, false), false);
});

test('3. QC active → reminder does NOT appear', () => {
    const vendor = {
        _id: 'v3',
        status: 'approved',
        channels: {
            quickCommerce: { status: 'active' },
        },
        quickCommerceProfile: {
            storeType: 'dark_store',
            location: { type: 'Point', coordinates: [75.8577, 22.7196] },
            serviceRadiusKm: 5,
            preparationTimeMins: 10,
        },
    };
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, false), false);
});

test('4. Retail-only vendor → reminder does NOT appear', () => {
    const vendor = {
        _id: 'v4',
        status: 'approved',
        channels: {
            retail: { status: 'active' },
            wholesale: { status: 'disabled' },
            quickCommerce: { status: 'disabled' },
        },
        quickCommerceProfile: null,
    };
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, false), false);
});

test('5. Wholesale-only vendor → reminder does NOT appear', () => {
    const vendor = {
        _id: 'v5',
        status: 'approved',
        channels: {
            retail: { status: 'disabled' },
            wholesale: { status: 'active' },
            quickCommerce: { status: 'disabled' },
        },
        quickCommerceProfile: null,
    };
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, false), false);
});

test('6. Retail + Wholesale vendor without QC → reminder does NOT appear', () => {
    const vendor = {
        _id: 'v6',
        status: 'approved',
        channels: {
            retail: { status: 'active' },
            wholesale: { status: 'active' },
            quickCommerce: { status: 'disabled' },
        },
        quickCommerceProfile: null,
    };
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, false), false);
});

test('7. Quick Commerce + Retail vendor with incomplete setup → reminder appears', () => {
    const vendor = {
        _id: 'v7',
        status: 'approved',
        channels: {
            retail: { status: 'active' },
            quickCommerce: { status: 'requested' },
        },
        quickCommerceProfile: {
            storeType: 'retail_outlet',
            // Missing location/pincodes, radius, preparation time
        },
    };
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(summary.quickCommerceReadiness.ready, false);
    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, false), true);
});

test('8. Quick Commerce + Wholesale vendor with incomplete setup → reminder appears', () => {
    const vendor = {
        _id: 'v8',
        status: 'approved',
        channels: {
            wholesale: { status: 'active' },
            quickCommerce: { status: 'requested' },
        },
        quickCommerceProfile: null,
    };
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(summary.quickCommerceReadiness.ready, false);
    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, false), true);
});

test('9. Quick Commerce-only vendor with incomplete setup → reminder appears', () => {
    const vendor = {
        _id: 'v9',
        status: 'approved',
        channels: {
            quickCommerce: { status: 'requested' },
        },
        quickCommerceProfile: {},
    };
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(summary.quickCommerceReadiness.ready, false);
    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, false), true);
});

test('10. Remind Me Later (dismissed in current session) → reminder does NOT appear', () => {
    const vendor = {
        _id: 'v10',
        status: 'approved',
        channels: {
            retail: { status: 'active' },
            quickCommerce: { status: 'requested' },
        },
        quickCommerceProfile: {},
    };
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, true), false);
});

test('11. Pending approval vendor → reminder does NOT appear (account not approved yet)', () => {
    const vendor = {
        _id: 'v11',
        status: 'pending',
        channels: {
            quickCommerce: { status: 'requested' },
        },
        quickCommerceProfile: {},
    };
    const summary = channelSummary(vendor);
    const vendorWithSummary = { ...vendor, ...summary };

    assert.equal(evaluateQuickCommerceReminderVisibility(vendorWithSummary, false), false);
});
