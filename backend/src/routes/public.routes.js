import { Router } from 'express';
import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import Product from '../models/Product.model.js';
import Category from '../models/Category.model.js';
import Brand from '../models/Brand.model.js';
import Vendor from '../models/Vendor.model.js';
import Coupon from '../models/Coupon.model.js';
import Banner from '../models/Banner.model.js';
import Campaign from '../models/Campaign.model.js';
import Testimonial from '../models/Testimonial.model.js';
import SubscriptionPlan from '../models/SubscriptionPlan.model.js';
import Settings from '../models/Settings.model.js';
import Feedback from '../models/Feedback.model.js';
import Notification from '../models/Notification.model.js';
import { calculateVendorShippingForGroups } from '../services/vendorShipping.service.js';
import { resolvePriceForQuantity } from '../services/pricingEngine.service.js';
import { resolveVariantPrice } from '../services/variantPricing.service.js';
import { getRequestExperience, normalizeExperience, EXPERIENCES } from '../constants/experiences.js';
import { buildCatalogFilter } from '../services/catalogQuery.service.js';
import { findNearbyVendors, findVendorsByPincode } from '../services/quickCommerce.service.js';
import { isWholesaleMarketplaceEnabled, isQuickCommerceEnabled } from '../services/featureFlags.service.js';

/**
 * Resolve which vendors can serve this customer, for Quick Commerce listings.
 *
 * Returns an array (possibly empty) whenever a location hint is present, and
 * `undefined` when none is — letting the caller distinguish "nothing reaches
 * you" from "you haven't told us where you are".
 */
const resolveQuickCommerceVendorIds = async (query) => {
    const latitude = Number(query?.lat);
    const longitude = Number(query?.lng);
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

    if (hasCoordinates) {
        const vendors = await findNearbyVendors({ latitude, longitude, limit: 100 });
        return vendors.map((vendor) => vendor._id);
    }

    const pincode = String(query?.pincode ?? '').trim();
    if (pincode) {
        const vendors = await findVendorsByPincode({ pincode, limit: 100 });
        return vendors.map((vendor) => vendor._id);
    }

    return undefined;
};
import { serializePlan } from '../services/billing/plan.service.js';
import { cacheResponse } from '../middlewares/responseCache.js';
import { sendEmail } from '../services/email.service.js';

import { getPublicGeneralSettings, getPublicSettingsByCategory } from '../modules/admin/controllers/settings.controller.js';

const router = Router();
const listCache = cacheResponse({ ttlSeconds: 30, maxEntries: 1000 });

// Public Settings (Storefront identity, features, and reviews)
router.get('/settings/general', getPublicGeneralSettings);
// Allowlisted public reader. Must NOT be the admin controller — sharing one
// handler between a public and an admin route made every settings category,
// including payment configuration, world-readable.
router.get('/settings/:category', getPublicSettingsByCategory);
const detailCache = cacheResponse({ ttlSeconds: 60, maxEntries: 1000 });
const catalogCache = cacheResponse({ ttlSeconds: 300, maxEntries: 200 });
const marketingCache = cacheResponse({ ttlSeconds: 30, maxEntries: 300 });
const PRODUCT_LIST_SELECT = '-faqs -relatedProducts -__v';
const EXCLUSIVE_SALE_CAMPAIGN_TYPES = ['flash_sale', 'daily_deal', 'special_offer', 'festival'];

const toPublicVendor = (vendorDoc) => {
    const vendor = typeof vendorDoc?.toObject === 'function'
        ? vendorDoc.toObject()
        : (vendorDoc || {});

    const id = String(vendor.id || vendor._id || '');
    const storeName = vendor.storeName || vendor.name || 'Store';
    const storeLogo = vendor.storeLogo || vendor.logo || vendor.image || vendor.profileImage || '';
    const profileImage = vendor.profileImage || vendor.image || storeLogo || '';
    const rating = Number(vendor.rating) || 0;
    const reviewCount = Number(vendor.reviewCount) || 0;
    const followersCount = Number(vendor.followersCount || vendor.followers) || 0;
    const isVerified = !!vendor.isVerified;

    let location = '';
    if (vendor.address?.city && vendor.address?.state) {
        location = `${vendor.address.city}, ${vendor.address.state}`;
    } else if (vendor.address?.city) {
        location = vendor.address.city;
    } else if (vendor.address?.state) {
        location = vendor.address.state;
    } else if (vendor.country) {
        location = vendor.country;
    }

    const bestSellerScore = Math.round((Number(vendor.bestSellerScore) || 0) * 10) / 10;

    return {
        _id: id,
        id,
        name: vendor.name || storeName,
        storeName,
        slug: vendor.slug || id,
        storeLogo,
        profileImage,
        logo: storeLogo,
        storeDescription: vendor.storeDescription || '',
        isVerified,
        rating,
        reviewCount,
        followersCount,
        followers: followersCount,
        bestSellerScore,
        totalSales: Number(vendor.totalSales) || 0,
        address: vendor.address || {},
        location,
        createdAt: vendor.createdAt || vendor.joinDate || new Date().toISOString(),
        status: vendor.status || 'approved',
        totalProducts: vendor.totalProducts || 0,
        sellingChannels: {
            retail: { enabled: vendor?.sellingChannels?.retail?.enabled !== false },
            wholesale: { enabled: vendor?.sellingChannels?.wholesale?.enabled === true },
        },
    };
};

const activeCampaignWindowQuery = (now = new Date()) => {
    // Be more inclusive: check if it's within the day
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    return {
        isActive: true,
        $and: [
            { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: endOfToday } }] },
            { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: startOfToday } }] }
        ]
    };
};

const collectCampaignProductIds = (campaigns = []) => {
    const idSet = new Set();
    campaigns.forEach((campaign) => {
        const ids = Array.isArray(campaign?.productIds) ? campaign.productIds : [];
        ids.forEach((value) => {
            const normalized = String(value || '').trim();
            if (/^[a-fA-F0-9]{24}$/.test(normalized)) {
                idSet.add(normalized);
            }
        });
    });
    return [...idSet];
};

const getActiveSaleProductIds = async (type = null) => {
    const now = new Date();
    const query = {
        ...activeCampaignWindowQuery(now),
        type: type
            ? String(type || '').trim()
            : { $in: EXCLUSIVE_SALE_CAMPAIGN_TYPES },
    };

    const campaigns = await Campaign.find(query)
        .select('productIds')
        .lean();

    return collectCampaignProductIds(campaigns);
};

// GET /api/products — list with filters
const listProducts = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 12,
        category,
        brand,
        vendor,
        search,
        q,
        sort = 'newest',
        flashSale,
        isNewArrival,
        minPrice,
        maxPrice,
        minRating,
        sellingChannel,
        bulkDiscount,
        hasMoq,
    } = req.query;
    const numericPage = Math.max(Number(page) || 1, 1);
    const numericLimit = Math.min(Math.max(Number(limit) || 12, 1), 100);
    const skip = (numericPage - 1) * numericLimit;

    // Resolve the category subtree before building the filter, so the builder
    // can place the ids on whichever category field the experience uses.
    let categoryIds;
    if (category) {
        const rawCategory = String(category).trim();
        let targetId = mongoose.Types.ObjectId.isValid(rawCategory) ? rawCategory : null;
        if (!targetId) {
            const matchedCategory = await Category.findOne({
                $or: [
                    { slug: rawCategory },
                    { id: rawCategory },
                    { name: new RegExp(`^${rawCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                ],
            }).select('_id').lean();
            if (matchedCategory) targetId = String(matchedCategory._id);
        }

        if (targetId) {
            const childCategories = await Category.find({ parentId: targetId }).select('_id').lean();
            categoryIds = [targetId, ...childCategories.map((cat) => String(cat._id))];
        } else {
            categoryIds = [];
        }
    }

    const requestExperience = getRequestExperience(req);

    // Quick Commerce results must only include stores that can actually deliver
    // to this customer. Resolving the serviceable vendor set here (rather than
    // filtering after the fact) means an out-of-range store can never leak into
    // a listing. An empty array is a valid answer meaning "nothing reaches you".
    let serviceableVendorIds;
    if (requestExperience === EXPERIENCES.QUICK_COMMERCE) {
        serviceableVendorIds = await resolveQuickCommerceVendorIds(req.query);
        // When location hint is missing or unserviceable fallback to active verified vendors
        // so customers can still browse Express items catalog cleanly.
        if (serviceableVendorIds === undefined || (Array.isArray(serviceableVendorIds) && serviceableVendorIds.length === 0)) {
            const allQcVendors = await Vendor.find({ isVerified: true }).select('_id').lean();
            serviceableVendorIds = allQcVendors.map((v) => String(v._id));
        }
    }

    const wholesaleEnabled = await isWholesaleMarketplaceEnabled();

    // All catalog reads go through the shared builder — it owns the experience
    // flag and the correct category field (see catalogQuery.service.js).
    const filter = buildCatalogFilter({
        experience: requestExperience,
        categoryIds,
        vendorIds: serviceableVendorIds,
        wholesaleMarketplaceEnabled: wholesaleEnabled,
    });

    if (brand) {
        const rawBrand = String(brand).trim();
        if (mongoose.Types.ObjectId.isValid(rawBrand)) {
            filter.brandId = rawBrand;
        } else {
            const matchedBrand = await Brand.findOne({
                $or: [
                    { slug: rawBrand },
                    { id: rawBrand },
                    { name: new RegExp(`^${rawBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                ],
            }).select('_id').lean();
            filter.brandId = matchedBrand ? String(matchedBrand._id) : null;
        }
    }

    // An explicit vendor filter must still respect serviceability.
    if (vendor) {
        const rawVendor = String(vendor).trim();
        const vendorId = mongoose.Types.ObjectId.isValid(rawVendor) ? rawVendor : null;
        if (!vendorId) {
            filter.vendorId = null;
        } else if (Array.isArray(serviceableVendorIds)
            && !serviceableVendorIds.some((id) => String(id) === String(vendorId))) {
            filter.vendorId = { $in: [] };
        } else {
            filter.vendorId = vendorId;
        }
    }
    if (flashSale === 'true') filter.flashSale = true;
    if (isNewArrival === 'true') filter.isNewArrival = true;
    if (minPrice || maxPrice) filter.price = { ...(minPrice && { $gte: Number(minPrice) }), ...(maxPrice && { $lte: Number(maxPrice) }) };
    if (minRating) filter.rating = { $gte: Number(minRating) };
    // Wholesale facets are Marketplace-only concepts; applying them inside
    // Quick Commerce would silently contradict the experience filter.
    if (getRequestExperience(req) === EXPERIENCES.MARKETPLACE) {
        if (!wholesaleEnabled) {
            // When wholesale feature flag is OFF, wholesale facet searches return no results
            if (sellingChannel === 'wholesale' || bulkDiscount === 'true' || hasMoq === 'true') {
                filter._id = { $in: [] };
            }
        } else {
            // Legacy products have no wholesale fields, so "retail" matches anything
            // not explicitly wholesale-only.
            if (sellingChannel === 'wholesale') {
                filter.wholesaleEnabled = true;
            } else if (sellingChannel === 'retail') {
                filter.retailEnabled = { $ne: false };
            }
            if (bulkDiscount === 'true') {
                filter.wholesaleEnabled = true;
                filter['wholesale.priceTiers.0'] = { $exists: true };
            }
            if (hasMoq === 'true') {
                filter.wholesaleEnabled = true;
                filter['wholesale.moqEnabled'] = true;
            }
        }
    }
    const searchQuery = String(search || q || '').trim();
    if (searchQuery) {
        const safeRegex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
            { name: safeRegex },
            { tags: safeRegex }
        ];
    }

    const activeSaleProductIds = await getActiveSaleProductIds();
    if (activeSaleProductIds.length) {
        filter._id = { $nin: activeSaleProductIds };
    }

    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, 'price-asc': { price: 1 }, 'price-desc': { price: -1 }, popular: { reviewCount: -1 }, rating: { rating: -1 } };

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select(PRODUCT_LIST_SELECT)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .sort(sortMap[sort] || { createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
    ]);

    const pages = Math.max(1, Math.ceil(total / numericLimit));

    res.status(200).json(new ApiResponse(200, { products, total, page: numericPage, limit: numericLimit, pages }, 'Products fetched.'));
});

router.get('/', listCache, listProducts);
router.get('/products', listCache, listProducts);

// GET /api/products/flash-sale
router.get('/flash-sale', marketingCache, asyncHandler(async (req, res) => {
    const flashSaleProductIds = await getActiveSaleProductIds('flash_sale');
    
    const filter = {
        isActive: true,
        $or: [
            { flashSale: true }
        ]
    };
    
    if (flashSaleProductIds.length > 0) {
        filter.$or.push({ _id: { $in: flashSaleProductIds } });
    }

    const products = await Product.find(filter)
        .select(PRODUCT_LIST_SELECT)
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
        
    res.status(200).json(new ApiResponse(200, products, 'Flash sale products.'));
}));

// GET /api/products/new-arrivals
router.get('/new-arrivals', listCache, asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        sort = 'newest',
        search,
        q,
        minPrice,
        maxPrice,
        minRating,
    } = req.query;

    const numericPage = Math.max(Number(page) || 1, 1);
    const numericLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { isActive: true, isNewArrival: true };
    const searchQuery = String(search || q || '').trim();
    if (searchQuery) {
        const safeRegex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
            { name: safeRegex },
            { tags: safeRegex }
        ];
    }
    if (minPrice || maxPrice) {
        filter.price = {
            ...(minPrice ? { $gte: Number(minPrice) } : {}),
            ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
        };
    }
    if (minRating) {
        filter.rating = { $gte: Number(minRating) };
    }

    const activeSaleProductIds = await getActiveSaleProductIds();
    if (activeSaleProductIds.length) {
        filter._id = { $nin: activeSaleProductIds };
    }

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'price-asc': { price: 1 },
        'price-desc': { price: -1 },
        popular: { reviewCount: -1 },
        rating: { rating: -1 },
    };

    let [products, total] = await Promise.all([
        Product.find(filter)
            .select(PRODUCT_LIST_SELECT)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .sort(sortMap[sort] || sortMap.newest)
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
    ]);

    // If explicit isNewArrival count is low, backfill with recent active products
    if (products.length < numericLimit && numericPage === 1) {
        const existingIds = new Set(products.map((p) => String(p._id)));
        const fallbackFilter = { isActive: true };
        if (activeSaleProductIds.length) {
            fallbackFilter._id = { $nin: [...activeSaleProductIds, ...Array.from(existingIds)] };
        } else {
            fallbackFilter._id = { $nin: Array.from(existingIds) };
        }
        const needed = numericLimit - products.length;
        const fallbackProducts = await Product.find(fallbackFilter)
            .select(PRODUCT_LIST_SELECT)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .sort({ createdAt: -1 })
            .limit(needed)
            .lean();

        products = [...products, ...fallbackProducts];
        const totalActive = await Product.countDocuments({ isActive: true });
        total = Math.max(total, totalActive);
    }

    res.status(200).json(new ApiResponse(200, {
        products,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit) || 1,
    }, 'New arrivals fetched.'));
}));

// GET /api/products/popular
router.get('/popular', marketingCache, asyncHandler(async (req, res) => {
    const activeSaleProductIds = await getActiveSaleProductIds();
    const filter = { isActive: true };
    if (activeSaleProductIds.length) {
        filter._id = { $nin: activeSaleProductIds };
    }

    const products = await Product.find(filter)
        .select(PRODUCT_LIST_SELECT)
        .sort({ reviewCount: -1, rating: -1, createdAt: -1 })
        .limit(10)
        .lean();
    res.status(200).json(new ApiResponse(200, products, 'Popular products.'));
}));

// GET /api/products/similar/:id
router.get('/similar/:id', detailCache, asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).select('_id categoryId').lean();
    if (!product) throw new ApiError(404, 'Product not found.');
    const activeSaleProductIds = await getActiveSaleProductIds();
    const similarFilter = { isActive: true, _id: { $ne: product._id }, categoryId: product.categoryId };
    if (activeSaleProductIds.length) {
        similarFilter._id = { $nin: [String(product._id), ...activeSaleProductIds] };
    }
    const similar = await Product.find(similarFilter)
        .select(PRODUCT_LIST_SELECT)
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();
    res.status(200).json(new ApiResponse(200, similar, 'Similar products.'));
}));

const getProductDetail = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName storeLogo rating')
        .lean();
    if (!product) throw new ApiError(404, 'Product not found.');

    const wholesaleEnabled = await isWholesaleMarketplaceEnabled();
    if (!wholesaleEnabled) {
        if (product.retailEnabled === false && product.wholesaleEnabled === true) {
            throw new ApiError(404, 'Product not found.');
        }
        product.wholesaleEnabled = false;
    }

    res.status(200).json(new ApiResponse(200, product, 'Product detail.'));
});

// GET /api/products/:id
router.get('/products/:id', detailCache, getProductDetail);


/**
 * Shared category handler for GET /api/categories and GET /api/categories/all.
 * Filters by experience query parameter (?experience=quick_commerce|marketplace|wholesale)
 * and respects platform feature flags.
 */
const getPublicCategoriesHandler = asyncHandler(async (req, res) => {
    const rawExp = req.query?.experience || req.headers['x-experience'];
    const exp = rawExp ? normalizeExperience(rawExp) : getRequestExperience(req);

    // Feature flag enforcement
    if (exp === EXPERIENCES.QUICK_COMMERCE) {
        const qcOn = await isQuickCommerceEnabled();
        if (!qcOn) {
            return res.status(200).json(new ApiResponse(200, [], 'Quick Commerce is disabled.'));
        }
    } else if (exp === EXPERIENCES.WHOLESALE) {
        const wholesaleOn = await isWholesaleMarketplaceEnabled();
        if (!wholesaleOn) {
            return res.status(200).json(new ApiResponse(200, [], 'Wholesale Marketplace is disabled.'));
        }
    }

    const filter = { isActive: true, supportedExperiences: exp };

    const categories = await Category.find(filter)
        .sort({ displayOrder: 1, order: 1, name: 1 })
        .lean();

    // Compute product counts filtered by experience
    let categoryMatch = { isActive: true };
    const categoryIdField = exp === EXPERIENCES.QUICK_COMMERCE ? '$quickCommerceCategoryId' : '$categoryId';

    if (exp === EXPERIENCES.QUICK_COMMERCE) {
        categoryMatch.quickCommerceEnabled = true;
    } else if (exp === EXPERIENCES.WHOLESALE) {
        categoryMatch.wholesaleEnabled = true;
    } else {
        categoryMatch.retailEnabled = { $ne: false };
    }

    const productCounts = await Product.aggregate([
        { $match: categoryMatch },
        { $group: { _id: categoryIdField, count: { $sum: 1 } } },
    ]);

    const countMap = new Map();
    productCounts.forEach((pc) => {
        if (pc._id) countMap.set(String(pc._id), pc.count);
    });

    const normalized = categories.map((cat) => ({
        ...cat,
        id: cat._id,
        experience: Array.isArray(cat.supportedExperiences) && cat.supportedExperiences.length > 0 ? cat.supportedExperiences[0] : EXPERIENCES.MARKETPLACE,
        productCount: countMap.get(String(cat._id)) || 0,
    }));

    res.status(200).json(new ApiResponse(200, normalized, 'Categories fetched.'));
});

// GET /api/categories & GET /api/categories/all (public)
router.get('/categories', catalogCache, getPublicCategoriesHandler);
router.get('/categories/all', catalogCache, getPublicCategoriesHandler);

// GET /api/brands (public)
router.get('/brands/all', catalogCache, asyncHandler(async (req, res) => {
    const brands = await Brand.find({ isActive: true }).sort({ name: 1 }).lean();
    res.status(200).json(new ApiResponse(200, brands, 'Brands fetched.'));
}));

const getVendorProductCountsMap = async (vendorIds = []) => {
    if (!vendorIds || vendorIds.length === 0) return new Map();
    const validObjectIds = vendorIds
        .map(id => {
            try {
                return new mongoose.Types.ObjectId(String(id));
            } catch {
                return null;
            }
        })
        .filter(Boolean);

    if (validObjectIds.length === 0) return new Map();

    const counts = await Product.aggregate([
        {
            $match: {
                vendorId: { $in: validObjectIds },
                isApproved: true,
                status: 'published',
                isActive: { $ne: false },
                isDeleted: { $ne: true },
            }
        },
        {
            $group: {
                _id: '$vendorId',
                count: { $sum: 1 }
            }
        }
    ]);
    const map = new Map();
    counts.forEach(item => map.set(String(item._id), item.count));
    return map;
};

const PUBLIC_TEST_VENDOR_REGEX = /test|sptest|qwerty|qa\s|audit|seeded|demo|dummy|sample|free\s*vendor|^sk\s*store|^sagar\s*store/i;

// GET /api/vendors/best-sellers (public - top 8 cached home endpoint)
router.get('/vendors/best-sellers', marketingCache, asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 20);
    const filter = {
        status: 'approved',
        isActive: { $ne: false },
        isDeleted: { $ne: true },
        storeName: { $not: PUBLIC_TEST_VENDOR_REGEX },
        name: { $not: PUBLIC_TEST_VENDOR_REGEX },
    };

    const vendors = await Vendor.find(filter)
        .select('name storeName slug storeLogo profileImage isVerified rating reviewCount totalSales bestSellerScore followersCount address createdAt')
        .sort({ bestSellerScore: -1, rating: -1, reviewCount: -1, createdAt: -1 })
        .limit(limit)
        .lean();

    const vendorIds = vendors.map(v => v._id);
    const countsMap = await getVendorProductCountsMap(vendorIds);

    const formattedVendors = vendors.map(v => {
        const productCount = countsMap.get(String(v._id)) || 0;
        return {
            ...toPublicVendor(v),
            productCount,
            totalProducts: productCount,
        };
    });

    res.status(200).json(new ApiResponse(200, {
        vendors: formattedVendors
    }, 'Top best-selling vendors fetched successfully.'));
}));

// GET /api/vendors and GET /api/vendors/all (public - searchable & filterable listing)
const handleGetVendors = asyncHandler(async (req, res) => {
    const {
        status = 'approved',
        page = 1,
        limit = 12,
        search,
        minRating,
        isVerified,
        hasProducts,
        city,
        state,
        sort = 'best_selling'
    } = req.query;

    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 100);
    const skip = (numericPage - 1) * numericLimit;

    // Enforce approved, active, not-deleted, non-test vendors only for public listing
    const filter = {
        status: status && status !== 'all' ? status : 'approved',
        isActive: { $ne: false },
        isDeleted: { $ne: true }
    };

    if (!search) {
        filter.storeName = { $not: PUBLIC_TEST_VENDOR_REGEX };
        filter.name = { $not: PUBLIC_TEST_VENDOR_REGEX };
    }

    const trimmedSearch = String(search || '').trim();
    if (trimmedSearch) {
        const safeRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
            { storeName: safeRegex },
            { name: safeRegex },
            { slug: safeRegex },
            { email: safeRegex }
        ];
    }

    if (minRating) {
        const parsedRating = parseFloat(minRating);
        if (!isNaN(parsedRating)) {
            filter.rating = { $gte: parsedRating };
        }
    }

    if (isVerified === 'true' || isVerified === true) {
        filter.isVerified = true;
    }

    if (city) {
        filter['address.city'] = new RegExp(String(city).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    if (state) {
        filter['address.state'] = new RegExp(String(state).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    // Sorting logic
    let sortOptions = { bestSellerScore: -1, rating: -1, createdAt: -1 };
    if (sort === 'highest_rated' || sort === 'highest-rated') {
        sortOptions = { rating: -1, reviewCount: -1, createdAt: -1 };
    } else if (sort === 'newest') {
        sortOptions = { createdAt: -1 };
    } else if (sort === 'a-z' || sort === 'name_asc') {
        sortOptions = { storeName: 1, name: 1 };
    } else if (sort === 'most_products' || sort === 'most-products') {
        sortOptions = { bestSellerScore: -1, reviewCount: -1 };
    }

    let [vendors, total] = await Promise.all([
        Vendor.find(filter)
            .select('-password -otp -otpExpiry -bankDetails -commissionRate')
            .sort(sortOptions)
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Vendor.countDocuments(filter)
    ]);

    const vendorIds = vendors.map(v => v._id);
    const countsMap = await getVendorProductCountsMap(vendorIds);

    let formattedVendors = vendors.map(v => {
        const productCount = countsMap.get(String(v._id)) || 0;
        return {
            ...toPublicVendor(v),
            productCount,
            totalProducts: productCount
        };
    });

    if (hasProducts === 'true' || hasProducts === true) {
        formattedVendors = formattedVendors.filter(v => v.productCount > 0);
    }

    if (sort === 'most_products' || sort === 'most-products') {
        formattedVendors.sort((a, b) => b.productCount - a.productCount);
    }

    const totalPages = Math.ceil(total / numericLimit) || 1;
    const hasNext = numericPage < totalPages;
    const hasPrev = numericPage > 1;

    res.status(200).json(new ApiResponse(200, {
        vendors: formattedVendors,
        pagination: {
            page: numericPage,
            limit: numericLimit,
            pages: totalPages,
            total,
            hasNext,
            hasPrev,
            nextPage: hasNext ? numericPage + 1 : null,
            prevPage: hasPrev ? numericPage - 1 : null,
        }
    }, 'Vendors fetched successfully.'));
});

router.get('/vendors', handleGetVendors);
router.get('/vendors/all', handleGetVendors);

// GET /api/vendors/:id (public)
router.get('/vendors/:id', detailCache, asyncHandler(async (req, res) => {
    const vendor = await Vendor.findOne({
        _id: req.params.id,
        status: 'approved',
    }).select('-password -otp -otpExpiry').lean();
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    res.status(200).json(new ApiResponse(200, toPublicVendor(vendor), 'Vendor detail fetched.'));
}));

// GET /api/vendors/:id/products (public)
router.get('/vendors/:id/products', listCache, asyncHandler(async (req, res) => {
    const { page = 1, limit = 12, sort = 'newest', minPrice, maxPrice, minRating } = req.query;
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 100);
    const skip = (numericPage - 1) * numericLimit;

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'price-asc': { price: 1 },
        'price-desc': { price: -1 },
        popular: { reviewCount: -1 },
        rating: { rating: -1 },
    };

    const vendor = await Vendor.findOne({
        _id: req.params.id,
        status: 'approved',
    }).select('_id').lean();
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const activeSaleProductIds = await getActiveSaleProductIds();
    const filter = { isActive: true, vendorId: req.params.id };
    if (activeSaleProductIds.length) {
        filter._id = { $nin: activeSaleProductIds };
    }
    if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice && !isNaN(Number(minPrice))) filter.price.$gte = Number(minPrice);
        if (maxPrice && !isNaN(Number(maxPrice))) filter.price.$lte = Number(maxPrice);
    }
    if (minRating && !isNaN(Number(minRating))) {
        filter.rating = { $gte: Number(minRating) };
    }

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select(PRODUCT_LIST_SELECT)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .sort(sortMap[sort] || { createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        products,
        total,
        page: numericPage,
        pages: Math.max(1, Math.ceil(total / numericLimit)),
        limit: numericLimit
    }, 'Vendor products fetched.'));
}));

// POST /api/coupons/validate
router.post('/coupons/validate', asyncHandler(async (req, res) => {
    const rawCode = String(req.body?.code || '').trim();
    const cartTotal = Number(req.body?.cartTotal);

    if (!rawCode) {
        throw new ApiError(400, 'Coupon code is required.');
    }
    if (!Number.isFinite(cartTotal) || cartTotal < 0) {
        throw new ApiError(400, 'Cart total must be a valid non-negative number.');
    }

    const coupon = await Coupon.findOne({ code: rawCode.toUpperCase(), isActive: true }).lean();
    if (!coupon) throw new ApiError(400, 'Invalid coupon code.');
    if (coupon.startsAt && coupon.startsAt > Date.now()) throw new ApiError(400, 'Coupon is not active yet.');
    if (coupon.expiresAt && coupon.expiresAt < Date.now()) throw new ApiError(400, 'Coupon has expired.');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new ApiError(400, 'Coupon usage limit reached.');
    if (cartTotal < coupon.minOrderValue) throw new ApiError(400, `Minimum order value for this coupon is Rs.${coupon.minOrderValue}.`);

    let discount = 0;
    if (coupon.type === 'percentage') {
        discount = (cartTotal * coupon.value) / 100;
        if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    } else if (coupon.type === 'fixed') {
        discount = coupon.value;
    }

    res.status(200).json(new ApiResponse(200, { coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discount }, 'Coupon is valid.'));
}));

// GET /api/coupons/available
router.get('/coupons/available', marketingCache, asyncHandler(async (req, res) => {
    const now = new Date();
    const coupons = await Coupon.find({
        isActive: true,
        $and: [
            { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gte: now } }] }
        ]
    })
        .select('code name type value minOrderValue maxDiscount expiresAt usageLimit usedCount')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

    res.status(200).json(new ApiResponse(200, coupons, 'Available coupons fetched.'));
}));

// POST /api/shipping/estimate
router.post('/shipping/estimate', asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const shippingAddress = req.body?.shippingAddress || {};
    const shippingOption = String(req.body?.shippingOption || 'standard');
    const couponType = req.body?.couponType || null;

    if (!items.length) {
        return res.status(200).json(
            new ApiResponse(200, { shipping: 0, byVendor: {} }, 'Shipping estimate calculated.')
        );
    }

    const productIds = items
        .map((item) => String(item?.productId || '').trim())
        .filter((id) => /^[a-fA-F0-9]{24}$/.test(id));
    if (!productIds.length) {
        return res.status(200).json(
            new ApiResponse(200, { shipping: 0, byVendor: {} }, 'Shipping estimate calculated.')
        );
    }

    const products = await Product.find({ _id: { $in: productIds }, isActive: true })
        .populate('vendorId', 'shippingEnabled defaultShippingRate freeShippingThreshold sellingChannels')
        .select('_id vendorId price variants.prices retailEnabled wholesaleEnabled wholesale')
        .lean();

    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const vendorMap = {};

    items.forEach((item) => {
        const product = productMap.get(String(item?.productId || ''));
        if (!product || !product.vendorId) return;

        const vendorId = String(product.vendorId._id || product.vendorId);
        const quantity = Math.max(1, Number(item?.quantity || 1));
        const variantResolvedPrice = Math.max(0, Number(resolveVariantPrice(product, item?.variant) || 0));
        // Use the same authoritative pricing engine as checkout so free-shipping
        // thresholds are evaluated against the amount the customer will actually pay.
        const pricing = resolvePriceForQuantity(product, variantResolvedPrice, quantity, {
            vendorWholesaleEnabled: product.vendorId?.sellingChannels?.wholesale?.enabled === true,
        });
        const price = pricing.unitPrice;
        const subtotal = price * quantity;

        if (!vendorMap[vendorId]) {
            vendorMap[vendorId] = {
                vendorId,
                subtotal: 0,
                shippingEnabled: product.vendorId.shippingEnabled !== false,
                defaultShippingRate: product.vendorId.defaultShippingRate,
                freeShippingThreshold: product.vendorId.freeShippingThreshold,
            };
        }
        vendorMap[vendorId].subtotal += subtotal;
    });

    const { totalShipping, shippingByVendor } = await calculateVendorShippingForGroups({
        vendorGroups: Object.values(vendorMap),
        shippingAddress,
        shippingOption,
        couponType,
    });

    res.status(200).json(
        new ApiResponse(200, { shipping: totalShipping, byVendor: shippingByVendor }, 'Shipping estimate calculated.')
    );
}));

// GET /api/banners
router.get('/banners', marketingCache, asyncHandler(async (req, res) => {
    const { type } = req.query;
    const now = new Date();
    const filter = {
        isActive: true,
        $and: [
            { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
            { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
        ]
    };
    if (type) filter.type = type;
    const banners = await Banner.find(filter).sort({ order: 1 }).lean();
    res.status(200).json(new ApiResponse(200, banners, 'Banners fetched.'));
}));

// GET /api/testimonials
router.get('/testimonials', marketingCache, asyncHandler(async (req, res) => {
    const testimonials = await Testimonial.find({ isActive: true })
        .sort({ order: 1, createdAt: -1 })
        .lean();
    res.status(200).json(new ApiResponse(200, testimonials, 'Testimonials fetched.'));
}));

// GET /api/campaigns
router.get('/campaigns', marketingCache, asyncHandler(async (req, res) => {
    const { type, limit = 20 } = req.query;
    const parsedLimit = Math.max(parseInt(limit, 10) || 20, 1);
    const now = new Date();

    const query = {
        isActive: true,
        $and: [
            { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
            { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
        ]
    };
    if (type) {
        const types = String(type).split(',').map(t => t.trim()).filter(Boolean);
        if (types.length > 1) {
            query.type = { $in: types };
        } else if (types.length === 1) {
            query.type = types[0];
        }
    }

    const campaigns = await Campaign.find(query)
        .select('name slug type route discountType discountValue startDate endDate bannerConfig')
        .sort({ createdAt: -1 })
        .limit(parsedLimit)
        .lean();

    res.status(200).json(new ApiResponse(200, campaigns, 'Campaigns fetched.'));
}));

// GET /api/campaigns/:slug
router.get('/campaigns/:slug', detailCache, asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!slug) throw new ApiError(400, 'Campaign slug is required.');

    const campaign = await Campaign.findOne({ slug, isActive: true }).lean();
    if (!campaign) throw new ApiError(404, 'Campaign not found.');

    const now = new Date();
    if (campaign.startDate && campaign.startDate > now) {
        throw new ApiError(404, 'Campaign is not active yet.');
    }
    if (campaign.endDate && campaign.endDate < now) {
        throw new ApiError(404, 'Campaign has ended.');
    }

    let productIds = Array.isArray(campaign.productIds)
        ? campaign.productIds
            .map((value) => String(value || '').trim())
            .filter((value) => value && /^[a-fA-F0-9]{24}$/.test(value))
        : [];

    // Removed redundant getActiveSaleProductIds filtering here to ensure products assigned to this campaign 
    // are visible as long as the campaign itself is active and within its own date window.

    const products = await Product.find({
        _id: { $in: productIds },
        isActive: true
    })
        .select(PRODUCT_LIST_SELECT)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName')
        .sort({ createdAt: -1 })
        .lean();

    const payload = {
        ...campaign,
        id: String(campaign._id),
        products,
    };

    res.status(200).json(new ApiResponse(200, payload, 'Campaign fetched.'));
}));

// GET /api/orders/track/:id (public order tracking)
router.get('/orders/track/:id', detailCache, asyncHandler(async (req, res) => {
    const { default: Order } = await import('../models/Order.model.js');
    const order = await Order.findOne({ orderId: req.params.id })
        .select('orderId status trackingNumber estimatedDelivery deliveredAt createdAt updatedAt cancelledAt')
        .lean();
    if (!order) throw new ApiError(404, 'Order not found.');
    res.status(200).json(new ApiResponse(200, order, 'Order tracking info.'));
}));

// ─── Sell on DwellMart (Public) ───────────────────────────────────────────────
// GET /api/public/subscription-plans — list active plans for public display
router.get('/subscription-plans', catalogCache, asyncHandler(async (req, res) => {
    const country = String(req.query.country || '').trim();
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1 });
    res.status(200).json(
        new ApiResponse(
            200,
            plans.map((plan) => serializePlan(plan, country)),
            'Subscription plans fetched.'
        )
    );
}));

// GET /api/public/vendor-terms — get T&C for vendor registration
router.get('/vendor-terms', catalogCache, asyncHandler(async (req, res) => {
    const setting = await Settings.findOne({ key: 'vendor_terms_and_conditions' }).lean();
    res.status(200).json(new ApiResponse(200, {
        content: setting?.value?.content || '',
        lastUpdated: setting?.updatedAt || null,
    }, 'Vendor terms fetched.'));
}));

// Create Razorpay Order for Subscription (Public)

// Create Stripe Session for Subscription (Public)

// ─── Public Static Pages ──────────────────────────────────────────────────────
// GET /api/pages/:slug (public — no auth required so user-facing pages can fetch content)
router.get('/pages/:slug', asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const ALLOWED_SLUGS = ['about', 'contact', 'terms', 'privacy', 'returns', 'shipping', 'faq', 'partner'];
    if (!ALLOWED_SLUGS.includes(slug)) {
        throw new ApiError(404, 'Page not found.');
    }
    const setting = await Settings.findOne({ key: `page_${slug}` });
    res.status(200).json(new ApiResponse(200, {
        slug,
        title: setting?.value?.title || '',
        content: setting?.value?.content || '',
        lastUpdated: setting?.updatedAt || null,
    }, 'Page fetched.'));
}));

// POST /api/contact (public — process Contact Us form and send inquiry email)
router.post('/contact', asyncHandler(async (req, res) => {
    const { name, email, phone, subject, message } = req.body || {};

    if (!name || !String(name).trim()) {
        throw new ApiError(400, 'Name is required.');
    }
    if (!email || !String(email).trim()) {
        throw new ApiError(400, 'Email address is required.');
    }
    if (!message || !String(message).trim()) {
        throw new ApiError(400, 'Message content is required.');
    }

    const recipientEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'support@dwellmart.com';
    const emailSubject = `[DwellMart Inquiry] ${subject || 'New Contact Us Message'} from ${name.trim()}`;

    const textContent = `
New Contact Us Inquiry Received:
----------------------------------
Name: ${name.trim()}
Email: ${email.trim()}
Phone: ${phone ? String(phone).trim() : 'N/A'}
Subject: ${subject || 'General Inquiry'}

Message:
${message.trim()}
----------------------------------
Sent from DwellMart Store Contact Form.
    `;

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="background-color: #0f172a; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h2 style="color: #ffc101; margin: 0; font-size: 22px;">DwellMart Customer Inquiry</h2>
            </div>
            <div style="padding: 24px; color: #334155;">
                <h3 style="margin-top: 0; color: #0f172a;">New Message Received</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr>
                        <td style="padding: 8px 0; font-weight: bold; width: 100px;">Name:</td>
                        <td style="padding: 8px 0;">${name.trim()}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; font-weight: bold;">Email:</td>
                        <td style="padding: 8px 0;"><a href="mailto:${email.trim()}" style="color: #2563eb;">${email.trim()}</a></td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; font-weight: bold;">Phone:</td>
                        <td style="padding: 8px 0;">${phone ? String(phone).trim() : 'Not provided'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; font-weight: bold;">Subject:</td>
                        <td style="padding: 8px 0;">${subject || 'General Inquiry'}</td>
                    </tr>
                </table>
                <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #ffc101;">
                    <p style="margin: 0; font-weight: bold; color: #475569;">Message:</p>
                    <p style="margin-top: 8px; white-space: pre-wrap; color: #1e293b;">${message.trim()}</p>
                </div>
            </div>
            <div style="padding: 16px 24px; background-color: #f1f5f9; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #64748b;">
                Sent via DwellMart Official Contact Form.
            </div>
        </div>
    `;

    try {
        await sendEmail({
            to: recipientEmail,
            subject: emailSubject,
            text: textContent,
            html: htmlContent,
        });
    } catch (err) {
        console.error('Failed to send contact inquiry email via SMTP:', err.message);
    }

    res.status(200).json(new ApiResponse(200, null, 'Thank you! Your message has been sent successfully. We will get back to you soon.'));
}));


// POST /api/feedback (public — process Feedback form and send email)
router.post('/feedback', asyncHandler(async (req, res) => {
    const { name, email, rating, category, message, userId } = req.body || {};

    if (!name || !String(name).trim()) {
        throw new ApiError(400, 'Name is required.');
    }
    if (!email || !String(email).trim()) {
        throw new ApiError(400, 'Email address is required.');
    }
    if (!rating || Number(rating) < 1 || Number(rating) > 5) {
        throw new ApiError(400, 'A valid rating (1-5) is required.');
    }
    if (!message || !String(message).trim()) {
        throw new ApiError(400, 'Feedback message is required.');
    }

    const newFeedback = await Feedback.create({
        userId: userId || null,
        name: name.trim(),
        email: email.trim(),
        rating: Number(rating),
        category: category || 'General',
        message: message.trim(),
    });

    // Create in-app notification for Admin
    try {
        await Notification.create({
            recipientId: newFeedback._id, // placeholder recipientId for admin notifications
            recipientType: 'admin',
            title: `New Feedback (${rating}★)`,
            message: `${name.trim()} submitted a ${rating}-star feedback under ${category || 'General'}.`,
            type: 'system',
            data: { feedbackId: String(newFeedback._id) },
        });
    } catch (notifErr) {
        console.error('Failed to create in-app notification for admin:', notifErr.message);
    }

    const recipientEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'support@dwellmart.com';
    const emailSubject = `[DwellMart Feedback] New ${rating}-star feedback received from ${name.trim()}`;

    const textContent = `
New Feedback Received:
----------------------------------
Name: ${name.trim()}
Email: ${email.trim()}
Rating: ${rating}/5
Category: ${category || 'General'}

Message:
${message.trim()}
----------------------------------
Sent from DwellMart Store Feedback Form.
    `;

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="background-color: #0f172a; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h2 style="color: #ffc101; margin: 0; font-size: 22px;">DwellMart Customer Feedback</h2>
            </div>
            <div style="padding: 24px; color: #334155;">
                <h3 style="margin-top: 0; color: #0f172a;">New Feedback Received</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr>
                        <td style="padding: 8px 0; font-weight: bold; width: 100px;">Name:</td>
                        <td style="padding: 8px 0;">${name.trim()}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; font-weight: bold;">Email:</td>
                        <td style="padding: 8px 0;"><a href="mailto:${email.trim()}" style="color: #2563eb;">${email.trim()}</a></td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; font-weight: bold;">Rating:</td>
                        <td style="padding: 8px 0;">${rating} / 5 Stars</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; font-weight: bold;">Category:</td>
                        <td style="padding: 8px 0;">${category || 'General'}</td>
                    </tr>
                </table>
                <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #ffc101;">
                    <p style="margin: 0; font-weight: bold; color: #475569;">Message:</p>
                    <p style="margin-top: 8px; white-space: pre-wrap; color: #1e293b;">${message.trim()}</p>
                </div>
            </div>
            <div style="padding: 16px 24px; background-color: #f1f5f9; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #64748b;">
                Sent via DwellMart Official Feedback Form.
            </div>
        </div>
    `;

    try {
        await sendEmail({
            to: recipientEmail,
            subject: emailSubject,
            text: textContent,
            html: htmlContent,
        });
    } catch (err) {
        console.error('Failed to send feedback notification email via SMTP:', err.message);
    }

    res.status(201).json(new ApiResponse(201, { feedbackId: newFeedback._id }, 'Thank you! Your feedback has been submitted successfully.'));
}));


// Simple persistence for exchange rates
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE = path.join(__dirname, '../data/currency_cache.json');
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// GET /api/currencies (public)
router.get('/currencies', asyncHandler(async (req, res) => {
    const now = Date.now();
    const apiKey = process.env.EXCHANGERATE_API_KEY;
    
    // Currency metadata
    const currencyMeta = [
        { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
        { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US' },
        { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE' },
        { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', locale: 'ar-SA' },
        { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE' },
        { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB' },
    ];

    let cacheData = { lastUpdated: 0 };
    try {
        const fileContent = await fs.readFile(CACHE_FILE, 'utf-8');
        cacheData = JSON.parse(fileContent);
    } catch (err) {
        console.log('No cache file found, will initialize on success');
    }

    // If cache is expired and we have an API key, try to fetch new rates
    if (now - (cacheData.lastUpdated || 0) > CACHE_DURATION && apiKey && apiKey !== 'your_api_key_here') {
        try {
            // Using ExchangeRate-API v6
            const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/INR`;
            const response = await axios.get(url);
            
            if (response.data && response.data.result === 'success' && response.data.conversion_rates) {
                const liveRates = response.data.conversion_rates;
                liveRates['lastUpdated'] = now;
                
                // Save to file for persistence
                await fs.writeFile(CACHE_FILE, JSON.stringify(liveRates, null, 4));
                cacheData = liveRates;
                console.log('Live rates updated from ExchangeRate-API');
            }
        } catch (error) {
            console.error('ExchangeRate-API failed, using last known cache:', error.message);
        }
    } else if (!apiKey || apiKey === 'your_api_key_here') {
        console.warn('EXCHANGERATE_API_KEY is missing or not set. Using cached/fallback rates.');
    }

    // Combine metadata with cached rates
    const finalCurrencies = currencyMeta.map(curr => ({
        ...curr,
        rate: cacheData[curr.code] || (curr.code === 'INR' ? 1 : null) 
    })).filter(c => c.rate !== null);

    res.status(200).json(new ApiResponse(200, finalCurrencies, 'Currencies fetched successfully.'));
}));

// Legacy support: GET /api/:id (only ObjectId-like values to avoid swallowing unknown routes)
router.get('/:id([a-fA-F0-9]{24})', detailCache, getProductDetail);

export default router;
