import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import Vendor from '../../src/models/Vendor.model.js';
import Admin from '../../src/models/Admin.model.js';
import Settings from '../../src/models/Settings.model.js';
import { updateVendorStatus, updateVendorChannelStatus } from '../../src/modules/admin/controllers/vendor.controller.js';

let mongod;

test.before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'admin_vendor_qc_qa' });
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_jwt_secret_for_tests';

    // Enable feature flags
    await Settings.create({
        key: 'features',
        value: {
            quickCommerceEnabled: true,
            wholesaleMarketplaceEnabled: true,
        },
    });
});

test.after(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

test.beforeEach(async () => {
    await Vendor.deleteMany({});
    await Admin.deleteMany({});
});

const mockReqRes = (params, body, user) => {
    const req = {
        params,
        body,
        user: user || { id: new mongoose.Types.ObjectId().toString(), role: 'admin' },
        query: {},
        ip: '127.0.0.1',
        headers: {},
        get: () => '',
    };
    let responseStatus = 200;
    let responseData = null;
    const res = {
        status(code) {
            responseStatus = code;
            return this;
        },
        json(data) {
            responseData = data;
            return this;
        },
    };
    return { req, res, getStatus: () => responseStatus, getData: () => responseData };
};

test('Admin can approve vendor account even if Quick Commerce setup is not yet complete', async () => {
    // 1. Create a registered vendor who requested Retail and Quick Commerce
    const vendor = await Vendor.create({
        name: 'QC Seller',
        email: 'qcseller@example.com',
        password: 'Password123!',
        phone: '9876543210',
        phoneE164: '+919876543210',
        storeName: 'QC Mart',
        status: 'pending',
        onboardingStatus: 'subscription_active',
        isVerified: true,
        channels: {
            retail: { status: 'requested' },
            quickCommerce: { status: 'requested' },
            wholesale: { status: 'disabled' },
        },
        channelsRevision: 1,
        quickCommerceProfile: {}, // Incomplete / empty profile
    });

    const adminId = new mongoose.Types.ObjectId().toString();
    const { req, res, getStatus, getData } = mockReqRes(
        { id: String(vendor._id) },
        {
            status: 'approved',
            approvedChannels: ['retail', 'quick_commerce'],
        },
        { id: adminId, role: 'admin' }
    );

    // 2. Admin approves vendor status
    await updateVendorStatus(req, res);

    assert.equal(getStatus(), 200, 'Vendor status update must return HTTP 200');
    
    // 3. Verify DB state:
    const updatedVendor = await Vendor.findById(vendor._id);
    assert.equal(updatedVendor.status, 'approved', 'Vendor account status must be approved');
    assert.equal(updatedVendor.channels.retail.status, 'active', 'Retail channel must be activated');
    assert.equal(
        updatedVendor.channels.quickCommerce.status,
        'requested',
        'Quick Commerce channel must remain requested (deferred pending store setup)'
    );
});

test('Direct Quick Commerce channel activation is blocked if setup is incomplete, and passes once configured', async () => {
    // 1. Approved vendor with incomplete QC profile
    const vendor = await Vendor.create({
        name: 'QC Seller 2',
        email: 'qcseller2@example.com',
        password: 'Password123!',
        phone: '9876543211',
        phoneE164: '+919876543211',
        storeName: 'QC Mart 2',
        status: 'approved',
        onboardingStatus: 'subscription_active',
        isVerified: true,
        channels: {
            retail: { status: 'active' },
            quickCommerce: { status: 'requested' },
            wholesale: { status: 'disabled' },
        },
        channelsRevision: 1,
        quickCommerceProfile: {},
    });

    const adminId = new mongoose.Types.ObjectId().toString();

    // 2. Attempting to directly activate QC channel while unconfigured throws 400
    const { req: req1, res: res1 } = mockReqRes(
        { id: String(vendor._id), channel: 'quick_commerce' },
        { status: 'active', expectedRevision: 1 },
        { id: adminId, role: 'admin' }
    );

    await assert.rejects(
        () => updateVendorChannelStatus(req1, res1),
        (err) => err.statusCode === 400 && /Quick Commerce setup is incomplete/i.test(err.message),
        'Direct channel activation must enforce Quick Commerce setup readiness'
    );

    // 3. Vendor or Admin completes QC operational profile
    vendor.quickCommerceProfile = {
        storeType: 'dark_store',
        location: { type: 'Point', coordinates: [77.2, 28.6] },
        serviceRadiusKm: 5,
        preparationTimeMins: 15,
    };
    await vendor.save();

    // 4. Activating QC channel now succeeds
    const { req: req2, res: res2, getStatus: getStatus2 } = mockReqRes(
        { id: String(vendor._id), channel: 'quick_commerce' },
        { status: 'active', expectedRevision: 1 },
        { id: adminId, role: 'admin' }
    );

    await updateVendorChannelStatus(req2, res2);
    assert.equal(getStatus2(), 200);

    const activeVendor = await Vendor.findById(vendor._id);
    assert.equal(activeVendor.channels.quickCommerce.status, 'active');
});

test('Vendor in requested channel state can configure QC settings via updateQuickCommerceSettings', async () => {
    const { updateQuickCommerceSettings } = await import('../../src/modules/vendor/controllers/auth.controller.js');

    const vendor = await Vendor.create({
        name: 'QC Seller 3',
        email: 'qcseller3@example.com',
        password: 'Password123!',
        phone: '9876543212',
        phoneE164: '+919876543212',
        storeName: 'QC Mart 3',
        status: 'approved',
        onboardingStatus: 'subscription_active',
        isVerified: true,
        channels: {
            retail: { status: 'active' },
            quickCommerce: { status: 'requested' },
            wholesale: { status: 'disabled' },
        },
        channelsRevision: 1,
        quickCommerceProfile: {},
    });

    const { req, res, getStatus, getData } = mockReqRes(
        {},
        {
            storeType: 'dark_store',
            latitude: 28.6139,
            longitude: 77.2090,
            locationAddress: 'New Delhi, India',
            serviceRadiusKm: 6,
            preparationTimeMins: 12,
            servicedPincodes: ['110001', '110002'],
        },
        { id: String(vendor._id), role: 'vendor' }
    );

    await updateQuickCommerceSettings(req, res);
    assert.equal(getStatus(), 200);

    const savedVendor = await Vendor.findById(vendor._id);
    assert.equal(savedVendor.quickCommerceProfile.storeType, 'dark_store');
    assert.equal(savedVendor.quickCommerceProfile.location.type, 'Point');
    assert.deepEqual(savedVendor.quickCommerceProfile.location.coordinates, [77.209, 28.6139]);
    assert.equal(savedVendor.quickCommerceProfile.serviceRadiusKm, 6);
    assert.equal(savedVendor.quickCommerceProfile.preparationTimeMins, 12);
    assert.equal(savedVendor.channels.quickCommerce.status, 'requested', 'Channel remains requested until admin activates');
});

