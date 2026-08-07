import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import Product from '../models/Product.model.js';
import Category from '../models/Category.model.js';
import Vendor from '../models/Vendor.model.js';
import Settings from '../models/Settings.model.js';
import { isQuickCommerceEnabled } from '../services/featureFlags.service.js';
import {
    findNearbyVendors,
    findVendorsByPincode,
    resolveVendorAvailability,
    pointToLatLng,
    haversineDistanceKm,
    calculateEta,
    calculateDeliveryFee,
} from '../services/quickCommerce.service.js';
import { resolvePriceForQuantity } from '../services/pricingEngine.service.js';
import { resolveVariantPrice } from '../services/variantPricing.service.js';
import { buildCatalogFilter } from '../services/catalogQuery.service.js';
import { EXPERIENCES } from '../constants/experiences.js';
import { LATITUDE_BOUNDS, LONGITUDE_BOUNDS } from '../constants/quickCommerce.js';

const router = Router();

/**
 * Quick Commerce discovery endpoints.
 *
 * Deliberately NOT cached: every response depends on the customer's exact
 * coordinates, so caching would either explode the key space or serve one
 * customer's serviceable stores to another. These queries are index-backed
 * (2dsphere) and cheap.
 */

/** Every route here is unreachable while the platform flag is off. */
const requireQuickCommerce = asyncHandler(async (req, res, next) => {
    if (!(await isQuickCommerceEnabled())) {
        throw new ApiError(404, 'Quick Commerce is not available.');
    }
    next();
});

router.use(requireQuickCommerce);

/** Parse and validate an optional coordinate pair from the query string. */
const readCoordinates = (query) => {
    const hasLat = query.lat !== undefined && query.lat !== '';
    const hasLng = query.lng !== undefined && query.lng !== '';
    if (!hasLat && !hasLng) return null;
    if (hasLat !== hasLng) {
        throw new ApiError(400, 'Both lat and lng are required.');
    }

    const latitude = Number(query.lat);
    const longitude = Number(query.lng);
    if (!Number.isFinite(latitude) || latitude < LATITUDE_BOUNDS.min || latitude > LATITUDE_BOUNDS.max) {
        throw new ApiError(400, 'Invalid latitude.');
    }
    if (!Number.isFinite(longitude) || longitude < LONGITUDE_BOUNDS.min || longitude > LONGITUDE_BOUNDS.max) {
        throw new ApiError(400, 'Invalid longitude.');
    }
    return { latitude, longitude };
};

/**
 * Resolve serviceable vendors from either coordinates or a pincode fallback.
 * @returns {Promise<{vendors: Array, method: 'coordinates'|'pincode'|null}>}
 */
const resolveServiceableVendors = async (query, { orderableOnly = false, limit = 50 } = {}) => {
    const coordinates = readCoordinates(query);
    if (coordinates) {
        return {
            vendors: await findNearbyVendors({ ...coordinates, limit, orderableOnly }),
            method: 'coordinates',
        };
    }

    const pincode = String(query.pincode ?? '').trim();
    if (pincode) {
        return {
            vendors: await findVendorsByPincode({ pincode, limit, orderableOnly }),
            method: 'pincode',
        };
    }

    return { vendors: [], method: null };
};

/**
 * Public shape for a Quick Commerce store.
 *
 * Allowlist by design: exact coordinates and serviced-pincode lists are never
 * exposed — publishing them would hand a competitor the full store network.
 * Distance is a scalar and safe.
 */
const toPublicQuickCommerceVendor = (vendor) => ({
    _id: vendor._id,
    id: vendor._id,
    storeName: vendor.storeName,
    storeLogo: vendor.storeLogo,
    storeDescription: vendor.storeDescription,
    rating: vendor.rating,
    reviewCount: vendor.reviewCount,
    isVerified: vendor.isVerified,
    distanceKm: vendor.distanceKm,
    storeType: vendor.quickCommerceProfile?.storeType || null,
    // Raw inputs for ETA; the ETA engine itself lands in a later phase.
    preparationTimeMins: vendor.quickCommerceProfile?.preparationTimeMins ?? null,
    minOrderValue: vendor.quickCommerceProfile?.minOrderValue ?? 0,
    packagingFee: vendor.quickCommerceProfile?.packagingFee ?? 0,
    availability: {
        status: vendor.availability?.status,
        isOrderable: vendor.availability?.isOrderable === true,
        reason: vendor.availability?.reason ?? null,
    },
});

// GET /api/quick/serviceability?lat&lng   |  ?pincode
router.get('/serviceability', asyncHandler(async (req, res) => {
    const { vendors, method } = await resolveServiceableVendors(req.query, { orderableOnly: false });

    if (!method) {
        throw new ApiError(400, 'Provide either lat and lng, or a pincode.');
    }

    const orderable = vendors.filter((vendor) => vendor.availability.isOrderable);
    const distances = vendors
        .map((vendor) => vendor.distanceKm)
        .filter((value) => Number.isFinite(value));

    res.status(200).json(new ApiResponse(200, {
        serviceable: vendors.length > 0,
        method,
        vendorCount: vendors.length,
        orderableVendorCount: orderable.length,
        nearestDistanceKm: distances.length ? Math.min(...distances) : null,
    }, vendors.length > 0
        ? 'Quick Commerce is available at this location.'
        : 'Quick Commerce is not available at this location yet.'));
}));

// GET /api/quick/vendors/nearby?lat&lng | ?pincode
router.get('/vendors/nearby', asyncHandler(async (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 50));
    const { vendors, method } = await resolveServiceableVendors(req.query, { limit });

    if (!method) {
        throw new ApiError(400, 'Provide either lat and lng, or a pincode.');
    }

    res.status(200).json(new ApiResponse(200, {
        vendors: vendors.map(toPublicQuickCommerceVendor),
        total: vendors.length,
        method,
    }, 'Nearby stores fetched.'));
}));

/**
 * GET /api/quick/categories/feed
 *
 * Category-first home surface. Returns Quick Commerce root categories with a
 * live product count restricted to stores that can actually deliver here, so a
 * customer never taps a category that turns out to be empty for them.
 */
router.get('/categories/feed', asyncHandler(async (req, res) => {
    const { vendors, method } = await resolveServiceableVendors(req.query, { orderableOnly: false });

    const categories = await Category.find({
        supportedExperiences: EXPERIENCES.QUICK_COMMERCE,
        isActive: true,
        parentId: null,
    })
        .sort({ displayOrder: 1, order: 1, name: 1 })
        .lean();

    // Without a location we can still render the taxonomy, just without counts.
    if (!method || vendors.length === 0) {
        return res.status(200).json(new ApiResponse(200, {
            categories: categories.map((category) => ({ ...category, productCount: 0 })),
            serviceable: false,
            vendorCount: 0,
        }, 'Quick Commerce categories fetched.'));
    }

    const vendorIds = vendors.map((vendor) => vendor._id);
    const rootIds = categories.map((category) => category._id);

    // Children roll their counts up into their root.
    const children = await Category.find({
        supportedExperiences: EXPERIENCES.QUICK_COMMERCE,
        isActive: true,
        parentId: { $in: rootIds },
    })
        .select('_id parentId')
        .lean();

    const rootByCategoryId = new Map();
    rootIds.forEach((id) => rootByCategoryId.set(String(id), String(id)));
    children.forEach((child) => rootByCategoryId.set(String(child._id), String(child.parentId)));

    const counts = await Product.aggregate([
        {
            $match: buildCatalogFilter({
                experience: EXPERIENCES.QUICK_COMMERCE,
                vendorIds,
                categoryIds: [...rootByCategoryId.keys()].map((id) => id),
            }),
        },
        { $group: { _id: '$quickCommerceCategoryId', count: { $sum: 1 } } },
    ]);

    const countByRoot = new Map();
    counts.forEach((row) => {
        const rootId = rootByCategoryId.get(String(row._id));
        if (!rootId) return;
        countByRoot.set(rootId, (countByRoot.get(rootId) || 0) + row.count);
    });

    res.status(200).json(new ApiResponse(200, {
        categories: categories.map((category) => ({
            ...category,
            productCount: countByRoot.get(String(category._id)) || 0,
        })),
        serviceable: true,
        vendorCount: vendors.length,
    }, 'Quick Commerce categories fetched.'));
}));

/**
 * POST /api/quick/checkout/estimate
 *
 * Delivery fee, packaging fee and ETA for a Quick Commerce cart, computed with
 * the SAME service functions `placeOrder` uses.
 *
 * This exists so the checkout screen never displays a total the customer is not
 * charged: the fees are distance- and store-dependent, so the client cannot
 * derive them and must not guess. Sibling of `POST /api/shipping/estimate`,
 * which plays the same role for the Marketplace.
 *
 * Blocking conditions (store closed, out of range, below minimum order) are
 * returned as data rather than thrown, so the UI can explain them in place
 * instead of showing an error toast on a screen the customer is still filling.
 * `placeOrder` re-validates every one of them and remains authoritative.
 */
router.post('/checkout/estimate', asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const couponType = req.body?.couponType || null;

    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new ApiError(400, 'A delivery location is required.');
    }

    const notAvailable = (reason, message) => res.status(200).json(new ApiResponse(200, {
        available: false,
        reason,
        deliveryFee: 0,
        packagingFee: 0,
        eta: null,
        distanceKm: null,
        minOrderValue: 0,
        minOrderShortfall: 0,
        vendor: null,
    }, message));

    const productIds = items
        .map((item) => String(item?.productId || '').trim())
        .filter((id) => /^[a-fA-F0-9]{24}$/.test(id));
    if (!productIds.length) {
        return notAvailable('EMPTY_CART', 'No items to estimate.');
    }

    const products = await Product.find({
        _id: { $in: productIds },
        isActive: true,
        quickCommerceEnabled: true,
    })
        .select('_id vendorId price variants.prices retailEnabled wholesaleEnabled wholesale')
        .lean();

    const productMap = new Map(products.map((product) => [String(product._id), product]));

    // A Quick Commerce cart is pinned to one store, so the estimate is too.
    let vendorId = null;
    let subtotal = 0;
    for (const item of items) {
        const product = productMap.get(String(item?.productId || ''));
        if (!product?.vendorId) continue;

        const lineVendorId = String(product.vendorId);
        if (vendorId && lineVendorId !== vendorId) {
            return notAvailable('MULTI_VENDOR', 'Quick Commerce orders must be placed with a single store.');
        }
        vendorId = lineVendorId;

        const quantity = Math.max(1, Number(item?.quantity || 1));
        const variantResolvedPrice = Math.max(0, Number(resolveVariantPrice(product, item?.variant) || 0));
        // Quick Commerce is retail-only, but route through the same pricing
        // engine so any future channel rule applies here automatically.
        const pricing = resolvePriceForQuantity(product, variantResolvedPrice, quantity, {
            vendorWholesaleEnabled: false,
        });
        subtotal += pricing.unitPrice * quantity;
    }

    if (!vendorId) {
        return notAvailable('NO_QUICK_COMMERCE_ITEMS', 'No Quick Commerce items to estimate.');
    }

    const vendor = await Vendor.findById(vendorId)
        .select('storeName sellingChannels quickCommerceProfile')
        .lean();
    if (!vendor?._id || vendor.sellingChannels?.quickCommerce?.enabled !== true) {
        return notAvailable('VENDOR_UNAVAILABLE', 'This store is no longer available on Quick Commerce.');
    }

    const availability = resolveVendorAvailability(vendor);
    if (!availability.isOrderable) {
        return notAvailable('VENDOR_NOT_ORDERABLE', `${vendor.storeName} is not accepting orders right now.`);
    }

    const vendorPoint = pointToLatLng(vendor.quickCommerceProfile?.location) || { latitude: 28.6139, longitude: 77.2090 };
    const distanceKm = haversineDistanceKm(vendorPoint, { latitude, longitude });
    const isDevMode = process.env.NODE_ENV !== 'production' || process.env.DISABLE_GEO_FENCING === 'true';
    const radiusKm = isDevMode ? 10000 : (Number(vendor.quickCommerceProfile?.serviceRadiusKm) || 25);
    if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) {
        return notAvailable('OUT_OF_DELIVERY_RANGE', `${vendor.storeName} does not deliver to your location.`);
    }

    const settingsDoc = await Settings.findOne({ key: 'quick_commerce' }).lean();
    const qcSettings = settingsDoc?.value || {};
    const profile = vendor.quickCommerceProfile || {};

    const deliveryFee = couponType === 'freeship'
        ? 0
        : calculateDeliveryFee({
            distanceKm,
            baseFee: qcSettings.baseDeliveryFee,
            perKmFee: qcSettings.perKmDeliveryFee,
            freeAboveSubtotal: qcSettings.freeDeliveryAboveSubtotal,
            subtotal,
        });

    const packagingFee = Number(profile.packagingFee) || 0;
    const minOrderValue = Number(profile.minOrderValue) || 0;

    const eta = calculateEta({
        preparationTimeMins: profile.preparationTimeMins,
        extraPrepMins: availability.extraPrepMins,
        distanceKm,
        averageSpeedKmph: qcSettings.averageSpeedKmph,
    });

    res.status(200).json(new ApiResponse(200, {
        available: true,
        reason: null,
        deliveryFee,
        packagingFee,
        eta,
        distanceKm: Number(distanceKm.toFixed(2)),
        minOrderValue,
        minOrderShortfall: minOrderValue > 0 && subtotal < minOrderValue
            ? Number((minOrderValue - subtotal).toFixed(2))
            : 0,
        vendor: {
            id: String(vendor._id),
            storeName: vendor.storeName,
        },
    }, 'Quick Commerce checkout estimate calculated.'));
}));

export default router;
