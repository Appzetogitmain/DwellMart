import asyncHandler from '../../../utils/asyncHandler.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import Coupon from '../../../models/Coupon.model.js';
import Banner from '../../../models/Banner.model.js';
import Campaign from '../../../models/Campaign.model.js';
import Testimonial from '../../../models/Testimonial.model.js';
import { slugify } from '../../../utils/slugify.js';
import { parsePagination } from '../../../utils/pagination.js';

const COUPON_TYPES = new Set(['percentage', 'fixed', 'freeship']);
const EXCLUSIVE_SALE_CAMPAIGN_TYPES = ['flash_sale', 'daily_deal', 'special_offer', 'festival'];
const EXCLUSIVE_SALE_CAMPAIGN_TYPE_SET = new Set(EXCLUSIVE_SALE_CAMPAIGN_TYPES);

const toFiniteNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const toBooleanOrNull = (value) => {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return null;
};

const toValidDateOrNull = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const isExternalLink = (value) => /^https?:\/\//i.test(String(value || '').trim());
const isSafeInternalPath = (value) => String(value || '').trim().startsWith('/');
const KNOWN_BANNER_INTERNAL_ROUTE_PATTERNS = [
    /^\/$/,
    /^\/home$/,
    /^\/search$/,
    /^\/offers$/,
    /^\/daily-deals$/,
    /^\/flash-sale$/,
    /^\/new-arrivals$/,
    /^\/categories$/,
    /^\/category\/[^/?#]+$/,
    /^\/brand\/[^/?#]+$/,
    /^\/seller\/[^/?#]+$/,
    /^\/product\/[^/?#]+$/,
    /^\/sale\/[^/?#]+$/,
    /^\/track-order\/[^/?#]+$/,
];
const getPathnameFromTarget = (target) =>
    String(target || '').trim().split('?')[0].split('#')[0];
const isKnownBannerInternalPath = (target) => {
    const pathname = getPathnameFromTarget(target);
    if (!pathname) return false;
    return KNOWN_BANNER_INTERNAL_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
};
const normalizeBannerLink = (value) => {
    const candidate = String(value || '').trim();
    if (!candidate) return '';
    if (isExternalLink(candidate)) return candidate;
    if (isSafeInternalPath(candidate) && isKnownBannerInternalPath(candidate)) return candidate;
    return '';
};

const normalizeBannerPayload = (payload = {}) => {
    const rawType = String(payload?.type || '').trim().toLowerCase();
    const type = rawType === 'hero' ? 'home_slider' : (payload?.type || 'home_slider');
    return {
        ...payload,
        type,
        link: normalizeBannerLink(payload?.link),
    };
};

const normalizeObjectIdList = (values) => {
    if (!Array.isArray(values)) return [];
    return values
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0);
};

const enforceExclusiveSaleProducts = async ({
    campaignId = null,
    campaignType,
    productIds = [],
}) => {
    const normalizedProductIds = normalizeObjectIdList(productIds);
    if (!EXCLUSIVE_SALE_CAMPAIGN_TYPE_SET.has(String(campaignType || '').trim())) {
        return {
            normalizedProductIds,
            movedProducts: [],
        };
    }
    if (!normalizedProductIds.length) {
        return {
            normalizedProductIds,
            movedProducts: [],
        };
    }

    const otherCampaignFilter = {
        type: { $in: EXCLUSIVE_SALE_CAMPAIGN_TYPES },
        productIds: { $in: normalizedProductIds },
    };
    if (campaignId) {
        otherCampaignFilter._id = { $ne: campaignId };
    }

    const otherCampaigns = await Campaign.find(otherCampaignFilter)
        .select('_id name type productIds')
        .lean();

    if (!otherCampaigns.length) {
        return {
            normalizedProductIds,
            movedProducts: [],
        };
    }

    const movedProducts = [];
    const bulkUpdates = [];

    otherCampaigns.forEach((otherCampaign) => {
        const originalIds = Array.isArray(otherCampaign.productIds)
            ? otherCampaign.productIds.map((value) => String(value || '').trim()).filter(Boolean)
            : [];

        const productIdSetToMove = new Set(
            originalIds.filter((value) => normalizedProductIds.includes(value))
        );
        if (!productIdSetToMove.size) return;

        const nextProductIds = originalIds.filter((value) => !productIdSetToMove.has(value));
        bulkUpdates.push({
            updateOne: {
                filter: { _id: otherCampaign._id },
                update: { $set: { productIds: nextProductIds } },
            },
        });

        productIdSetToMove.forEach((productId) => {
            movedProducts.push({
                productId,
                fromCampaignId: String(otherCampaign._id),
                fromCampaignName: String(otherCampaign.name || '').trim(),
                fromCampaignType: String(otherCampaign.type || '').trim(),
            });
        });
    });

    if (bulkUpdates.length) {
        await Campaign.bulkWrite(bulkUpdates, { ordered: false });
    }

    return {
        normalizedProductIds,
        movedProducts,
    };
};

const ensureUniqueCampaignSlug = async (baseNameOrSlug, excludeId = null) => {
    const base = slugify(String(baseNameOrSlug || '').trim()) || `campaign-${Date.now()}`;
    let candidate = base;
    let counter = 1;
    while (true) {
        const query = excludeId
            ? { slug: candidate, _id: { $ne: excludeId } }
            : { slug: candidate };
        const exists = await Campaign.exists(query);
        if (!exists) return candidate;
        candidate = `${base}-${counter}`;
        counter += 1;
    }
};

const syncCampaignBanner = async (campaign, previousRoute = null) => {
    if (!campaign?.autoCreateBanner || !campaign?.route) return;

    const title = campaign.bannerConfig?.title || campaign.name || 'Special Offer';
    const subtitle =
        campaign.bannerConfig?.subtitle ||
        (campaign.discountType === 'percentage'
            ? `${campaign.discountValue || 0}% OFF`
            : `Save ${campaign.discountValue || 0}`);

    const image = campaign.bannerConfig?.image || '';
    const bannerPayload = {
        title,
        subtitle,
        description: campaign.description || '',
        link: campaign.route,
        type: 'promotional',
        isActive: !!campaign.isActive,
    };
    if (image) {
        bannerPayload.image = image;
    }

    const baseFilter = { type: 'promotional' };
    if (previousRoute && previousRoute !== campaign.route) {
        const updated = await Banner.findOneAndUpdate(
            { ...baseFilter, link: previousRoute },
            bannerPayload,
            { new: true }
        );
        if (updated) return;
    }

    const existing = await Banner.findOne({ ...baseFilter, link: campaign.route });
    if (existing) {
        Object.assign(existing, bannerPayload);
        await existing.save();
        return;
    }

    if (bannerPayload.image) {
        await Banner.create(bannerPayload);
    }
};

const deactivateCampaignBannersByRoutes = async (routes = []) => {
    const uniqueRoutes = [...new Set(
        routes
            .map((route) => String(route || '').trim())
            .filter(Boolean)
    )];
    if (!uniqueRoutes.length) return;

    await Banner.updateMany(
        { type: 'promotional', link: { $in: uniqueRoutes } },
        { $set: { isActive: false } }
    );
};

const formatCoupon = (couponDoc) => {
    const coupon = couponDoc.toObject ? couponDoc.toObject() : couponDoc;
    return {
        ...coupon,
        minPurchase: coupon.minOrderValue ?? 0,
        startDate: coupon.startsAt ?? null,
        endDate: coupon.expiresAt ?? null,
        status: coupon.isActive ? 'active' : 'inactive',
    };
};

const normalizeCouponPayload = (payload, { partial = false } = {}) => {
    const normalized = {};

    if (payload.code !== undefined) {
        const code = String(payload.code || '').trim().toUpperCase();
        if (!code) throw new ApiError(400, 'Coupon code is required');
        normalized.code = code;
    } else if (!partial) {
        throw new ApiError(400, 'Coupon code is required');
    }

    if (payload.name !== undefined) {
        normalized.name = String(payload.name || '').trim();
    }

    if (payload.type !== undefined) {
        const type = String(payload.type || '').trim().toLowerCase();
        if (!COUPON_TYPES.has(type)) {
            throw new ApiError(400, 'Coupon type must be percentage, fixed, or freeship');
        }
        normalized.type = type;
    } else if (!partial) {
        throw new ApiError(400, 'Coupon type is required');
    }

    if (payload.value !== undefined) {
        const value = toFiniteNumber(payload.value);
        if (value === null || value < 0) throw new ApiError(400, 'Coupon value must be a non-negative number');
        normalized.value = value;
    } else if (!partial) {
        throw new ApiError(400, 'Coupon value is required');
    }

    if (payload.minOrderValue !== undefined || payload.minPurchase !== undefined) {
        const minOrderValue = payload.minOrderValue ?? payload.minPurchase;
        const parsed = toFiniteNumber(minOrderValue);
        if (parsed === null || parsed < 0) throw new ApiError(400, 'Minimum purchase must be a non-negative number');
        normalized.minOrderValue = parsed;
    } else if (!partial) {
        normalized.minOrderValue = 0;
    }

    if (payload.maxDiscount !== undefined) {
        if (payload.maxDiscount === '' || payload.maxDiscount === null) {
            normalized.maxDiscount = undefined;
        } else {
            const maxDiscount = toFiniteNumber(payload.maxDiscount);
            if (maxDiscount === null || maxDiscount < 0) throw new ApiError(400, 'Max discount must be a non-negative number');
            normalized.maxDiscount = maxDiscount;
        }
    }

    if (payload.usageLimit !== undefined) {
        if (payload.usageLimit === '' || payload.usageLimit === null) {
            normalized.usageLimit = null;
        } else {
            const usageLimit = Number(payload.usageLimit);
            if (!Number.isInteger(usageLimit)) throw new ApiError(400, 'Usage limit must be an integer');
            normalized.usageLimit = usageLimit < 0 ? null : usageLimit;
        }
    }

    if (payload.isActive !== undefined) {
        const isActive = toBooleanOrNull(payload.isActive);
        if (isActive === null) throw new ApiError(400, 'isActive must be a boolean');
        normalized.isActive = isActive;
    } else if (payload.status !== undefined) {
        normalized.isActive = String(payload.status).toLowerCase() === 'active';
    } else if (!partial) {
        normalized.isActive = true;
    }

    if (payload.startsAt !== undefined || payload.startDate !== undefined) {
        const startsAt = toValidDateOrNull(payload.startsAt ?? payload.startDate);
        if ((payload.startsAt ?? payload.startDate) && !startsAt) throw new ApiError(400, 'Start date is invalid');
        normalized.startsAt = startsAt;
    }

    if (payload.expiresAt !== undefined || payload.endDate !== undefined) {
        const expiresAt = toValidDateOrNull(payload.expiresAt ?? payload.endDate);
        if ((payload.expiresAt ?? payload.endDate) && !expiresAt) throw new ApiError(400, 'End date is invalid');
        normalized.expiresAt = expiresAt;
    }

    return normalized;
};

const validateCouponBusinessRules = ({ type, value }) => {
    if (type === 'percentage') {
        const parsedValue = Number(value);
        if (!Number.isFinite(parsedValue)) {
            throw new ApiError(400, 'Coupon value must be a valid number');
        }
        if (parsedValue > 100) {
            throw new ApiError(400, 'Percentage coupon value cannot exceed 100');
        }
    }
};

const normalizeTestimonialPayload = (payload = {}, { partial = false } = {}) => {
    const normalized = {};

    if (payload.name !== undefined) {
        const name = String(payload.name || '').trim();
        if (!name) throw new ApiError(400, 'Name is required');
        normalized.name = name;
    } else if (!partial) {
        throw new ApiError(400, 'Name is required');
    }

    if (payload.message !== undefined) {
        const message = String(payload.message || '').trim();
        if (!message) throw new ApiError(400, 'Message is required');
        normalized.message = message;
    } else if (!partial) {
        throw new ApiError(400, 'Message is required');
    }

    if (payload.designation !== undefined) {
        normalized.designation = String(payload.designation || '').trim();
    } else if (!partial) {
        normalized.designation = '';
    }

    if (payload.company !== undefined) {
        normalized.company = String(payload.company || '').trim();
    } else if (!partial) {
        normalized.company = '';
    }

    if (payload.image !== undefined) {
        normalized.image = String(payload.image || '').trim();
    } else if (!partial) {
        normalized.image = '';
    }

    if (payload.rating !== undefined) {
        const rating = Number(payload.rating);
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
            throw new ApiError(400, 'Rating must be between 1 and 5');
        }
        normalized.rating = rating;
    } else if (!partial) {
        normalized.rating = 5;
    }

    if (payload.order !== undefined) {
        const order = Number(payload.order);
        if (!Number.isFinite(order) || order < 0) {
            throw new ApiError(400, 'Display order must be a non-negative number');
        }
        normalized.order = order;
    } else if (!partial) {
        normalized.order = 0;
    }

    if (payload.isActive !== undefined) {
        const isActive = toBooleanOrNull(payload.isActive);
        if (isActive === null) throw new ApiError(400, 'isActive must be a boolean');
        normalized.isActive = isActive;
    } else if (!partial) {
        normalized.isActive = true;
    }

    return normalized;
};

// ─── Coupons (Promo Codes) ──────────────────────────────────────────────────
export const getAllCoupons = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const { page, limit, skip, calculatePages } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 1000 });
    const query = {};
    const now = new Date();

    if (status === 'active') {
        query.isActive = true;
        query.$and = [
            { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gte: now } }] }
        ];
    } else if (status === 'inactive') {
        query.isActive = false;
    } else if (status === 'expired') {
        query.expiresAt = { $lt: now };
    } else if (status === 'upcoming') {
        query.startsAt = { $gt: now };
    }

    const coupons = await Coupon.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

    const count = await Coupon.countDocuments(query);

    return res.status(200).json(
        new ApiResponse(200, {
            coupons: coupons.map(formatCoupon),
            pagination: {
                total: count,
                page,
                limit,
                pages: calculatePages(count)
            }
        }, 'Coupons fetched successfully')
    );
});

export const createCoupon = asyncHandler(async (req, res) => {
    const payload = normalizeCouponPayload(req.body);
    validateCouponBusinessRules({ type: payload.type, value: payload.value });

    if (payload.type === 'freeship') {
        payload.value = 0;
        payload.maxDiscount = undefined;
    }

    if (payload.startsAt && payload.expiresAt && payload.startsAt >= payload.expiresAt) {
        throw new ApiError(400, 'End date must be after start date');
    }

    const existingCoupon = await Coupon.findOne({ code: payload.code });
    if (existingCoupon) throw new ApiError(409, 'Coupon code already exists');

    const coupon = await Coupon.create(payload);
    return res.status(201).json(new ApiResponse(201, formatCoupon(coupon), 'Coupon created successfully'));
});

export const updateCoupon = asyncHandler(async (req, res) => {
    const payload = normalizeCouponPayload(req.body, { partial: true });

    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) throw new ApiError(404, 'Coupon not found');

    const effectiveType = payload.type !== undefined ? payload.type : coupon.type;
    const effectiveValue = payload.value !== undefined ? payload.value : coupon.value;
    validateCouponBusinessRules({ type: effectiveType, value: effectiveValue });

    if (effectiveType === 'freeship') {
        payload.value = 0;
        payload.maxDiscount = undefined;
    }

    if (payload.code && payload.code !== coupon.code) {
        const existingCoupon = await Coupon.findOne({ code: payload.code, _id: { $ne: coupon._id } });
        if (existingCoupon) throw new ApiError(409, 'Coupon code already exists');
    }

    const effectiveStart = payload.startsAt !== undefined ? payload.startsAt : coupon.startsAt;
    const effectiveEnd = payload.expiresAt !== undefined ? payload.expiresAt : coupon.expiresAt;
    if (effectiveStart && effectiveEnd && effectiveStart >= effectiveEnd) {
        throw new ApiError(400, 'End date must be after start date');
    }

    Object.assign(coupon, payload);
    await coupon.save();

    return res.status(200).json(new ApiResponse(200, formatCoupon(coupon), 'Coupon updated successfully'));
});

export const deleteCoupon = asyncHandler(async (req, res) => {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) throw new ApiError(404, 'Coupon not found');
    return res.status(200).json(new ApiResponse(200, null, 'Coupon deleted successfully'));
});

// ─── Banners ──────────────────────────────────────────────────────────────────
export const getAllBanners = asyncHandler(async (req, res) => {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    return res.status(200).json(new ApiResponse(200, banners, 'Banners fetched successfully'));
});

export const createBanner = asyncHandler(async (req, res) => {
    const banner = await Banner.create(normalizeBannerPayload(req.body));
    return res.status(201).json(new ApiResponse(201, banner, 'Banner created successfully'));
});

export const updateBanner = asyncHandler(async (req, res) => {
    const banner = await Banner.findByIdAndUpdate(
        req.params.id,
        normalizeBannerPayload(req.body),
        { new: true }
    );
    if (!banner) throw new ApiError(404, 'Banner not found');
    return res.status(200).json(new ApiResponse(200, banner, 'Banner updated successfully'));
});

export const reorderBanners = asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length < 2) {
        throw new ApiError(400, 'At least two banners are required for reorder');
    }

    const ops = items
        .filter((item) => item?.id && Number.isFinite(Number(item?.order)))
        .map((item) => ({
            updateOne: {
                filter: { _id: String(item.id) },
                update: { $set: { order: Number(item.order) } },
            },
        }));

    if (ops.length < 2) {
        throw new ApiError(400, 'Invalid reorder payload');
    }

    await Banner.bulkWrite(ops, { ordered: true });
    return res.status(200).json(new ApiResponse(200, null, 'Banners reordered successfully'));
});

export const deleteBanner = asyncHandler(async (req, res) => {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) throw new ApiError(404, 'Banner not found');
    return res.status(200).json(new ApiResponse(200, null, 'Banner deleted successfully'));
});

// Testimonials
export const getAllTestimonials = asyncHandler(async (req, res) => {
    const testimonials = await Testimonial.find().sort({ order: 1, createdAt: -1 });
    return res.status(200).json(new ApiResponse(200, testimonials, 'Testimonials fetched successfully'));
});

export const createTestimonial = asyncHandler(async (req, res) => {
    const testimonial = await Testimonial.create(normalizeTestimonialPayload(req.body));
    return res.status(201).json(new ApiResponse(201, testimonial, 'Testimonial created successfully'));
});

export const updateTestimonial = asyncHandler(async (req, res) => {
    const testimonial = await Testimonial.findByIdAndUpdate(
        req.params.id,
        normalizeTestimonialPayload(req.body, { partial: true }),
        { new: true }
    );
    if (!testimonial) throw new ApiError(404, 'Testimonial not found');
    return res.status(200).json(new ApiResponse(200, testimonial, 'Testimonial updated successfully'));
});

export const deleteTestimonial = asyncHandler(async (req, res) => {
    const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
    if (!testimonial) throw new ApiError(404, 'Testimonial not found');
    return res.status(200).json(new ApiResponse(200, null, 'Testimonial deleted successfully'));
});

// ─── Campaigns ───────────────────────────────────────────────────────────────
export const getAllCampaigns = asyncHandler(async (req, res) => {
    const { status, type } = req.query;
    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const campaigns = await Campaign.find(query).sort({ createdAt: -1 });
    return res.status(200).json(new ApiResponse(200, campaigns, 'Campaigns fetched successfully'));
});

export const createCampaign = asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    const slugSource = payload.slug || payload.name;
    payload.slug = await ensureUniqueCampaignSlug(slugSource);
    payload.route = `/sale/${payload.slug}`;
    const exclusivityResult = await enforceExclusiveSaleProducts({
        campaignType: payload.type,
        productIds: payload.productIds,
    });
    payload.productIds = exclusivityResult.normalizedProductIds;
    
    // Ensure status is synced with isActive if not provided
    if (payload.status === undefined) {
        payload.status = payload.isActive !== false ? 'active' : 'draft';
    }

    const campaign = await Campaign.create(payload);
    await syncCampaignBanner(campaign);
    const campaignResponse = campaign.toObject ? campaign.toObject() : campaign;
    campaignResponse._reassignment = {
        movedCount: exclusivityResult.movedProducts.length,
        movedProducts: exclusivityResult.movedProducts,
    };
    return res.status(201).json(new ApiResponse(201, campaignResponse, 'Campaign created successfully'));
});

export const updateCampaign = asyncHandler(async (req, res) => {
    const existing = await Campaign.findById(req.params.id);
    if (!existing) throw new ApiError(404, 'Campaign not found');

    const payload = { ...req.body };
    if (payload.name !== undefined || payload.slug !== undefined) {
        const slugSource = payload.slug || payload.name || existing.slug || existing.name;
        payload.slug = await ensureUniqueCampaignSlug(slugSource, existing._id);
    }
    payload.route = `/sale/${payload.slug || existing.slug}`;
    const effectiveType = payload.type !== undefined ? payload.type : existing.type;
    const effectiveProductIds =
        payload.productIds !== undefined ? payload.productIds : existing.productIds;
    const exclusivityResult = await enforceExclusiveSaleProducts({
        campaignId: String(existing._id),
        campaignType: effectiveType,
        productIds: effectiveProductIds,
    });
    if (payload.productIds !== undefined || payload.type !== undefined) {
        payload.productIds = exclusivityResult.normalizedProductIds;
    }

    // Ensure status is synced with isActive if updated
    if (payload.isActive !== undefined && payload.status === undefined) {
        payload.status = payload.isActive ? 'active' : 'draft';
    }

    const campaign = await Campaign.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!campaign) throw new ApiError(404, 'Campaign not found');

    if (campaign.autoCreateBanner) {
        await syncCampaignBanner(campaign, existing.route || null);
    } else {
        await deactivateCampaignBannersByRoutes([existing.route, campaign.route]);
    }

    const campaignResponse = campaign.toObject ? campaign.toObject() : campaign;
    campaignResponse._reassignment = {
        movedCount: exclusivityResult.movedProducts.length,
        movedProducts: exclusivityResult.movedProducts,
    };

    return res.status(200).json(new ApiResponse(200, campaignResponse, 'Campaign updated successfully'));
});

export const deleteCampaign = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findByIdAndDelete(req.params.id);
    if (!campaign) throw new ApiError(404, 'Campaign not found');
    await deactivateCampaignBannersByRoutes([campaign.route]);
    return res.status(200).json(new ApiResponse(200, null, 'Campaign deleted successfully'));
});
