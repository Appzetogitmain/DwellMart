import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, RETIRED_PERMISSIONS, PERMISSION_DEPENDENCIES } from '../../src/constants/permissions.js';
import AdminActivityLog from '../../src/models/AdminActivityLog.model.js';
import { updateVendorStatus, hardDeleteVendor } from '../../src/modules/admin/controllers/vendor.controller.js';

test('PERMISSIONS.VENDORS_DELETE is active and not retired', () => {
    assert.equal(PERMISSIONS.VENDORS_DELETE, 'vendors.delete');
    assert.ok(!RETIRED_PERMISSIONS.includes('vendors.delete'), 'vendors.delete must not be retired');
    assert.equal(PERMISSION_DEPENDENCIES['vendors.delete'], 'vendors.view');
});

test('AdminActivityLog action enum includes vendor_hard_deleted', () => {
    const actionEnum = AdminActivityLog.schema.path('action').enumValues;
    assert.ok(actionEnum.includes('vendor_hard_deleted'), 'vendor_hard_deleted must be in action enum');
});

test('hardDeleteVendor is exported and is a function', () => {
    assert.equal(typeof hardDeleteVendor, 'function');
    assert.equal(typeof updateVendorStatus, 'function');
});
