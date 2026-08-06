import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import SubscriptionPlan from '../../../models/SubscriptionPlan.model.js';
import VendorSubscription from '../../../models/VendorSubscription.model.js';
import {
    buildPlanSlug,
    normalizePlanInterval,
    normalizePlanFeatures,
    serializePlan,
} from '../../../services/billing/plan.service.js';

export const getAllPlans = asyncHandler(async (req, res) => {
    const plans = await SubscriptionPlan.find().sort({ sortOrder: 1, createdAt: -1 });
    res.status(200).json(
        new ApiResponse(
            200,
            plans.map((plan) => serializePlan(plan)),
            'Subscription plans fetched.'
        )
    );
});

export const getPlanById = asyncHandler(async (req, res) => {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) throw new ApiError(404, 'Plan not found.');
    res.status(200).json(new ApiResponse(200, serializePlan(plan), 'Plan fetched.'));
});

export const createPlan = asyncHandler(async (req, res) => {
    const {
        name,
        price_inr,
        price_usd,
        interval,
        interval_count,
        description,
        features,
        isMostPopular,
        isActive,
        sortOrder,
    } = req.body;

    const trimmedName = String(name || '').trim();
    if (!trimmedName) throw new ApiError(400, 'Plan name is required.');
    const planInterval = normalizePlanInterval({
        interval,
        intervalCount: interval_count,
    });

    const slug = buildPlanSlug(trimmedName);
    const existing = await SubscriptionPlan.findOne({ slug });
    if (existing) throw new ApiError(409, 'A plan with a similar name already exists.');

    const plan = await SubscriptionPlan.create({
        name: trimmedName,
        slug,
        price_inr: Number(price_inr ?? 0),
        price_usd: Number(price_usd ?? 0),
        interval: planInterval.interval,
        interval_count: planInterval.interval_count,
        description: String(description || '').trim(),
        features: normalizePlanFeatures(features),
        isMostPopular: Boolean(isMostPopular),
        isActive: isActive !== false,
        sortOrder: Number(sortOrder) || 0,
    });

    res.status(201).json(new ApiResponse(201, serializePlan(plan), 'Subscription plan created.'));
});

export const updatePlan = asyncHandler(async (req, res) => {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) throw new ApiError(404, 'Plan not found.');

    const {
        name,
        price_inr,
        price_usd,
        interval,
        interval_count,
        description,
        features,
        isMostPopular,
        isActive,
        sortOrder,
    } = req.body;

    if (name !== undefined) {
        const trimmedName = String(name).trim();
        if (!trimmedName) throw new ApiError(400, 'Plan name is required.');
        const slug = buildPlanSlug(trimmedName);
        const existing = await SubscriptionPlan.findOne({ slug, _id: { $ne: plan._id } });
        if (existing) throw new ApiError(409, 'A plan with a similar name already exists.');
        plan.name = trimmedName;
        plan.slug = slug;
    }
    if (price_inr !== undefined) plan.price_inr = Number(price_inr);
    if (price_usd !== undefined) plan.price_usd = Number(price_usd);
    if (interval !== undefined || interval_count !== undefined) {
        const planInterval = normalizePlanInterval({
            interval: interval ?? plan.interval,
            intervalCount: interval_count ?? plan.interval_count,
        });
        plan.interval = planInterval.interval;
        plan.interval_count = planInterval.interval_count;
    }
    if (description !== undefined) plan.description = String(description).trim();
    if (features !== undefined) plan.features = normalizePlanFeatures(features);
    if (isMostPopular !== undefined) plan.isMostPopular = Boolean(isMostPopular);
    if (isActive !== undefined) plan.isActive = Boolean(isActive);
    if (sortOrder !== undefined) plan.sortOrder = Number(sortOrder);

    await plan.save();

    res.status(200).json(new ApiResponse(200, serializePlan(plan), 'Subscription plan updated.'));
});

export const deletePlan = asyncHandler(async (req, res) => {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) throw new ApiError(404, 'Plan not found.');

    const activeSubCount = await VendorSubscription.countDocuments({
        plan: plan._id,
        status: { $in: ['active', 'trialing', 'past_due'] },
    });
    if (activeSubCount > 0) {
        throw new ApiError(400, `Cannot delete: ${activeSubCount} active subscription(s) use this plan. Deactivate it instead.`);
    }

    await SubscriptionPlan.findByIdAndDelete(req.params.id);
    res.status(200).json(new ApiResponse(200, null, 'Subscription plan deleted.'));
});

export const getVendorSubscriptions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, status, vendorId } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 10, 1);

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (vendorId) filter.vendor = vendorId;

    const [subscriptions, total] = await Promise.all([
        VendorSubscription.find(filter)
            .populate('vendor', 'name email storeName country')
            .populate('plan')
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * limitNumber)
            .limit(limitNumber),
        VendorSubscription.countDocuments(filter),
    ]);

    const payload = subscriptions.map((subscription) => {
        const raw = subscription.toObject({ virtuals: true });
        return {
            ...raw,
            vendor: raw.vendor,
            plan: serializePlan(raw.plan, raw.vendor?.country || ''),
        };
    });

    res.status(200).json(
        new ApiResponse(
            200,
            {
                subscriptions: payload,
                pagination: {
                    total,
                    page: pageNumber,
                    limit: limitNumber,
                    pages: Math.ceil(total / limitNumber),
                },
            },
            'Vendor subscriptions fetched.'
        )
    );
});
