import ApiError from '../../utils/ApiError.js';
import Payment from '../../models/Payment.model.js';
import SubscriptionPlan from '../../models/SubscriptionPlan.model.js';
import Vendor from '../../models/Vendor.model.js';
import VendorSubscription from '../../models/VendorSubscription.model.js';
import { addPlanIntervalToDate, serializePlan } from './plan.service.js';

const STATUS_PRIORITY = {
    active: 4,
    past_due: 3,
    trialing: 2,
    incomplete: 1,
    canceled: 0,
};

const upsertSubscriptionRecord = async ({
    vendorId,
    planId,
    gateway = 'internal',
    gatewayCustomerId,
    gatewaySubscriptionId,
    status,
    externalStatus,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    latestPaymentStatus,
    metadata,
}) => {
    let subscription = await VendorSubscription.findOne({ vendor: vendorId });
    if (!subscription) {
        subscription = new VendorSubscription({ vendor: vendorId });
    }
    subscription.plan = planId;
    subscription.gateway = gateway;
    subscription.gateway_customer_id = gatewayCustomerId;
    subscription.gateway_subscription_id = gatewaySubscriptionId;
    subscription.status = status;
    subscription.external_status = externalStatus;
    subscription.current_period_start = currentPeriodStart;
    subscription.current_period_end = currentPeriodEnd;
    subscription.cancel_at_period_end = cancelAtPeriodEnd;
    subscription.latest_payment_status = latestPaymentStatus;
    subscription.metadata = metadata;
    await subscription.save();
    return subscription;
};

const upsertPaymentRecord = async ({
    vendorId,
    subscriptionId,
    gateway = 'internal',
    amount,
    currency,
    status,
    invoiceId,
    raw,
}) => {
    const payment = new Payment({
        vendor: vendorId,
        subscription: subscriptionId,
        gateway,
        amount,
        currency,
        status,
        invoice_id: invoiceId,
        raw,
    });
    await payment.save();
    return payment;
};

export const getCurrentVendorSubscription = async (vendorId) => {
    const subscription = await VendorSubscription.findOne({ vendor: vendorId }).populate('plan');
    if (!subscription) return null;
    return serializeSubscription(subscription);
};

export const activateInternalSubscription = async ({ vendor, plan, gateway = 'internal' }) => {
    const now = new Date();
    const currentPeriodEnd = addPlanIntervalToDate(now, plan);
    const isIndia = String(vendor?.country || '').toLowerCase().includes('india') || String(vendor?.country || '').toLowerCase() === 'in';
    const currency = isIndia ? 'INR' : 'USD';
    const amount = isIndia ? Number(plan?.price_inr || 0) : Number(plan?.price_usd || 0);

    const subscription = await upsertSubscriptionRecord({
        vendorId: vendor._id,
        planId: plan._id,
        gateway: 'internal',
        gatewayCustomerId: null,
        gatewaySubscriptionId: `internal_${vendor._id}_${plan._id}_${Date.now()}`,
        status: 'active',
        externalStatus: 'internal_active',
        currentPeriodStart: now,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        latestPaymentStatus: 'paid',
        metadata: { internal: true },
    });

    await upsertPaymentRecord({
        vendorId: vendor._id,
        subscriptionId: subscription._id,
        gateway: 'internal',
        amount,
        currency,
        status: 'paid',
        invoiceId: `${subscription.gateway_subscription_id}_invoice`,
        raw: { internal: true },
    });

    vendor.selectedPlan = plan._id;
    vendor.onboardingStatus = 'subscription_active';
    vendor.onboardingCompletedAt = new Date();
    await vendor.save({ validateBeforeSave: false });

    return subscription;
};

export const serializeSubscription = async (subscriptionDoc) => {
    if (!subscriptionDoc) return null;

    const subscription = typeof subscriptionDoc.populate === 'function'
        ? await subscriptionDoc.populate('plan')
        : subscriptionDoc;
    const raw = typeof subscription.toObject === 'function'
        ? subscription.toObject({ virtuals: true })
        : { ...subscription };

    return {
        ...raw,
        plan: serializePlan(raw.plan),
        isActive: raw.status === 'active'
            && raw.current_period_end
            && new Date(raw.current_period_end) > new Date(),
    };
};

export const ensureVendorCanChangePlan = async ({ vendor, plan }) => {
    if (!vendor) {
        throw new ApiError(404, 'Vendor not found.');
    }

    if (!plan?.isActive) {
        throw new ApiError(400, 'Selected plan is not available.');
    }
};
