import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import Vendor from '../../src/models/Vendor.model.js';
import SubscriptionPlan from '../../src/models/SubscriptionPlan.model.js';
import VendorSubscription from '../../src/models/VendorSubscription.model.js';
import PhoneVerification from '../../src/models/PhoneVerification.model.js';
import Admin from '../../src/models/Admin.model.js';
import Settings from '../../src/models/Settings.model.js';

import {
    sendPhoneVerification,
    confirmPhoneVerification,
    isPhoneVerified,
} from '../../src/services/phoneVerification.service.js';

import {
    activateSubscription,
    getCurrentVendorSubscription,
} from '../../src/services/billing/subscriptionState.service.js';

let mongod;
const realFetch = global.fetch;

let interaktCalls = [];
let interaktHandler = null;

const okResponse = () => new Response(JSON.stringify({ result: true, id: 'msg-1' }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
});

const PHONE = '+918827974238';

test.before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'vendor_onboarding_qa' });

    global.fetch = async (url, options) => {
        interaktCalls.push({ url: String(url), body: JSON.parse(options.body) });
        return interaktHandler ? interaktHandler() : okResponse();
    };

    Object.assign(process.env, {
        WHATSAPP_ENABLED: 'true',
        WHATSAPP_OTP_ENABLED: 'true',
        WHATSAPP_DRY_RUN: 'false',
        INTERAKT_API_KEY: 'TEST_KEY_NOT_REAL',
        WHATSAPP_DEFAULT_COUNTRY_CODE: '+91',
        NODE_ENV: 'test',
    });
    delete process.env.USE_MOCK_OTP;
});

test.after(async () => {
    global.fetch = realFetch;
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

test.beforeEach(async () => {
    interaktCalls = [];
    interaktHandler = null;
    await PhoneVerification.deleteMany({});
    await Vendor.deleteMany({});
    await SubscriptionPlan.deleteMany({});
    await VendorSubscription.deleteMany({});
    await Admin.deleteMany({});
});

const storedCode = async (phoneE164) => {
    const record = await PhoneVerification.findOne({ phoneE164 }).select('+otp');
    return record?.otp;
};

// ── E2E Case 1: Verified mobile -> Registration -> Free plan activation succeeds ──

test('Verified mobile -> Registration -> Free trial activation succeeds and retains security', async () => {
    // 1. Setup subscription plan
    const plan = await SubscriptionPlan.create({
        name: '180 Days Trial Plan',
        slug: 'trial-180',
        price_inr: 0,
        price_usd: 0,
        interval: 'day',
        interval_count: 180,
        durationDays: 180,
        isTrial: true,
        isActive: true,
    });

    // 2. Request OTP on WhatsApp & Confirm
    await sendPhoneVerification(PHONE);
    const code = await storedCode(PHONE);
    assert.ok(code, 'OTP code must be generated');

    const confirmed = await confirmPhoneVerification(PHONE, code);
    assert.equal(confirmed.phoneE164, PHONE);
    assert.equal(await isPhoneVerified(PHONE), true, 'Phone must be marked verified');

    // 3. Register Vendor
    const vendor = await Vendor.create({
        name: 'riitk',
        email: 'test@example.com',
        password: 'Password123!',
        phone: '8827974238',
        phoneE164: PHONE,
        phoneVerified: true,
        storeName: 'test company',
        status: 'pending',
        selectedPlan: plan._id,
        onboardingStatus: 'plan_selected',
        isVerified: true,
    });

    // Verify the PhoneVerification record is STILL valid for onboarding step 2 authority
    assert.equal(
        await isPhoneVerified(vendor.phoneE164),
        true,
        'PhoneVerification token must remain available during Step 2 payment/activation'
    );

    // 4. Activate Free Subscription
    const subscription = await activateSubscription({
        vendor,
        plan,
        activationSource: 'zero_price_plan',
    });

    assert.equal(subscription.status, 'active');
    assert.equal(subscription.activationSource, 'zero_price_plan');

    // 5. Vendor transitions to subscription_active but remains pending approval
    vendor.onboardingStatus = 'subscription_active';
    vendor.hasUsedTrial = true;
    await vendor.save();

    const freshVendor = await Vendor.findById(vendor._id);
    assert.equal(freshVendor.status, 'pending', 'Vendor must remain pending admin approval');
    assert.equal(freshVendor.onboardingStatus, 'subscription_active');
    assert.equal(freshVendor.hasUsedTrial, true);
});

// ── E2E Case 2: Unverified mobile -> Blocked with 403 / unverified error ──

test('Unverified mobile number is rejected and cannot activate onboarding', async () => {
    const plan = await SubscriptionPlan.create({
        name: 'Trial Plan',
        slug: 'trial-plan-14',
        price_inr: 0,
        price_usd: 0,
        interval: 'day',
        interval_count: 14,
        isTrial: true,
        isActive: true,
    });

    // An unverified number
    const unverifiedPhone = '+919999999999';
    assert.equal(await isPhoneVerified(unverifiedPhone), false);

    const unverifiedVendor = await Vendor.create({
        name: 'Unverified Seller',
        email: 'attacker@example.com',
        password: 'Password123!',
        phone: '9999999999',
        phoneE164: unverifiedPhone,
        phoneVerified: false,
        storeName: 'Fake Store',
        status: 'pending',
        selectedPlan: plan._id,
        onboardingStatus: 'plan_selected',
        isVerified: false,
    });

    assert.equal(
        await isPhoneVerified(unverifiedVendor.phoneE164),
        false,
        'Unverified phone must not have authority'
    );
});

// ── E2E Case 3: Paid Plan -> Free activation is refused with 402 ───────────────

test('Paid plan cannot be activated via zero_price_plan source (returns 402)', async () => {
    const paidPlan = await SubscriptionPlan.create({
        name: 'Monthly Plan',
        slug: 'monthly-plan-qa',
        price_inr: 1000,
        price_usd: 10.86,
        interval: 'month',
        interval_count: 1,
        isActive: true,
    });

    await sendPhoneVerification(PHONE);
    const code = await storedCode(PHONE);
    await confirmPhoneVerification(PHONE, code);

    const vendor = await Vendor.create({
        name: 'Paid Vendor',
        email: 'paid@example.com',
        password: 'Password123!',
        phone: '8827974238',
        phoneE164: PHONE,
        phoneVerified: true,
        storeName: 'Paid Store',
        status: 'pending',
        selectedPlan: paidPlan._id,
        onboardingStatus: 'plan_selected',
        isVerified: true,
    });

    // Attempting zero_price_plan activation on a paid plan MUST throw 402
    await assert.rejects(
        activateSubscription({
            vendor,
            plan: paidPlan,
            activationSource: 'zero_price_plan',
        }),
        (err) => err.statusCode === 402 && /requires payment/i.test(err.message),
        'Paid plan must refuse zero-price activation'
    );
});

// ── E2E Case 4: Paid Plan -> Gateway verified activation succeeds ─────────────

test('Paid plan -> Gateway verified activation succeeds and activates subscription', async () => {
    const paidPlan = await SubscriptionPlan.create({
        name: 'Monthly Plan',
        slug: 'monthly-plan-paid-qa',
        price_inr: 1000,
        price_usd: 10.86,
        interval: 'month',
        interval_count: 1,
        isActive: true,
    });

    await sendPhoneVerification(PHONE);
    const code = await storedCode(PHONE);
    await confirmPhoneVerification(PHONE, code);

    const vendor = await Vendor.create({
        name: 'Paid Vendor Gateway',
        email: 'paid-gw@example.com',
        password: 'Password123!',
        phone: '8827974238',
        phoneE164: PHONE,
        phoneVerified: true,
        storeName: 'Paid GW Store',
        status: 'pending',
        selectedPlan: paidPlan._id,
        onboardingStatus: 'plan_selected',
        isVerified: true,
    });

    // Gateway verified activation with reference
    const subscription = await activateSubscription({
        vendor,
        plan: paidPlan,
        activationSource: 'gateway_verified',
        gatewayPaymentRef: 'cf_order_998877',
    });

    assert.equal(subscription.status, 'active');
    assert.equal(subscription.activationSource, 'gateway_verified');
    assert.equal(subscription.gatewayPaymentRef, 'cf_order_998877');

    const freshVendor = await Vendor.findById(vendor._id);
    assert.equal(freshVendor.onboardingStatus, 'subscription_active');
    assert.equal(freshVendor.status, 'pending');
});
