import mongoose from 'mongoose';
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

/**
 * Reverse coupon consumption on order cancellation.
 *
 * Idempotently removes or reverses CouponUsage and decrements Coupon.usedCount.
 * For multi-order splits, only reverses when all sibling orders in the
 * checkout session are cancelled.
 *
 * @param {string|mongoose.Types.ObjectId} codeOrId
 * @param {{
 *   userId?: string|mongoose.Types.ObjectId,
 *   orderId?: string|mongoose.Types.ObjectId,
 *   checkoutSessionId?: string|mongoose.Types.ObjectId,
 *   isLegacy?: boolean,
 *   isRetry?: boolean
 * }} [context]
 * @param {{ session?: import('mongoose').ClientSession }} [options]
 * @returns {Promise<{ reversed: boolean, reason?: string, removedUsage?: boolean, decremented?: boolean }>}
 */
export const reverseCouponUsage = async (codeOrId, context = {}, options = {}) => {
    if (!codeOrId) return { reversed: false, reason: 'NO_CODE' };

    const session = options.session || null;

    // 1. Resolve coupon (handles both code and _id, active and inactive)
    let couponQuery = Coupon.findOne({ code: String(codeOrId).toUpperCase() });
    if (session) couponQuery = couponQuery.session(session);
    let coupon = await couponQuery;

    if (!coupon && String(codeOrId).match(/^[a-fA-F0-9]{24}$/)) {
        let byIdQuery = Coupon.findById(codeOrId);
        if (session) byIdQuery = byIdQuery.session(session);
        coupon = await byIdQuery;
    }

    // 2. Resolve checkout session (if provided) and check for active sibling orders
    let sessionObjectId = null;
    let sessionCode = null;
    let sessionOrderIds = [];

    if (context.checkoutSessionId) {
        if (mongoose.isValidObjectId(context.checkoutSessionId)) {
            sessionObjectId = new mongoose.Types.ObjectId(String(context.checkoutSessionId));
        } else {
            sessionCode = String(context.checkoutSessionId);
        }

        try {
            const { default: CheckoutSession } = await import('../models/CheckoutSession.model.js');
            let csQuery = sessionObjectId
                ? CheckoutSession.findById(sessionObjectId)
                : CheckoutSession.findOne({ sessionId: sessionCode });
            if (session) csQuery = csQuery.session(session);
            const csDoc = await csQuery.lean();
            if (csDoc) {
                sessionObjectId = csDoc._id;
                sessionCode = csDoc.sessionId;
                if (Array.isArray(csDoc.orderIds)) {
                    sessionOrderIds = csDoc.orderIds;
                }
            }
        } catch {
            // CheckoutSession lookup fallback
        }

        if (sessionObjectId) {
            const { default: Order } = await import('../models/Order.model.js');
            let siblingQuery = Order.exists({
                checkoutSessionId: sessionObjectId,
                _id: { $ne: context.orderId },
                status: { $ne: 'cancelled' },
            });
            if (session) siblingQuery = siblingQuery.session(session);
            const hasActiveSiblings = await siblingQuery;

            if (hasActiveSiblings) {
                return { reversed: false, reason: 'ACTIVE_SIBLING_ORDERS_EXIST' };
            }
        }
    }

    // 3. Remove CouponUsage record idempotently
    let removedUsage = false;
    const hasUsageTarget = Boolean(context.orderId || context.checkoutSessionId);
    if (hasUsageTarget) {
        const usageFilters = [];
        if (context.orderId) {
            usageFilters.push({ orderId: context.orderId });
        }
        if (sessionCode) {
            usageFilters.push({ checkoutSessionId: sessionCode });
        }
        if (sessionObjectId) {
            usageFilters.push({ checkoutSessionId: String(sessionObjectId) });
        }
        if (context.checkoutSessionId && String(context.checkoutSessionId) !== sessionCode) {
            usageFilters.push({ checkoutSessionId: String(context.checkoutSessionId) });
        }
        if (sessionOrderIds.length > 0) {
            usageFilters.push({ orderId: { $in: sessionOrderIds } });
        }

        const couponFilter = coupon ? { couponId: coupon._id } : { code: String(codeOrId).toUpperCase() };
        const deleteQuery = {
            ...couponFilter,
            $or: usageFilters,
        };
        if (context.userId) {
            deleteQuery.userId = context.userId;
        }

        const deleteResult = await CouponUsage.deleteMany(
            deleteQuery,
            session ? { session } : {}
        );
        removedUsage = (deleteResult?.deletedCount || 0) > 0;
    }

    // 4. Decrement global usedCount (guarded with usedCount > 0)
    let decremented = false;
    if (coupon) {
        // Idempotency rule:
        // - If usage was targeted (orderId or checkoutSessionId provided), decrement ONLY if
        //   usage was actually found and removed (or if explicitly marked legacy without usage row).
        // - If no usage was targeted (direct code decrement), decrement if not marked retry.
        const shouldDecrement = removedUsage || (!hasUsageTarget && !context.isRetry) || (context.isLegacy && !context.isRetry);
        if (shouldDecrement) {
            const updateRes = await Coupon.updateOne(
                { _id: coupon._id, usedCount: { $gt: 0 } },
                { $inc: { usedCount: -1 } },
                session ? { session } : {}
            );
            decremented = (updateRes?.modifiedCount || 0) > 0;
        }
    }

    return {
        reversed: removedUsage || decremented,
        removedUsage,
        decremented,
        ...(coupon ? {} : { reason: 'COUPON_NOT_FOUND' }),
    };
};

