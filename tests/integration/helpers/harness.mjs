/**
 * Integration test harness.
 *
 * Boots the real Express app (src/app.js — routes, middleware, controllers and
 * services exactly as production wires them) against an ISOLATED in-memory
 * MongoDB replica set. A replica set rather than a standalone server because
 * checkout, order cancellation and rider withdrawals all use transactions.
 *
 * It never touches MONGO_URI from .env. The suite is safe to run anywhere and
 * cannot reach a hosted cluster.
 */

import http from 'node:http';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Must be set before src/app.js (and anything it imports) is first evaluated.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-jwt-secret-value';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'integration-test-refresh-secret-value';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

let replSet = null;
let server = null;
let mongoose = null;
let baseUrl = '';

export const startHarness = async () => {
    replSet = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    const uri = replSet.getUri('dwellmart_integration_test');
    process.env.MONGO_URI = uri;

    mongoose = (await import('mongoose')).default;
    await mongoose.connect(uri);

    const { default: app } = await import('../../../src/app.js');
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    return { baseUrl, mongoose };
};

export const stopHarness = async ({ exit = true } = {}) => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose) await mongoose.disconnect();
    if (replSet) await replSet.stop();
    server = null; mongoose = null; replSet = null;

    // The app opens handles the test runner cannot see — socket.io, the
    // Firebase Admin SDK, and driver keep-alives — so the process stays alive
    // after every test has passed and is eventually killed by the outer
    // timeout, which the runner then reports as a file-level failure.
    // Exit explicitly once teardown is done.
    if (exit) {
        setImmediate(() => process.exit(process.exitCode ?? 0));
    }
};

/** Drop every collection so each test file starts from a known empty state. */
export const resetDatabase = async () => {
    const collections = await mongoose.connection.db.listCollections().toArray();
    await Promise.all(
        collections.map((c) => mongoose.connection.db.collection(c.name).deleteMany({}))
    );
};

export const getMongoose = () => mongoose;
export const getBaseUrl = () => baseUrl;

/** Issue a request against the running app. Returns { status, body }. */
export const request = async (method, path, { token, workspace, body, headers = {} } = {}) => {
    const finalHeaders = { 'Content-Type': 'application/json', ...headers };
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
    if (workspace) finalHeaders['X-Vendor-Workspace'] = workspace;
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: finalHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
    return { status: response.status, body: parsed };
};

export const get = (path, opts) => request('GET', path, opts);
export const post = (path, body, opts = {}) => request('POST', path, { ...opts, body });
export const put = (path, body, opts = {}) => request('PUT', path, { ...opts, body });
export const patch = (path, body, opts = {}) => request('PATCH', path, { ...opts, body });
export const del = (path, opts) => request('DELETE', path, opts);

export const signToken = async (payload) => {
    const jwt = (await import('jsonwebtoken')).default;
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
};

export const vendorToken = (vendorId) => signToken({ id: String(vendorId), role: 'vendor', email: 'vendor@test.local' });
export const adminToken = (adminId, role = 'superadmin') => signToken({ id: String(adminId), role, email: 'admin@test.local' });
export const customerToken = (userId) => signToken({ id: String(userId), role: 'customer', email: 'customer@test.local' });

/** Monotonic suffix for unique seeded emails/slugs within a test run. */
let seedCounter = 0;
const nextSeedId = () => `${Date.now().toString(36)}${(seedCounter += 1).toString(36)}`;

const channelState = (status) => ({
    status,
    requestedAt: status === 'requested' ? new Date() : null,
    activatedAt: status === 'active' ? new Date() : null,
    pausedAt: status === 'paused' ? new Date() : null,
    rejectedAt: status === 'rejected' ? new Date() : null,
    disabledAt: status === 'disabled' ? new Date() : null,
    reviewedAt: null, reviewedBy: null, requestedBy: 'admin', reason: '',
});

/**
 * Seed a vendor with explicit canonical channel states.
 * `channels` accepts { retail, wholesale, quickCommerce } status strings.
 */
export const seedVendor = async ({
    channels = { retail: 'active', wholesale: 'disabled', quickCommerce: 'disabled' },
    status = 'approved',
    vendorType = 'retail',
    storeName = 'Test Store',
    email,
    isVerified = true,
    isActive = true,
    wholesaleProfile,
    quickCommerceProfile,
} = {}) => {
    const { default: Vendor } = await import('../../../src/models/Vendor.model.js');
    const vendor = await Vendor.create({
        name: storeName,
        email: email || `vendor_${nextSeedId()}@test.local`,
        password: 'TestPassword!234',
        storeName,
        vendorType,
        status,
        isVerified,
        isActive,
        channels: {
            retail: channelState(channels.retail || 'disabled'),
            wholesale: channelState(channels.wholesale || 'disabled'),
            quickCommerce: channelState(channels.quickCommerce || 'disabled'),
        },
        channelsRevision: 1,
        ...(wholesaleProfile ? { wholesaleProfile } : {}),
        ...(quickCommerceProfile ? { quickCommerceProfile } : {}),
    });
    return vendor;
};

export const COMPLETE_WHOLESALE_PROFILE = Object.freeze({
    gstNumber: '27AAAAA0000A1Z5',
    businessName: 'Test Wholesale Co',
    wholesaleContactName: 'Contact Person',
    wholesaleContactPhone: '9990001111',
    bulkOrderSupportEmail: 'bulk@test.local',
});

export const COMPLETE_QC_PROFILE = Object.freeze({
    storeType: 'dark_store',
    location: { type: 'Point', coordinates: [77.2090, 28.6139] },
    locationAddress: 'Test Address',
    serviceRadiusKm: 5,
    preparationTimeMins: 10,
    availabilityStatus: 'open',
});

/**
 * Give a vendor an active subscription so `checkSubscription` passes.
 * Field names follow VendorSubscription.model.js exactly: `vendor` (not
 * vendorId), a required `plan` reference, and a required
 * `gateway_subscription_id`.
 */
export const seedActiveSubscription = async (vendorId) => {
    const { default: VendorSubscription } = await import('../../../src/models/VendorSubscription.model.js');
    const { default: SubscriptionPlan } = await import('../../../src/models/SubscriptionPlan.model.js');
    const { invalidateVendorSubscription } = await import('../../../src/services/billing/subscriptionState.service.js');

    const planId = nextSeedId();
    const plan = await SubscriptionPlan.create({
        name: `Test Plan ${planId}`,
        slug: `test-plan-${planId}`,
        price_inr: 0,
        price_usd: 0,
        interval: 'month',
        interval_count: 1,
        isActive: true,
    });

    const subscription = await VendorSubscription.create({
        vendor: vendorId,
        plan: plan._id,
        gateway: 'internal',
        gateway_subscription_id: `test_sub_${nextSeedId()}`,
        status: 'active',
        activationSource: 'zero_price_plan',
        current_period_start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // The middleware reads through a 15s TTL cache keyed by vendor.
    invalidateVendorSubscription(vendorId);
    return subscription;
};

export const seedCategory = async ({ name = 'Test Category', experience = 'marketplace', supportedExperiences } = {}) => {
    const { default: Category } = await import('../../../src/models/Category.model.js');
    return Category.create({
        name,
        slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${nextSeedId()}`,
        experience,
        ...(supportedExperiences ? { supportedExperiences } : {}),
    });
};

export const seedProduct = async ({
    vendorId,
    categoryId,
    name = 'Test Product',
    price = 100,
    stockQuantity = 100,
    retailEnabled = true,
    wholesaleEnabled = false,
    quickCommerceEnabled = false,
    quickCommerceCategoryId,
    wholesale,
    quickCommerce,
    isActive = true,
} = {}) => {
    const { default: Product } = await import('../../../src/models/Product.model.js');
    return Product.create({
        name,
        slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${nextSeedId()}`,
        vendorId,
        categoryId,
        price,
        stockQuantity,
        stock: stockQuantity > 0 ? 'in_stock' : 'out_of_stock',
        retailEnabled,
        wholesaleEnabled,
        quickCommerceEnabled,
        isActive,
        ...(quickCommerceCategoryId ? { quickCommerceCategoryId } : {}),
        ...(wholesale ? { wholesale } : {}),
        ...(quickCommerce ? { quickCommerce } : {}),
    });
};

export const seedAdmin = async ({ role = 'superadmin', permissions = [] } = {}) => {
    const { default: Admin } = await import('../../../src/models/Admin.model.js');
    return Admin.create({
        name: 'Test Admin',
        email: `admin_${nextSeedId()}@test.local`,
        password: 'AdminPassword!234',
        role,
        permissions,
        isActive: true,
    });
};

export const seedCustomer = async () => {
    const { default: User } = await import('../../../src/models/User.model.js');
    return User.create({
        name: 'Test Customer',
        email: `customer_${nextSeedId()}@test.local`,
        password: 'CustomerPassword!234',
        isVerified: true,
        isActive: true,
    });
};

/** Set the platform feature flags the catalog and checkout paths read. */
export const setFeatureFlags = async (value) => {
    const { default: Settings } = await import('../../../src/models/Settings.model.js');
    await Settings.findOneAndUpdate({ key: 'features' }, { key: 'features', value }, { upsert: true });
    const { invalidateFeatureFlags } = await import('../../../src/services/featureFlags.service.js');
    invalidateFeatureFlags();
};
