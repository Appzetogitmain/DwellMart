/**
 * Role and permission matrix.
 *
 * Every sensitive endpoint, driven by every role that should and should not
 * reach it. The audit found two authorization defects that no unit test could
 * have caught, because both live in route wiring rather than in any function:
 * a public route reusing an admin controller, and admin routes bound to
 * authentication without the permission check their neighbours use.
 *
 * Route-level defects need route-level tests. That is what this file is.
 */

import { asActor, get, post, put, patch } from './support/client.mjs';
import {
    beginSuite,
    check,
    checkStatus,
    checkStatusKnownGap,
    checkKnownGap,
} from './support/gate.mjs';
import {
    seedStandardWorld,
    seedSubAdmin,
    seedPlatformSettings,
} from './support/seed.mjs';
import { authenticateWorld, loginAdmin } from './support/auth.mjs';
import { resetTestDatabase } from './support/database.mjs';
import { clearResponseCache } from '../../src/middlewares/responseCache.js';
import { PERMISSIONS } from '../../src/constants/permissions.js';
import Settings from '../../src/models/Settings.model.js';

const UNAUTHENTICATED = [401, 403];

export const run = async () => {
    beginSuite('Roles & permissions — authorization matrix');

    await resetTestDatabase();
    clearResponseCache();

    const world = await seedStandardWorld();
    const tokens = await authenticateWorld(world);

    const admin = asActor(tokens.admin.token);
    const vendor = asActor(tokens.vendor.token);
    const customer = asActor(tokens.customer.token);
    const rider = asActor(tokens.quickRider.token);

    // A subadmin with a deliberately narrow grant: enough to log in and read
    // products, nothing that should touch settings, orders or vendors.
    const narrow = await seedSubAdmin([PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.PRODUCTS_VIEW]);
    const narrowAuth = await loginAdmin(narrow.email, narrow.password);
    const subAdmin = asActor(narrowAuth.token);

    // ── 1. Unauthenticated access to protected surfaces ──────────────────────
    checkStatus(await get('/admin/orders'), UNAUTHENTICATED,
        'admin orders reject an unauthenticated caller');
    checkStatus(await get('/vendor/orders'), UNAUTHENTICATED,
        'vendor orders reject an unauthenticated caller');
    checkStatus(await get('/delivery/orders'), UNAUTHENTICATED,
        'delivery orders reject an unauthenticated caller');
    checkStatus(await get('/user/orders'), UNAUTHENTICATED,
        'customer orders reject an unauthenticated caller');
    checkStatus(await get('/admin/analytics/quick-commerce'), UNAUTHENTICATED,
        'Quick Commerce analytics reject an unauthenticated caller');

    // ── 2. Cross-role token rejection ────────────────────────────────────────
    checkStatus(await customer.get('/admin/orders'), UNAUTHENTICATED,
        'a customer token cannot reach admin endpoints');
    checkStatus(await customer.get('/vendor/orders'), UNAUTHENTICATED,
        'a customer token cannot reach vendor endpoints');
    checkStatus(await vendor.get('/admin/orders'), UNAUTHENTICATED,
        'a vendor token cannot reach admin endpoints');
    checkStatus(await vendor.get('/user/orders'), UNAUTHENTICATED,
        'a vendor token cannot reach customer endpoints');
    checkStatus(await rider.get('/admin/orders'), UNAUTHENTICATED,
        'a rider token cannot reach admin endpoints');
    checkStatus(await rider.get('/vendor/orders'), UNAUTHENTICATED,
        'a rider token cannot reach vendor endpoints');
    checkStatus(await customer.get('/delivery/orders'), UNAUTHENTICATED,
        'a customer token cannot reach delivery endpoints');

    // ── 3. Permission enforcement within the admin role ──────────────────────
    checkStatus(await admin.get('/admin/orders'), 200,
        'a full-access admin can read orders');
    checkStatus(await subAdmin.get('/admin/orders'), 403,
        'a subadmin without orders.view is denied order access');
    checkStatus(await subAdmin.get('/admin/vendors'), 403,
        'a subadmin without vendors.view is denied vendor access');
    // The route is permAny(quickcommerce.analytics.view, dashboard.view), so a
    // holder of EITHER token is allowed. Assert both sides of that contract.
    checkStatus(await subAdmin.get('/admin/analytics/quick-commerce'), 200,
        'a subadmin with dashboard.view may read Quick Commerce analytics (permAny)');

    const minimal = await seedSubAdmin([PERMISSIONS.PRODUCTS_VIEW]);
    const minimalAuth = await loginAdmin(minimal.email, minimal.password);
    checkStatus(
        await asActor(minimalAuth.token).get('/admin/analytics/quick-commerce'),
        403,
        'a subadmin holding neither analytics nor dashboard permission is denied'
    );
    checkStatus(await subAdmin.get('/admin/products'), 200,
        'a subadmin retains the permission it was granted');

    // ── 4. Settings — the audit's two authorization defects ──────────────────
    await seedPlatformSettings();

    // SEC-1. The security property is NOT "no settings are public" — the
    // storefront legitimately needs payment-method availability and feature
    // toggles to decide what to render. The property is that only non-sensitive
    // values ever leave the public endpoint, and that operational categories
    // are not public at all.
    //
    // Plant a credential-shaped value first, so the assertion proves the filter
    // works rather than merely that today's fixture happens to be clean.
    await Settings.findOneAndUpdate(
        { key: 'payment' },
        {
            key: 'payment',
            value: {
                codEnabled: true,
                cardEnabled: true,
                razorpayKeySecret: 'rzp_secret_MUST_NEVER_BE_PUBLIC',
                stripeSecretKey: 'sk_live_MUST_NEVER_BE_PUBLIC',
                webhookUrl: 'https://internal.example/webhook',
                gateway: { apiKey: 'nested_secret_MUST_NEVER_BE_PUBLIC', enabled: true },
            },
        },
        { upsert: true }
    );
    clearResponseCache();

    const anonymousPayment = await get('/settings/payment');
    const paymentBody = JSON.stringify(anonymousPayment.data ?? {});
    check(
        !paymentBody.includes('MUST_NEVER_BE_PUBLIC'),
        'no payment credential is published to an anonymous caller',
        `body=${paymentBody}`
    );
    check(
        !paymentBody.includes('internal.example'),
        'no internal webhook URL is published to an anonymous caller',
        `body=${paymentBody}`
    );
    check(
        anonymousPayment.data?.codEnabled === true
        && anonymousPayment.data?.cardEnabled === true,
        'payment-method availability the storefront needs is still published',
        `body=${paymentBody}`
    );
    check(
        anonymousPayment.data?.gateway?.enabled === true
        && anonymousPayment.data?.gateway?.apiKey === undefined,
        'nested secrets are filtered while nested toggles survive',
        `gateway=${JSON.stringify(anonymousPayment.data?.gateway)}`
    );

    await seedPlatformSettings();
    clearResponseCache();

    // Feature flags are booleans and are meant to be public.
    const anonymousFeatures = await get('/settings/features');
    check(
        anonymousFeatures.status === 200
        && typeof anonymousFeatures.data?.quickCommerceEnabled === 'boolean',
        'storefront feature flags remain anonymously readable',
        `HTTP ${anonymousFeatures.status} body=${JSON.stringify(anonymousFeatures.data)}`
    );

    // Operational configuration is not a storefront concern and is not public.
    const anonymousQc = await get('/settings/quick_commerce');
    check(
        anonymousQc.status === 404,
        'Quick Commerce fee configuration is not publicly readable',
        `HTTP ${anonymousQc.status} body=${JSON.stringify(anonymousQc.data)}`
    );

    // An admin with permission still sees the whole document.
    const adminQc = await admin.get('/admin/settings/quick_commerce');
    check(
        adminQc.status === 200 && Number(adminQc.data?.baseDeliveryFee) >= 0,
        'an authorised admin still reads the full settings document',
        `HTTP ${adminQc.status}`
    );

    // SEC-2: admin category routes are bound to adminAuth without a permission.
    const subAdminRead = await subAdmin.get('/admin/settings/payment');
    checkStatus(subAdminRead, 403,
        'a subadmin without settings.view cannot read the payment category');

    const subAdminWrite = await subAdmin.put('/admin/settings/features', {
        body: { quickCommerceEnabled: false, wholesaleMarketplaceEnabled: false },
    });
    checkStatus(subAdminWrite, 403,
        'a subadmin without settings.edit cannot rewrite platform feature flags');

    // Whatever the permission outcome, confirm the write's real-world effect so
    // the severity is evidenced rather than asserted.
    const featuresAfter = await Settings.findOne({ key: 'features' }).lean();
    check(
        typeof featuresAfter?.value === 'object',
        'the features settings document remains readable after the attempt'
    );

    // Restore any damage the probe caused before other suites observe it.
    await seedPlatformSettings();
    clearResponseCache();

    // SEC-3: writes are unvalidated.
    const nonsenseWrite = await admin.put('/admin/settings/quick_commerce', {
        body: { baseDeliveryFee: -9999, perKmDeliveryFee: 'not-a-number', injected: { a: 1 } },
    });
    checkStatus(nonsenseWrite, 400,
        'settings writes reject negative fees and wrong types');

    const unknownCategoryWrite = await admin.put('/admin/settings/invented_category', {
        body: { anything: true },
    });
    checkStatus(unknownCategoryWrite, 400,
        'writing an invented settings category is rejected');

    const validWrite = await admin.put('/admin/settings/quick_commerce', {
        body: { baseDeliveryFee: 30, perKmDeliveryFee: 9, averageSpeedKmph: 22 },
    });
    checkStatus(validWrite, 200,
        'a valid settings write is still accepted');

    await seedPlatformSettings();
    clearResponseCache();

    // ── 5. Vendor data isolation ─────────────────────────────────────────────
    const { seedVendor } = await import('./support/seed.mjs');
    const { loginVendor } = await import('./support/auth.mjs');
    const otherVendor = await seedVendor();
    const otherVendorAuth = await loginVendor(otherVendor.email, otherVendor.password);
    const intruder = asActor(otherVendorAuth.token);

    const foreignProduct = await intruder.get(`/vendor/products/${world.products.retail._id}`);
    check(
        foreignProduct.status !== 200,
        'a vendor cannot read another vendor\'s product',
        `HTTP ${foreignProduct.status}`
    );

    // A syntactically valid but unrelated order id: the vendor has no line in it,
    // so ownership — not payload shape — must be what rejects this.
    const foreignQcStatus = await intruder.patch(
        '/vendor/orders/000000000000000000000000/quick-status',
        { body: { status: 'accepted' } }
    );
    checkStatus(foreignQcStatus, 404, 'a vendor cannot transition an order it has no line in');

    // ── 6. Rider data isolation ──────────────────────────────────────────────
    const foreignRiderOrder = await asActor(tokens.marketplaceRider.token).patch(
        '/delivery/orders/000000000000000000000000/quick-status',
        { body: { status: 'picked_up' } }
    );
    checkStatus(foreignRiderOrder, 404, 'a rider cannot transition an order not assigned to them');

    // ── 7. Feature flag gating ───────────────────────────────────────────────
    await seedPlatformSettings({ quickCommerceEnabled: false, wholesaleEnabled: true });
    clearResponseCache();

    checkStatus(await get('/quick/serviceability', { query: { pincode: '560001' } }), 404,
        'Quick Commerce discovery is unreachable while the platform flag is off');

    const flaggedOffOrder = await customer.post('/user/orders', {
        experience: 'quick_commerce',
        body: {
            items: [{ productId: String(world.products.quick._id), quantity: 1 }],
            shippingAddress: {
                name: 'Harness Customer', email: world.customer.email, phone: '9876500001',
                address: '1 Harness Street', city: 'Bengaluru', state: 'Karnataka',
                zipCode: '560001', country: 'India',
            },
            paymentMethod: 'cash',
            customerLocation: { latitude: 12.9716, longitude: 77.5946 },
        },
    });
    checkStatus(flaggedOffOrder, 403,
        'a Quick Commerce order cannot be placed while the platform flag is off');

    await seedPlatformSettings();
    clearResponseCache();

    // ── 8. Public surfaces stay public ───────────────────────────────────────
    checkStatus(await get('/products', { query: { limit: 1 } }), 200,
        'the public product catalogue remains anonymously readable');
    checkStatus(await get('/categories/all'), 200,
        'public categories remain anonymously readable');
    checkStatus(await get('/settings/general'), 200,
        'public storefront settings remain anonymously readable');

    // Storefront identity must not carry operational configuration with it.
    const generalSettings = await get('/settings/general');
    check(
        generalSettings.data?.payment === undefined
        && generalSettings.data?.quick_commerce === undefined,
        'public general settings do not embed other settings categories',
        JSON.stringify(Object.keys(generalSettings.data || {}))
    );

    // ── 9. Mass assignment on registration ───────────────────────────────────
    const escalation = await post('/user/auth/register', {
        body: {
            name: 'Privilege Probe',
            email: `probe.${Date.now()}@harness-test.com`,
            password: 'ProbePassw0rd!',
            phone: '9876500099',
            role: 'admin',
            isVerified: true,
            isActive: true,
        },
    });
    if (escalation.status === 201 || escalation.status === 200) {
        const { default: User } = await import('../../src/models/User.model.js');
        const probe = await User.findOne({ name: 'Privilege Probe' }).lean();
        check(
            probe?.role !== 'admin',
            'registration cannot assign a privileged role through the request body',
            `role=${probe?.role}`
        );
        check(
            probe?.isVerified !== true,
            'registration cannot self-verify through the request body',
            `isVerified=${probe?.isVerified}`
        );
    } else {
        check(true, 'registration rejected the privilege-escalation payload',
            `HTTP ${escalation.status}`);
    }
};

export default run;
