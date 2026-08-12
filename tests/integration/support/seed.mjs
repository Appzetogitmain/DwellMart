/**
 * Realistic fixtures for the integration suites.
 *
 * Two rules govern everything here:
 *
 *   1. **State is seeded directly; behaviour is exercised over HTTP.** Creating
 *      an approved vendor through the real registration flow would require
 *      email OTP, plan selection and admin approval — none of which is under
 *      test in these suites. So accounts are written straight to the database,
 *      and then every action they take goes through the real API, including
 *      logging in. Seeding state is setup; seeding behaviour would be a mock.
 *
 *   2. **Documents are created through Mongoose models, never raw inserts.**
 *      All four account models hash passwords in a `pre('save')` hook, so a raw
 *      insert would store a plaintext password that no login could match.
 *
 * The world this builds is one hybrid vendor selling on all three channels,
 * which is the hardest case: it proves the experience dimension actually
 * separates catalogues rather than the suites passing because each vendor only
 * ever had one channel.
 */

import mongoose from 'mongoose';
import Admin from '../../../src/models/Admin.model.js';
import Vendor from '../../../src/models/Vendor.model.js';
import User from '../../../src/models/User.model.js';
import DeliveryBoy from '../../../src/models/DeliveryBoy.model.js';
import Category from '../../../src/models/Category.model.js';
import Product from '../../../src/models/Product.model.js';
import Settings from '../../../src/models/Settings.model.js';
import SubscriptionPlan from '../../../src/models/SubscriptionPlan.model.js';
import VendorSubscription from '../../../src/models/VendorSubscription.model.js';
import { EXPERIENCES } from '../../../src/constants/experiences.js';
import { PRESET_ROLES } from '../../../src/constants/permissions.js';

/**
 * Shared password for every seeded account.
 *
 * A constant is correct here and not a hardcoded secret: these accounts exist
 * only inside a disposable database that is truncated between suites. Making it
 * configurable would add a knob with no purpose.
 */
export const TEST_PASSWORD = 'HarnessPassw0rd!';

/**
 * Domain for every seeded account.
 *
 * Not `.test` (RFC 2606) — Joi's `email()` validates the TLD against the IANA
 * list, which excludes reserved TLDs, so `.test` addresses are rejected by the
 * real login validators before they ever reach a controller.
 */
export const TEST_EMAIL_DOMAIN = 'harness-test.com';

/** Bengaluru city centre — the anchor for every geospatial fixture. */
export const ORIGIN = { latitude: 12.9716, longitude: 77.5946 };

/**
 * Offset a coordinate by an approximate number of kilometres.
 * Latitude degrees are ~111km everywhere, which is accurate enough to place a
 * fixture inside or outside a service radius deterministically.
 */
export const offsetByKm = ({ latitude, longitude }, northKm = 0, eastKm = 0) => {
    const latDelta = northKm / 111;
    const lngDelta = eastKm / (111 * Math.cos((latitude * Math.PI) / 180));
    return { latitude: latitude + latDelta, longitude: longitude + lngDelta };
};

/** Always-open schedule: `open === close` selects the 24-hour branch. */
const ALWAYS_OPEN = Array.from({ length: 7 }, (_, day) => ({
    day,
    open: '00:00',
    close: '00:00',
    isClosed: false,
}));

const uniqueSuffix = () => new mongoose.Types.ObjectId().toString().slice(-8);

/**
 * Platform settings the Quick Commerce paths depend on.
 * Written explicitly so no suite depends on a code default silently matching.
 */
export const seedPlatformSettings = async ({ quickCommerceEnabled = true, wholesaleEnabled = true } = {}) => {
    await Settings.findOneAndUpdate(
        { key: 'features' },
        {
            key: 'features',
            value: {
                quickCommerceEnabled,
                wholesaleMarketplaceEnabled: wholesaleEnabled,
            },
        },
        { upsert: true, new: true }
    );

    await Settings.findOneAndUpdate(
        { key: 'quick_commerce' },
        {
            key: 'quick_commerce',
            value: {
                baseDeliveryFee: 25,
                perKmDeliveryFee: 8,
                freeDeliveryAboveSubtotal: 500,
                averageSpeedKmph: 20,
                vendorAckTimeoutSecs: 120,
            },
        },
        { upsert: true, new: true }
    );

    await Settings.findOneAndUpdate(
        { key: 'payment' },
        {
            key: 'payment',
            value: { codEnabled: true, cardEnabled: true, upiEnabled: true, walletEnabled: true },
        },
        { upsert: true, new: true }
    );
};

/** Full-access admin, able to exercise every permission-gated route. */
export const seedAdmin = async (overrides = {}) => {
    const email = overrides.email || `admin.${uniqueSuffix()}@harness-test.com`;
    const admin = new Admin({
        name: 'Harness Admin',
        email,
        password: TEST_PASSWORD,
        // 'superadmin' is the highest role in the Admin enum; there is no 'admin'.
        role: 'superadmin',
        status: 'active',
        isActive: true,
        permissions: PRESET_ROLES.full_access?.permissions || [],
        ...overrides,
    });
    await admin.save();
    return { document: admin, email, password: TEST_PASSWORD };
};

/**
 * A subadmin holding exactly the permissions given — the instrument for
 * proving that permission checks actually gate what they claim to.
 */
export const seedSubAdmin = async (permissions = [], overrides = {}) => {
    const email = overrides.email || `subadmin.${uniqueSuffix()}@harness-test.com`;
    const subAdmin = new Admin({
        name: 'Harness SubAdmin',
        email,
        password: TEST_PASSWORD,
        role: 'subadmin',
        status: 'active',
        isActive: true,
        permissions,
        ...overrides,
    });
    await subAdmin.save();
    return { document: subAdmin, email, password: TEST_PASSWORD };
};

export const seedCustomer = async (overrides = {}) => {
    const email = overrides.email || `customer.${uniqueSuffix()}@harness-test.com`;
    const user = new User({
        name: 'Harness Customer',
        email,
        password: TEST_PASSWORD,
        phone: '9876500001',
        isActive: true,
        isVerified: true,
        ...overrides,
    });
    await user.save();
    return { document: user, email, password: TEST_PASSWORD };
};


/**
 * An active subscription for a vendor.
 *
 * `checkSubscription` sits on every non-GET vendor route and rejects the
 * request when there is no active subscription with a future period end. A
 * vendor without one can log in and read, but cannot accept an order, update a
 * product, or do anything else the suites need — so this is not optional
 * decoration, it is what makes a seeded vendor able to act.
 */
export const seedVendorSubscription = async (vendorId) => {
    const plan = await SubscriptionPlan.findOneAndUpdate(
        { slug: 'harness-plan' },
        {
            name: 'Harness Plan',
            slug: 'harness-plan',
            price_inr: 0,
            price_usd: 0,
            interval: 'month',
            interval_count: 1,
            isActive: true,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const subscription = await VendorSubscription.create({
        vendor: vendorId,
        plan: plan._id,
        gateway: 'razorpay',
        gateway_subscription_id: `harness_sub_${uniqueSuffix()}`,
        status: 'active',
        current_period_end: periodEnd,
        latest_payment_status: 'paid',
    });

    return { plan, subscription };
};

/**
 * An approved vendor.
 *
 * `status: 'approved'` short-circuits the onboarding gate in vendor login, so
 * no subscription fixture is needed — verified against the real login guard
 * rather than assumed.
 */
export const seedVendor = async ({
    retail = true,
    wholesale = true,
    quickCommerce = true,
    location = ORIGIN,
    serviceRadiusKm = 5,
    preparationTimeMins = 10,
    availabilityStatus = 'open',
    minOrderValue = 0,
    packagingFee = 0,
    commissionRate = 10,
    ...overrides
} = {}) => {
    const email = overrides.email || `vendor.${uniqueSuffix()}@harness-test.com`;

    const vendor = new Vendor({
        name: 'Harness Vendor',
        email,
        password: TEST_PASSWORD,
        phone: '9876500002',
        storeName: `Harness Store ${uniqueSuffix()}`,
        status: 'approved',
        isVerified: true,
        isActive: true,
        commissionRate,
        shippingEnabled: true,
        defaultShippingRate: 50,
        freeShippingThreshold: 0,
        sellingChannels: {
            retail: { enabled: retail },
            wholesale: { enabled: wholesale },
            quickCommerce: { enabled: quickCommerce },
        },
        ...(quickCommerce
            ? {
                quickCommerceProfile: {
                    storeType: 'dark_store',
                    // GeoJSON is [longitude, latitude] — the reverse of how the
                    // fixture reads. Getting this backwards is the classic geo
                    // bug, so it is spelled out at every construction site.
                    location: {
                        type: 'Point',
                        coordinates: [location.longitude, location.latitude],
                    },
                    serviceRadiusKm,
                    preparationTimeMins,
                    availabilityStatus,
                    busyExtraMins: 10,
                    minOrderValue,
                    packagingFee,
                    businessHours: ALWAYS_OPEN,
                },
            }
            : {}),
        ...overrides,
    });

    await vendor.save();
    await seedVendorSubscription(vendor._id);
    return { document: vendor, email, password: TEST_PASSWORD, location };
};

/**
 * A delivery partner.
 *
 * `experiences` defaults to marketplace-only, matching the model default and
 * production reality. Quick Commerce riders must be requested explicitly, which
 * keeps the suites honest about what an out-of-the-box rider can actually do.
 */
export const seedRider = async ({
    experiences = [EXPERIENCES.MARKETPLACE],
    location = ORIGIN,
    withLocation = true,
    lastLocationAt = new Date(),
    ...overrides
} = {}) => {
    const email = overrides.email || `rider.${uniqueSuffix()}@harness-test.com`;

    const rider = new DeliveryBoy({
        name: 'Harness Rider',
        email,
        password: TEST_PASSWORD,
        phone: '9876500003',
        vehicleType: 'bike',
        vehicleNumber: `KA01AB${Math.floor(1000 + Math.random() * 9000)}`,
        applicationStatus: 'approved',
        isActive: true,
        isAvailable: true,
        status: 'available',
        experiences,
        activeOrderId: null,
        ...(withLocation
            ? {
                currentLocation: { lat: location.latitude, lng: location.longitude },
                location: {
                    type: 'Point',
                    coordinates: [location.longitude, location.latitude],
                },
                lastLocationAt,
            }
            : {}),
        ...overrides,
    });

    await rider.save();
    return { document: rider, email, password: TEST_PASSWORD, location };
};

export const seedCategory = async ({
    name = 'Harness Category',
    experience = EXPERIENCES.MARKETPLACE,
    parentId = null,
    ...overrides
} = {}) => {
    const category = new Category({
        name,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uniqueSuffix()}`,
        experience,
        parentId,
        isActive: true,
        ...overrides,
    });
    await category.save();
    return category;
};

/**
 * A product. Channel flags mirror the model defaults so a caller only states
 * what differs from an ordinary retail SKU.
 */
export const seedProduct = async ({
    vendorId,
    categoryId,
    name = 'Harness Product',
    price = 100,
    stockQuantity = 500,
    retailEnabled = true,
    wholesaleEnabled = false,
    wholesale = undefined,
    quickCommerceEnabled = false,
    quickCommerceCategoryId = undefined,
    quickCommerce = undefined,
    taxRate = 18,
    taxIncluded = false,
    ...overrides
} = {}) => {
    if (!vendorId) throw new Error('seedProduct requires vendorId.');
    if (!categoryId) throw new Error('seedProduct requires categoryId.');

    const product = new Product({
        name,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uniqueSuffix()}`,
        price,
        stockQuantity,
        stock: stockQuantity > 0 ? 'in_stock' : 'out_of_stock',
        lowStockThreshold: 5,
        categoryId,
        vendorId,
        isActive: true,
        isVisible: true,
        retailEnabled,
        wholesaleEnabled,
        ...(wholesale ? { wholesale } : {}),
        quickCommerceEnabled,
        ...(quickCommerceCategoryId ? { quickCommerceCategoryId } : {}),
        ...(quickCommerce ? { quickCommerce } : {}),
        taxRate,
        taxIncluded,
        ...overrides,
    });

    await product.save();
    return product;
};

/**
 * The standard world used by most suites.
 *
 * One hybrid vendor, one marketplace category tree, one Quick Commerce tree,
 * and one product per channel — plus a Quick Commerce rider, which must be
 * seeded directly because no API exists to enrol one. That absence is asserted
 * separately as a known gap; the fixture exists so the rest of the lifecycle is
 * still reachable and provably correct.
 */
export const seedStandardWorld = async () => {
    await seedPlatformSettings();

    const admin = await seedAdmin();
    const customer = await seedCustomer();
    const vendor = await seedVendor();

    const marketplaceCategory = await seedCategory({
        name: 'Harness Marketplace Category',
        experience: EXPERIENCES.MARKETPLACE,
    });
    const quickCategory = await seedCategory({
        name: 'Harness Quick Category',
        experience: EXPERIENCES.QUICK_COMMERCE,
    });

    const retailProduct = await seedProduct({
        vendorId: vendor.document._id,
        categoryId: marketplaceCategory._id,
        name: 'Harness Retail Product',
        price: 200,
    });

    const wholesaleProduct = await seedProduct({
        vendorId: vendor.document._id,
        categoryId: marketplaceCategory._id,
        name: 'Harness Wholesale Product',
        price: 1000,
        wholesaleEnabled: true,
        wholesale: {
            moqEnabled: true,
            moq: 10,
            priceTiers: [
                { minQty: 10, price: 900 },
                { minQty: 50, price: 800 },
            ],
        },
    });

    const quickProduct = await seedProduct({
        vendorId: vendor.document._id,
        categoryId: marketplaceCategory._id,
        name: 'Harness Quick Product',
        price: 150,
        quickCommerceEnabled: true,
        quickCommerceCategoryId: quickCategory._id,
        quickCommerce: { isPerishable: true, maxOrderQty: 5 },
    });

    // Marketplace-only by default; Quick Commerce enrolment is explicit.
    const marketplaceRider = await seedRider();
    const quickRider = await seedRider({
        experiences: [EXPERIENCES.MARKETPLACE, EXPERIENCES.QUICK_COMMERCE],
        location: offsetByKm(ORIGIN, 0.5, 0),
    });

    return {
        admin,
        customer,
        vendor,
        marketplaceRider,
        quickRider,
        categories: { marketplace: marketplaceCategory, quick: quickCategory },
        products: { retail: retailProduct, wholesale: wholesaleProduct, quick: quickProduct },
        location: ORIGIN,
    };
};

/** A shipping address that satisfies the checkout validator. */
export const shippingAddress = (overrides = {}) => ({
    name: 'Harness Customer',
    email: 'customer@harness-test.com',
    phone: '9876500001',
    address: '1 Harness Street',
    city: 'Bengaluru',
    state: 'Karnataka',
    zipCode: '560001',
    country: 'India',
    ...overrides,
});
