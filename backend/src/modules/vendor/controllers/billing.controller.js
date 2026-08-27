import asyncHandler from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Admin from '../../../models/Admin.model.js';
import { isPhoneVerified, clearPhoneVerification } from '../../../services/phoneVerification.service.js';
import SubscriptionPlan from '../../../models/SubscriptionPlan.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendVendorOnboardingSuccessEmail } from '../../../services/email.service.js';
import { createPlanSelection, resolvePlanSelection } from '../../../services/billing/planSelection.service.js';
import { serializePlan } from '../../../services/billing/plan.service.js';
import {
    activateSubscription,
    getCurrentVendorSubscription,
    serializeSubscription,
} from '../../../services/billing/subscriptionState.service.js';

/** A plan is free only when it costs nothing in both currencies. */
const isFreePlan = (plan) =>
    Number(plan?.price_inr || 0) === 0 && Number(plan?.price_usd || 0) === 0;

/**
 * Establish that the caller may act on this vendor's onboarding.
 *
 * The onboarding routes carry no session by design — a vendor completing
 * registration has not logged in yet. Two proofs are accepted:
 *
 *   1. An authenticated vendor acting on their own account (renewal case).
 *   2. A verified `PhoneVerification` record for the vendor's mobile number,
 *      which is created by the registration OTP flow and expires with it.
 *
 * Without one of these, supplying any known vendor email was enough to act on
 * that vendor's account.
 */
export const assertOnboardingAuthority = async (req, vendor) => {
    if (!vendor) {
        throw new ApiError(404, 'Vendor not found.');
    }

    const callerId = req.user?.id || req.user?._id;
    if (callerId && String(callerId) === String(vendor._id)) return;

    // The account itself is verified through registration OTP
    if (vendor.phoneVerified && vendor.isVerified) return;

    // Or the caller has an active verified pre-registration phone record
    if (vendor.phoneE164 && (await isPhoneVerified(vendor.phoneE164))) return;

    throw new ApiError(
        403,
        'Verify your mobile number before continuing with onboarding.'
    );
};

export const rememberSubscribedVendor = async (vendor, planId) => {
    if (!vendor) return;
    const shouldNotifyAdmins = vendor.status === 'pending' && vendor.onboardingStatus !== 'subscription_active';
    vendor.selectedPlan = planId;
    vendor.onboardingStatus = 'subscription_active';
    vendor.onboardingCompletedAt = new Date();
    await vendor.save({ validateBeforeSave: false });

    // Consume the temporary onboarding verification authority record now that onboarding is complete
    if (vendor.phoneE164) {
        await clearPhoneVerification(vendor.phoneE164);
    }

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
    if (!vendor.isVerified) throw new ApiError(403, 'Your account is not verified. Please contact support.');

    // Prove the caller controls this mailbox before acting on the account.
    // This route has no session (a vendor mid-onboarding has not logged in yet),
    // so email control is the available proof — an authenticated vendor may
    // alternatively act on their own account.
    await assertOnboardingAuthority(req, vendor);

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

    // ── A priced plan is never activated here ────────────────────────────────
    // This endpoint previously activated any plan, including the most expensive,
    // with no payment and no authentication. Payment now happens at the gateway
    // and activation happens in the webhook / verify path.
    if (!isFreePlan(plan)) {
        return res.status(402).json(
            new ApiResponse(
                402,
                {
                    paymentRequired: true,
                    planId: String(plan._id),
                    plan: serializePlan(plan, vendor.country),
                },
                'This plan requires payment. Continue to checkout to activate your subscription.'
            )
        );
    }

    if (vendor.hasUsedTrial) {
        throw new ApiError(
            403,
            'You have already used your free trial. Please select a paid subscription plan.'
        );
    }

    const subscription = await activateSubscription({
        vendor,
        plan,
        activationSource: 'zero_price_plan',
    });

    // Notify admins for subscription activation during onboarding
    await rememberSubscribedVendor(vendor, plan._id);

    // Send onboarding completion email
    await notifyVendorOfOnboardingCompletion(vendor, plan, {
        amount: 0,
        currency: vendor.country === 'IN' ? 'INR' : 'USD',
        gateway: 'internal',
        status: 'paid',
        transactionId: `INT_${Date.now()}`,
        invoiceId: `${subscription.gateway_subscription_id}_invoice`,
        createdAt: new Date(),
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                gateway: 'internal',
                subscription: await serializeSubscription(subscription),
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

    // Neutral response for an unknown vendor: a 404 here turned this endpoint
    // into a vendor-existence oracle for any email address.
    if (!vendor) {
        return res.status(200).json(
            new ApiResponse(
                200,
                { gateway: 'internal', confirmed: false, subscription: null },
                'Subscription status unavailable.'
            )
        );
    }

    await assertOnboardingAuthority(req, vendor);

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
