/**
 * Fixture builders for the DTDC end-to-end suite.
 *
 * Every builder produces a document that satisfies the same guards the real
 * request path enforces (verified, approved, subscribed, channel-active), so a
 * test failure means the DTDC code is wrong rather than the fixture.
 */
import mongoose from 'mongoose';

const load = async (p) => (await import(p)).default;

export const models = async () => ({
    Order:        await load('../../src/models/Order.model.js'),
    Vendor:       await load('../../src/models/Vendor.model.js'),
    Shipment:     await load('../../src/models/Shipment.model.js'),
    User:         await load('../../src/models/User.model.js'),
    PickupLocation: await load('../../src/models/PickupLocation.model.js'),
    SubscriptionPlan: await load('../../src/models/SubscriptionPlan.model.js'),
    VendorSubscription: await load('../../src/models/VendorSubscription.model.js'),
});

export const CHANNEL_SETS = {
    retail:    { retail: { status: 'active' },   wholesale: { status: 'disabled' }, quickCommerce: { status: 'disabled' } },
    wholesale: { retail: { status: 'disabled' }, wholesale: { status: 'active' },   quickCommerce: { status: 'disabled' } },
    qc:        { retail: { status: 'disabled' }, wholesale: { status: 'disabled' }, quickCommerce: { status: 'active' } },
    retailPaused: { retail: { status: 'paused' }, wholesale: { status: 'disabled' }, quickCommerce: { status: 'disabled' } },
    all:       { retail: { status: 'active' },   wholesale: { status: 'active' },   quickCommerce: { status: 'active' } },
};

let planCache = null;
const ensurePlan = async (M) => {
    if (planCache) return planCache;
    planCache = await M.SubscriptionPlan.create({
        name: 'QA Plan', slug: `qa-plan-${Date.now()}`, price_inr: 0, price_usd: 0,
        interval: 'month', interval_count: 1,
    });
    return planCache;
};

export const resetPlanCache = () => { planCache = null; };

export const makeVendor = async (M, name, channelSet = 'retail') => {
    const vendor = await M.Vendor.create({
        name, email: `${name.toLowerCase()}-${Date.now()}@qa.test`, password: 'xxxxxxxx',
        storeName: name, phone: '9999999999',
        status: 'approved', isVerified: true, isActive: true,
        channels: CHANNEL_SETS[channelSet],
        address: { street: '12 MG Road', city: 'Hyderabad', state: 'Telangana', zipCode: '500001', country: 'India' },
    });
    const plan = await ensurePlan(M);
    await M.VendorSubscription.create({
        vendor: vendor._id, plan: plan._id, gateway: 'internal',
        gateway_subscription_id: `sub_${vendor._id}`, status: 'active',
        current_period_start: new Date(Date.now() - 86400000),
        current_period_end: new Date(Date.now() + 30 * 86400000),
    });
    await M.PickupLocation.create({
        vendorId: vendor._id, name: `${name} Warehouse`, isDefault: true, phone: '9888888888',
        address: { street: '12 MG Road, Banjara Hills', city: 'Hyderabad', state: 'Telangana', zipCode: '500034', country: 'India' },
    });
    return vendor;
};

export const makeUser = async (M, name) =>
    M.User.create({ name, email: `${name.toLowerCase()}-${Date.now()}@qa.test`, password: 'xxxxxxxx', isVerified: true });

let seq = 0;
export const makeOrder = async (M, overrides = {}) => M.Order.create({
    orderId: `QA-${Date.now()}-${++seq}`,
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    total: 1499,
    subtotal: 1499,
    items: [{ name: 'Widget', quantity: 2, price: 749.5 }],
    shippingAddress: {
        name: 'Ravi Kumar', phone: '9777777777', address: '5 Park Street, Connaught Place',
        city: 'New Delhi', state: 'Delhi', zipCode: '110001', country: 'India',
    },
    ...overrides,
});

export const clearSubscriptionCache = async () => {
    // The subscription state service memoises per-vendor; tests create fresh
    // vendors so the cache never serves a stale entry across cases.
};

export { mongoose };
