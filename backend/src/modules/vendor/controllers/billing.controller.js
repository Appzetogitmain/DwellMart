import asyncHandler from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Admin from '../../../models/Admin.model.js';
import SubscriptionPlan from '../../../models/SubscriptionPlan.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendVendorOnboardingSuccessEmail } from '../../../services/email.service.js';
import { createPlanSelection, resolvePlanSelection } from '../../../services/billing/planSelection.service.js';
import { serializePlan } from '../../../services/billing/plan.service.js';
import {
    activateInternalSubscription,
    getCurrentVendorSubscription,
    serializeSubscription,
} from '../../../services/billing/subscriptionState.service.js';

const rememberSubscribedVendor = async (vendor, planId) => {
    if (!vendor) return;
    const shouldNotifyAdmins = vendor.status === 'pending' && vendor.onboardingStatus !== 'subscription_active';
    vendor.selectedPlan = planId;
    vendor.onboardingStatus = 'subscription_active';
    vendor.onboardingCompletedAt = new Date();
    await vendor.save({ validateBeforeSave: false });

    if (shouldNotifyAdmins) {
        const admins = await Admin.find({ isActive: true }).select('_id');
        await Promise.all(
            admins.map((admin) =>
                createNotification({
                    recipientId: admin._id,
                    recipientType: 'admin',
                    title: 'Vendor Subscription Activated',
                    message: `${vendor.storeName || vendor.name} completed subscription onboarding and is awaiting review.`,
                    type: 'system',
                    data: {
                        vendorId: String(vendor._id),
                        vendorEmail: vendor.email,
                        status: vendor.status,
                        planId: String(planId),
                    },
                })
            )
        );
    }
};

const notifyVendorOfOnboardingCompletion = async (vendor, plan, payment) => {
    if (!vendor || vendor.onboardingEmailSentAt) {
        return;
    }

    try {
        await sendVendorOnboardingSuccessEmail(vendor, plan, payment);
        vendor.onboardingEmailSentAt = new Date();
        vendor.onboardingEmailInvoiceId = String(
            payment?.invoiceId
            || payment?.transactionId
            || vendor.onboardingEmailInvoiceId
            || ''
        ) || null;
        await vendor.save({ validateBeforeSave: false });
    } catch (err) {
        console.warn(`[Onboarding Email] Failed to send email to ${vendor.email}: ${err.message}`);
    }
};

export const selectPlan = asyncHandler(async (req, res) => {
    const { planId, country = '' } = req.body;
    const { token, plan } = await createPlanSelection({ planId, country });

    res.status(201).json(
        new ApiResponse(
            201,
            {
                selectionToken: token,
                gateway: 'internal',
                plan: serializePlan(plan, country),
            },
            'Plan selected successfully.'
        )
    );
});

export const getSubscriptionPlans = asyncHandler(async (req, res) => {
    const country = String(req.query.country || '').trim();
    const plans = await SubscriptionPlan
        .find({ isActive: true })
        .sort({ sortOrder: 1, createdAt: -1 });

    res.status(200).json(
        new ApiResponse(
            200,
            plans.map((plan) => serializePlan(plan, country)),
            'Subscription plans fetched.'
        )
    );
});

export const initiateOnboardingSubscription = asyncHandler(async (req, res) => {
    const { email, selectionToken, selectedPlanId } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const vendor = await Vendor.findOne({ email: normalizedEmail });

    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    if (!vendor.isVerified) throw new ApiError(403, 'Please verify your email first.');

    const { plan } = await resolvePlanSelection({
        selectionToken,
        selectedPlanId: selectedPlanId || vendor.selectedPlan,
    });
    const currentSubscription = await getCurrentVendorSubscription(vendor._id);

    if (currentSubscription?.status === 'active' && String(currentSubscription.plan?._id || currentSubscription.plan) === String(plan._id)) {
        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    gateway: 'internal',
                    subscription: await serializeSubscription(currentSubscription),
                    alreadyActive: true,
                },
                'Subscription is already active for this plan.'
            )
        );
    }

    const internalSubscription = await activateInternalSubscription({ vendor, plan, gateway: 'internal' });
    
    // Notify admins for subscription activation during onboarding
    await rememberSubscribedVendor(vendor, plan._id);

    // Send onboarding completion email
    await notifyVendorOfOnboardingCompletion(vendor, plan, {
        amount: Number(plan.price_inr || plan.price_usd || 0),
        currency: vendor.country === 'IN' ? 'INR' : 'USD',
        gateway: 'internal',
        status: 'paid',
        transactionId: `INT_${Date.now()}`,
        invoiceId: `${internalSubscription.gateway_subscription_id}_invoice`,
        createdAt: new Date(),
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                gateway: 'internal',
                subscription: await serializeSubscription(internalSubscription),
                status: 'active',
            },
            'Subscription activated successfully.'
        )
    );
});

export const confirmOnboardingPayment = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const vendor = await Vendor.findOne({ email: normalizedEmail });

    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    const currentSubscription = await getCurrentVendorSubscription(vendor._id);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                gateway: 'internal',
                confirmed: true,
                subscription: await serializeSubscription(currentSubscription),
            },
            'Subscription confirmed.'
        )
    );
});
