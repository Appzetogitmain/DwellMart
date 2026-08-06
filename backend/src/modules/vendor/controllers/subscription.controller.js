import asyncHandler from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import SubscriptionPlan from '../../../models/SubscriptionPlan.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { getActivePlanById, serializePlan } from '../../../services/billing/plan.service.js';
import {
    activateInternalSubscription,
    getCurrentVendorSubscription,
    serializeSubscription,
} from '../../../services/billing/subscriptionState.service.js';

const isSubscriptionActive = (subscription) => Boolean(
    subscription
    && (subscription.status === 'active' || subscription.status === 'trialing')
    && subscription.current_period_end
    && new Date(subscription.current_period_end) > new Date()
);

const toChangePlanResponse = async ({ gateway = 'internal', subscription, message }) => ({
    gateway,
    checkout: null,
    subscription: await serializeSubscription(subscription),
    message,
});

export const getCurrentSubscription = asyncHandler(async (req, res) => {
    const subscription = await getCurrentVendorSubscription(req.user.id);

    if (!subscription) {
        return res.status(200).json(
            new ApiResponse(
                200,
                { hasSubscription: false, isActive: false, subscription: null },
                'No subscription found.'
            )
        );
    }

    const serialized = await serializeSubscription(subscription);

    res.status(200).json(
        new ApiResponse(
            200,
            {
                hasSubscription: true,
                isActive: serialized.isActive,
                subscription: serialized,
            },
            'Subscription fetched.'
        )
    );
});

export const getAvailablePlans = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.user.id).select('country');
    const plans = await SubscriptionPlan
        .find({ isActive: true })
        .sort({ sortOrder: 1, createdAt: -1 });

    res.status(200).json(
        new ApiResponse(
            200,
            plans.map((plan) => serializePlan(plan, vendor?.country || '')),
            'Plans fetched.'
        )
    );
});

export const changePlan = asyncHandler(async (req, res) => {
    const { planId } = req.body;
    if (!planId) throw new ApiError(400, 'Please select a plan.');

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const plan = await getActivePlanById(planId);
    const currentSubscription = await getCurrentVendorSubscription(vendor._id);

    vendor.selectedPlan = plan._id;
    await vendor.save({ validateBeforeSave: false });

    if (isSubscriptionActive(currentSubscription) && String(currentSubscription.plan?._id || currentSubscription.plan) === String(plan._id)) {
        return res.status(200).json(
            new ApiResponse(
                200,
                await toChangePlanResponse({
                    gateway: 'internal',
                    subscription: currentSubscription,
                    message: 'You are already subscribed to this plan.',
                }),
                'You are already subscribed to this plan.'
            )
        );
    }

    const subscription = await activateInternalSubscription({ vendor, plan, gateway: 'internal' });

    return res.status(200).json(
        new ApiResponse(
            200,
            await toChangePlanResponse({
                gateway: 'internal',
                subscription,
                message: 'Subscription updated successfully.',
            }),
            'Subscription updated successfully.'
        )
    );
});
