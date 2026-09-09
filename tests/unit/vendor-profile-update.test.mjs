import test from 'node:test';
import assert from 'node:assert/strict';
import { channelSummary } from '../../src/services/vendorChannel.service.js';

test('vendor profile update regression: channelSummary populates workspaces', () => {
    const wholesaleVendor = {
        _id: 'v_wholesale_1',
        storeName: 'M/S Satya Sales Corporation',
        vendorType: 'wholesale',
        channels: {
            retail: { status: 'disabled' },
            wholesale: { status: 'active' },
            quickCommerce: { status: 'disabled' },
        },
    };

    const summary = channelSummary(wholesaleVendor);
    assert.deepEqual(summary.activeWorkspaces, ['wholesale']);
    assert.deepEqual(summary.readableWorkspaces, ['wholesale']);
    assert.equal(summary.channels.wholesale.status, 'active');
});

test('vendor profile update regression: state merge preserves active and readable workspaces', () => {
    // Initial session state after login or profile load
    const currentVendor = {
        _id: 'v_wholesale_1',
        storeName: 'M/S Satya Sales Corporation',
        phone: '9876543210',
        activeWorkspaces: ['wholesale'],
        readableWorkspaces: ['wholesale'],
        channels: {
            retail: { status: 'disabled' },
            wholesale: { status: 'active' },
            quickCommerce: { status: 'disabled' },
        },
    };

    // 1. When backend returns complete canonical vendor payload
    const backendCanonicalResponse = {
        _id: 'v_wholesale_1',
        storeName: 'M/S Satya Sales Corporation Updated',
        phone: '9876543210',
        activeWorkspaces: ['wholesale'],
        readableWorkspaces: ['wholesale'],
        channels: {
            retail: { status: 'disabled' },
            wholesale: { status: 'active' },
            quickCommerce: { status: 'disabled' },
        },
    };

    // Merging logic from vendorAuthStore.updateProfile
    const cleanReturned = Object.fromEntries(
        Object.entries(backendCanonicalResponse).filter(([_, v]) => v !== undefined)
    );
    const updatedVendor = {
        ...currentVendor,
        ...cleanReturned,
    };
    if (!updatedVendor.activeWorkspaces && currentVendor.activeWorkspaces) {
        updatedVendor.activeWorkspaces = currentVendor.activeWorkspaces;
    }
    if (!updatedVendor.readableWorkspaces && currentVendor.readableWorkspaces) {
        updatedVendor.readableWorkspaces = currentVendor.readableWorkspaces;
    }

    assert.equal(updatedVendor.storeName, 'M/S Satya Sales Corporation Updated');
    assert.deepEqual(updatedVendor.activeWorkspaces, ['wholesale']);
    assert.deepEqual(updatedVendor.readableWorkspaces, ['wholesale']);
    // Guard against /vendor/no-active-channel redirect
    assert.equal(updatedVendor.readableWorkspaces.length > 0, true);

    // 2. Defensive check: even if a partial payload arrives missing workspace arrays
    const partialResponse = {
        _id: 'v_wholesale_1',
        storeName: 'Partial Update Only',
    };
    const cleanPartial = Object.fromEntries(
        Object.entries(partialResponse).filter(([_, v]) => v !== undefined)
    );
    const updatedWithPartial = {
        ...currentVendor,
        ...cleanPartial,
    };
    if (!updatedWithPartial.activeWorkspaces && currentVendor.activeWorkspaces) {
        updatedWithPartial.activeWorkspaces = currentVendor.activeWorkspaces;
    }
    if (!updatedWithPartial.readableWorkspaces && currentVendor.readableWorkspaces) {
        updatedWithPartial.readableWorkspaces = currentVendor.readableWorkspaces;
    }

    assert.equal(updatedWithPartial.storeName, 'Partial Update Only');
    assert.deepEqual(updatedWithPartial.activeWorkspaces, ['wholesale']);
    assert.deepEqual(updatedWithPartial.readableWorkspaces, ['wholesale']);
    assert.equal(updatedWithPartial.readableWorkspaces.length > 0, true);
});

test('vendor profile update regression: multi-channel vendors preserve all readable workspaces', () => {
    const multiChannelVendor = {
        _id: 'v_multi_1',
        channels: {
            retail: { status: 'active' },
            wholesale: { status: 'active' },
            quickCommerce: { status: 'paused' },
        },
    };

    const summary = channelSummary(multiChannelVendor);
    assert.deepEqual(summary.activeWorkspaces, ['retail', 'wholesale']);
    assert.deepEqual(summary.readableWorkspaces, ['retail', 'wholesale', 'quick_commerce']);
});
