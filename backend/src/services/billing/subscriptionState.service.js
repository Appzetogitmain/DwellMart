import ApiError from '../../utils/ApiError.js';
import Payment from '../../models/Payment.model.js';
import SubscriptionPlan from '../../models/SubscriptionPlan.model.js';
import Vendor from '../../models/Vendor.model.js';
import VendorSubscription from '../../models/VendorSubscription.model.js';
import { addPlanIntervalToDate, serializePlan } from './plan.service.js';
import { cacheWrap, cacheInvalidate } from '../../utils/ttlCache.js';

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
    activationSource,
    gatewayPaymentRef,
    grantedBy,
    grantReason,
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
    if (activationSource !== undefined) subscription.activationSource = activationSource;
    if (gatewayPaymentRef !== undefined) subscription.gatewayPaymentRef = gatewayPaymentRef;
    if (grantedBy !== undefined) subscription.grantedBy = grantedBy;
    if (grantReason !== undefined) subscription.grantReason = grantReason;
    subscription.metadata = metadata;
    await subscription.save();
    // A cached subscription must never outlive a state change: this value gates
    // vendor write access, so a stale entry would let a cancelled vendor keep
    // writing until the TTL expired.
    cacheInvalidate(subscriptionCacheKey(vendorId));
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

/**
 * Cache key is per vendor — a subscription is tenant-scoped state and must
 * never be served across vendors.
 */
const subscriptionCacheKey = (vendorId) => `subscription:${String(vendorId)}`;

/**
 * Short TTL, deliberately.
 *
 * `checkSubscription` runs this on every vendor request, so it was one database
 * round-trip per request. But this value gates write access: an expired or
 * revoked subscription must stop authorising writes promptly, so the window is
 * kept small and every state change invalidates explicitly. A long TTL here
 * would let a cancelled vendor keep writing.
 */
const SUBSCRIPTION_TTL_MS = 15_000;

export const invalidateVendorSubscription = (vendorId) =>
    cacheInvalidate(subscriptionCacheKey(vendorId));

export const getCurrentVendorSubscription = async (vendorId) =>
    cacheWrap(subscriptionCacheKey(vendorId), SUBSCRIPTION_TTL_MS, async () => {
        const subscription = await VendorSubscription.findOne({ vendor: vendorId }).populate('plan');
        if (!subscription) return null;
        return serializeSubscription(subscription);
    });

/** Activation sources that assert money actually moved through the gateway. */
const GATEWAY_ACTIVATION_SOURCES = new Set(['gateway_verified', 'gateway_webhook']);

const VALID_ACTIVATION_SOURCES = new Set([
    'gateway_verified',
    'gateway_webhook',
    'zero_price_plan',
    'admin_grant',
]);

/**
 * A plan is free only when it costs nothing in BOTH currencies.
 *
 * Deliberately stricter than "costs nothing in this vendor's currency": a plan
 * priced at ₹0 / $49 must not be activatable for free by setting the vendor's
 * country to India. Matches `serializePlan().isFree` so there is one definition
 * of "free" in the codebase, not two.
 */
const isZeroPricePlan = (plan) =>
    Number(plan?.price_inr || 0) === 0 && Number(plan?.price_usd || 0) === 0;

/**
 * Activate a vendor subscription.
 *
 * Every caller must state HOW the activation was authorised. This is the choke
 * point: previously this function unconditionally wrote `status: 'active'` and
 * a `Payment{status:'paid'}` record with no payment check, and it was reachable
 * from an unauthenticated route — so any verified vendor email could be given
 * the most expensive plan for free.
 *
 * @param {object}  params
 * @param {object}  params.vendor            Vendor document (mutated + saved)
 * @param {object}  params.plan              SubscriptionPlan document
 * @param {string}  params.activationSource  gateway_verified | gateway_webhook | zero_price_plan | admin_grant
 * @param {string} [params.gatewayPaymentRef] Required for gateway sources
 * @param {string} [params.actorId]          Admin id, required for admin_grant
 * @param {string} [params.reason]           Required for admin_grant
 */
export const activateSubscription = async ({
    vendor,
    plan,
    activationSource,
    gatewayPaymentRef = null,
    actorId = null,
    reason = '',
}) => {
    if (!vendor?._id) throw new ApiError(400, 'Vendor is required to activate a subscription.');
    if (!plan?._id) throw new ApiError(400, 'Plan is required to activate a subscription.');

    if (!VALID_ACTIVATION_SOURCES.has(activationSource)) {
        throw new ApiError(
            500,
            `Subscription activation refused: unknown activationSource "${activationSource}".`
        );
    }

    // ── The guard that closes the free-subscription bypass ───────────────────
    if (GATEWAY_ACTIVATION_SOURCES.has(activationSource) && !String(gatewayPaymentRef || '').trim()) {
        throw new ApiError(
            500,
            'Subscription activation refused: a gateway activation requires a payment reference.'
        );
    }

    if (activationSource === 'zero_price_plan' && !isZeroPricePlan(plan)) {
        throw new ApiError(
            402,
            'This plan requires payment. Complete checkout to activate your subscription.'
        );
    }

    if (activationSource === 'admin_grant') {
        if (!actorId) throw new ApiError(500, 'Subscription grant refused: an acting admin is required.');
        if (String(reason || '').trim().length < 10) {
            throw new ApiError(400, 'A grant reason of at least 10 characters is required.');
        }
    }

    const now = new Date();
    const currentPeriodEnd = addPlanIntervalToDate(now, plan);
    const isIndia = String(vendor?.country || '').toLowerCase().includes('india') || String(vendor?.country || '').toLowerCase() === 'in';
    const currency = isIndia ? 'INR' : 'USD';
    const amount = isIndia ? Number(plan?.price_inr || 0) : Number(plan?.price_usd || 0);

    const isGatewayPaid = GATEWAY_ACTIVATION_SOURCES.has(activationSource);
    const gatewayName = isGatewayPaid ? 'cashfree' : 'internal';

    const subscription = await upsertSubscriptionRecord({
        vendorId: vendor._id,
        planId: plan._id,
        gateway: gatewayName,
        gatewayCustomerId: null,
        gatewaySubscriptionId: gatewayPaymentRef
            ? `${gatewayName}_${vendor._id}_${plan._id}_${gatewayPaymentRef}`
            : `${gatewayName}_${vendor._id}_${plan._id}_${Date.now()}`,
        status: 'active',
        externalStatus: `${activationSource}_active`,
        currentPeriodStart: now,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        // Only a gateway-confirmed activation may claim the money was paid.
        // A zero-price plan is paid in the sense that nothing is owed; an
        // admin grant is explicitly not paid.
        latestPaymentStatus: isGatewayPaid || activationSource === 'zero_price_plan' ? 'paid' : 'pending',
        activationSource,
        gatewayPaymentRef: gatewayPaymentRef || null,
        grantedBy: activationSource === 'admin_grant' ? actorId : null,
        grantReason: activationSource === 'admin_grant' ? String(reason).trim() : '',
        metadata: { activationSource },
    });

    // A Payment record asserts money moved. Only write one when it did, or when
    // the amount owed was genuinely zero. An admin grant records no payment.
    if (isGatewayPaid || activationSource === 'zero_price_plan') {
        await upsertPaymentRecord({
            vendorId: vendor._id,
            subscriptionId: subscription._id,
            gateway: gatewayName,
            amount: activationSource === 'zero_price_plan' ? 0 : amount,
            currency,
            status: 'paid',
            invoiceId: `${subscription.gateway_subscription_id}_invoice`,
            raw: { activationSource, gatewayPaymentRef },
        });
    }

    vendor.selectedPlan = plan._id;
    vendor.onboardingStatus = 'subscription_active';
    vendor.onboardingCompletedAt = new Date();
    await vendor.save({ validateBeforeSave: false });

    return subscription;
};

/**
 * @deprecated Superseded by `activateSubscription`, which requires an explicit
 * activation source. Retained only so an un-migrated call site fails loudly
 * instead of silently granting a paid plan.
 */
export const activateInternalSubscription = async () => {
    throw new ApiError(
        500,
        'activateInternalSubscription has been removed. Use activateSubscription({ activationSource, gatewayPaymentRef }).'
    );
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
