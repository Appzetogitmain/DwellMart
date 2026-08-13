import Coupon from '../models/Coupon.model.js';
import CouponUsage from '../models/CouponUsage.model.js';
import ApiError from '../utils/ApiError.js';

/**
 * Single coupon eligibility evaluator.
 *
 * Eligibility was previously decided in three places with three slightly
 * different rule sets — the public validator, checkout-session creation and
 * legacy order placement — so a coupon could be accepted at validation and
 * rejected at checkout. All three now call this.
 *
 * @returns {Promise<{ ok: boolean, reason?: string, code?: string }>}
 */
export const evaluateCouponEligibility = async (coupon, { cartTotal, userId = null }) => {
    if (!coupon) return { ok: false, reason: 'Invalid coupon code.', code: 'COUPON_INVALID' };
    if (!coupon.isActive) return { ok: false, reason: 'Invalid coupon code.', code: 'COUPON_INVALID' };

    const now = Date.now();
    if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) {
        return { ok: false, reason: 'Coupon is not active yet.', code: 'COUPON_NOT_STARTED' };
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) {
        return { ok: false, reason: 'Coupon has expired.', code: 'COUPON_EXPIRED' };
    }
    if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) {
        return { ok: false, reason: 'Coupon usage limit reached.', code: 'COUPON_EXHAUSTED' };
    }
    if (Number(cartTotal) < Number(coupon.minOrderValue || 0)) {
        return {
            ok: false,
            reason: `Minimum order value for this coupon is ₹${coupon.minOrderValue}.`,
            code: 'COUPON_MIN_ORDER',
        };
    }

    // Per-user cap. Without this a single customer could exhaust an entire
    // promotional budget on their own orders.
    const perUserLimit = Number(coupon.perUserLimit || 0);
    if (perUserLimit > 0) {
        if (!userId) {
            return {
                ok: false,
                reason: 'Please sign in to use this coupon.',
                code: 'COUPON_REQUIRES_LOGIN',
            };
        }
        const used = await CouponUsage.countDocuments({ couponId: coupon._id, userId });
        if (used >= perUserLimit) {
            return {
                ok: false,
                reason: perUserLimit === 1
                    ? 'You have already used this coupon.'
                    : `You have already used this coupon ${perUserLimit} times.`,
                code: 'COUPON_USER_LIMIT',
            };
        }
    }

    if (coupon.firstOrderOnly && userId) {
        const { default: Order } = await import('../models/Order.model.js');
        const priorOrders = await Order.countDocuments({ userId, status: { $ne: 'cancelled' } });
        if (priorOrders > 0) {
            return {
                ok: false,
                reason: 'This coupon is only valid on your first order.',
                code: 'COUPON_FIRST_ORDER_ONLY',
            };
        }
    }

    return { ok: true };
};

/** Discount for an already-eligible coupon. */
export const computeCouponDiscount = (coupon, cartTotal) => {
    let discount = 0;
    if (coupon.type === 'percentage') {
        discount = (Number(cartTotal) * Number(coupon.value)) / 100;
        if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
    } else if (coupon.type === 'fixed') {
        discount = Number(coupon.value);
    }
    // A discount can never exceed the goods it applies to.
    discount = Math.min(discount, Number(cartTotal));
    return parseFloat(Math.max(0, discount).toFixed(2));
};

/**
 * Validate a coupon code against a cart total.
 * @param {string} code
 * @param {number} cartTotal
 * @param {{ userId?: string }} [context]
 */
export const validateCoupon = async (code, cartTotal, context = {}) => {
    const coupon = await Coupon.findOne({ code: String(code).toUpperCase(), isActive: true });

    const verdict = await evaluateCouponEligibility(coupon, {
        cartTotal,
        userId: context.userId || null,
    });
    if (!verdict.ok) throw new ApiError(400, verdict.reason);

    return { coupon, discount: computeCouponDiscount(coupon, cartTotal) };
};

/**
 * Record coupon consumption.
 *
 * Writes a per-user usage row alongside the global counter. The row is keyed on
 * (coupon, order) so the three call sites that increment usage — COD confirm,
 * payment verify and webhook — cannot triple-count the same order.
 *
 * @param {string} codeOrId
 * @param {{ userId?: string, orderId?: string, checkoutSessionId?: string, amount?: number }} [context]
 */
export const incrementCouponUsage = async (codeOrId, context = {}) => {
    if (!codeOrId) return;

    let coupon = await Coupon.findOne({ code: String(codeOrId).toUpperCase() });
    if (!coupon && String(codeOrId).match(/^[a-fA-F0-9]{24}$/)) {
        coupon = await Coupon.findById(codeOrId);
    }
    if (!coupon) return;

    // Record the per-user usage first: its unique index is what makes the whole
    // operation idempotent. If it collides, the counter must NOT be incremented
    // again.
    if (context.userId && context.orderId) {
        try {
            await CouponUsage.create({
                couponId: coupon._id,
                code: coupon.code,
                userId: context.userId,
                orderId: context.orderId,
                checkoutSessionId: context.checkoutSessionId || null,
                amount: Number(context.amount || 0),
            });
        } catch (err) {
            if (err?.code === 11000) return; // already counted for this order
            throw err;
        }
    }

    await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } });
};
