import test from 'node:test';
import assert from 'node:assert/strict';
import { vendorListQuerySchema } from '../../src/modules/admin/validators/vendor.validator.js';
import { normalizeVendorChannel, vendorChannelPath } from '../../src/constants/vendorChannels.js';
import { VendorTypes, VENDOR_TYPE_VALUES } from '../../src/constants/vendorCapabilities.js';

test('vendorListQuerySchema accepts vendorType options and valid query params', () => {
    // Valid queries
    const q1 = vendorListQuerySchema.validate({ status: 'approved', vendorType: 'retail', page: 1, limit: 50 });
    assert.equal(q1.error, undefined);
    assert.equal(q1.value.status, 'approved');
    assert.equal(q1.value.vendorType, 'retail');

    const q2 = vendorListQuerySchema.validate({ status: 'pending', vendorType: 'wholesale', search: 'fashion' });
    assert.equal(q2.error, undefined);
    assert.equal(q2.value.vendorType, 'wholesale');

    const q3 = vendorListQuerySchema.validate({ vendorType: 'quick_commerce' });
    assert.equal(q3.error, undefined);
    assert.equal(q3.value.vendorType, 'quick_commerce');

    const q4 = vendorListQuerySchema.validate({ status: 'all', vendorType: 'all' });
    assert.equal(q4.error, undefined);

    // Invalid vendorType should fail validation
    const invalidType = vendorListQuerySchema.validate({ vendorType: 'non_existent_type' });
    assert.notEqual(invalidType.error, undefined);

    // Invalid status should fail validation
    const invalidStatus = vendorListQuerySchema.validate({ status: 'invalid_status' });
    assert.notEqual(invalidStatus.error, undefined);
});

test('canonical vendor types match VENDOR_TYPE_VALUES', () => {
    assert.deepEqual(VENDOR_TYPE_VALUES.sort(), ['quick_commerce', 'retail', 'wholesale'].sort());
    assert.equal(normalizeVendorChannel('retail'), 'retail');
    assert.equal(normalizeVendorChannel('wholesale'), 'wholesale');
    assert.equal(normalizeVendorChannel('quick_commerce'), 'quick_commerce');
    assert.equal(vendorChannelPath('retail'), 'retail');
    assert.equal(vendorChannelPath('wholesale'), 'wholesale');
    assert.equal(vendorChannelPath('quick_commerce'), 'quickCommerce');
});
