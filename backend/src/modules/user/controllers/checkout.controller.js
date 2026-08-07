/**
 * CheckoutSessionController
 *
 * Enterprise checkout path:
 *   Customer → POST /api/checkout/session   → creates CheckoutSession
 *   Customer → POST /api/checkout/confirm   → runs OrderSplitterEngine
 *
 * The legacy POST /api/user/orders endpoint remains fully functional
 * for backward compatibility. New frontend uses this controller.
 */

import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';

const randomId = () => Math.random().toString(36).substring(2, 14).toUpperCase();

import CheckoutSession from '../../../models/CheckoutSession.model.js';
import { generateSessionId, splitAndCreateOrders } from '../../../services/checkout/OrderSplitterEngine.js';
import { validateCart } from '../../../services/checkout/CartValidationPipeline.js';
import { reserveStock, releaseReservation } from '../../../services/checkout/InventoryReservationService.js';
import Settings from '../../../models/Settings.model.js';
import Coupon from '../../../models/Coupon.model.js';

// ── POST /api/checkout/validate ───────────────────────────────────────────────
/**
 * Light-weight pre-checkout validation.
 * Frontend calls this on cart open and on Checkout page mount.
 * Returns per-item errors so the UI can highlight problematic items
 * without blocking the user from browsing.
 */
export const validateCartHandler = asyncHandler(async (req, res) => {
    const { items = [], customerLocation = null } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        throw new ApiError(400, 'Cart is empty.');
    }

    const result = await validateCart({ items, customerLocation });
    return res.status(200).json(new ApiResponse(200, result, 'Cart validation complete.'));
});

// ── POST /api/checkout/session ────────────────────────────────────────────────
/**
 * Create a CheckoutSession.
 * This is a lightweight pre-authorization step — no Orders are created yet.
 * Returns a sessionId that the payment gateway will use.
 */
export const createCheckoutSession = asyncHandler(async (req, res) => {
    const {
        items = [],
        shippingAddress,
        paymentMethod,
        couponCode,
        customerLocation = null,
        shippingOption = 'standard',
    } = req.body;

    const userId = req.user?.id || null;

    if (!Array.isArray(items) || items.length === 0) {
        throw new ApiError(400, 'Cart is empty.');
    }

    // 1. Validate payment method
    const paymentSettingsDoc = await Settings.findOne({ key: 'payment' }).lean();
    const paymentSettings = paymentSettingsDoc?.value || {};
    const normalized = paymentMethod === 'cash' ? 'cod' : paymentMethod;
    const methodAllowed = (() => {
        if (normalized === 'card'   && paymentSettings.cardEnabled   === false) return false;
        if (normalized === 'cod'    && paymentSettings.codEnabled    === false) return false;
        if (normalized === 'wallet' && paymentSettings.walletEnabled === false) return false;
        if (normalized === 'upi'    && paymentSettings.upiEnabled    === false) return false;
        return true;
    })();
    if (!methodAllowed) {
        throw new ApiError(400, `Payment method "${normalized}" is currently disabled.`);
    }

    // 2. Validate cart (lightweight — full validation runs again in the splitter)
    const validation = await validateCart({ items, customerLocation });
    if (!validation.valid) {
        return res.status(422).json(new ApiResponse(422, validation, 'Cart validation failed. Please resolve the issues before checking out.'));
    }

    // 3. Resolve coupon (optional)
    let resolvedCoupon = null;
    if (couponCode) {
        const couponDoc = await Coupon.findOne({
            code: String(couponCode).toUpperCase().trim(),
            isActive: true,
            $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }],
        }).lean();
        if (couponDoc) {
            const cartTotal = items.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
            // Simple percentage / fixed calc — authoritative calculation runs at order creation
            const discount = couponDoc.type === 'percent'
                ? Math.min(cartTotal * (couponDoc.discount / 100), couponDoc.maxDiscount || Infinity)
                : Math.min(couponDoc.discount, cartTotal);
            resolvedCoupon = {
                code:     couponDoc.code,
                type:     couponDoc.type,
                discount: Number(discount.toFixed(2)),
            };
        }
    }

    // 4. Idempotency guard
    const idempotencyKey = String(req.get('x-idempotency-key') || '').trim() || null;
    const idempotencyScope = userId ? `user:${userId}` : `anon:${randomId()}`;

    if (idempotencyKey && userId) {
        const existing = await CheckoutSession.findOne({
            idempotencyScope,
            idempotencyKey,
        }).lean();
        if (existing) {
            return res.status(200).json(
                new ApiResponse(200, { sessionId: existing.sessionId, idempotentReplay: true }, 'Duplicate session request.')
            );
        }
    }

    // 5. Compute grand summary (preliminary — locks in at confirm step)
    const subtotal = items.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);

    // 6. Create CheckoutSession document
    const sessionId = generateSessionId();
    const session = await CheckoutSession.create({
        sessionId,
        userId:        userId || null,
        paymentMethod: normalized,
        paymentStatus: 'pending',
        status:        'pending',
        shippingAddress,
        // gatewayOrderId is set by Checkout.jsx after Cashfree order creation
        summary: {
            subtotal,
            totalDiscount: resolvedCoupon?.discount || 0,
            grandTotal:    Math.max(0, subtotal - (resolvedCoupon?.discount || 0)),
        },
        idempotencyKey:   idempotencyKey || undefined,
        idempotencyScope: idempotencyKey ? idempotencyScope : undefined,
        metadata: {
            items,
            coupon:          resolvedCoupon,
            customerLocation,
            shippingOption,
        },
    });

    // 7. Reserve inventory (atomic, per-fulfillment-type timeouts)
    //    QC: 10 min | Retail: 15 min | Wholesale: 30 min
    //    On reservation failure, session is immediately deleted (no orphan).
    try {
        await reserveStock(items, session.sessionId);
    } catch (reservationErr) {
        // Clean up the session document we just created
        await CheckoutSession.deleteOne({ sessionId: session.sessionId }).catch(() => null);
        return res.status(422).json(
            new ApiResponse(422, {
                reservationFailed: true,
                details: reservationErr?.details || [],
            }, reservationErr?.message || 'Inventory reservation failed.')
        );
    }

    return res.status(201).json(
        new ApiResponse(201, {
            sessionId:        session.sessionId,
            paymentMethod:    normalized,
            coupon:           resolvedCoupon,
            summary:          session.summary,
            validationResult: validation,
        }, 'Checkout session created. Inventory reserved.')
    );
});

// ── POST /api/checkout/confirm ────────────────────────────────────
/**
 * Confirm a CheckoutSession — runs the OrderSplitterEngine.
 *
 * SECURITY: For online payments (card/upi), orders are created by the
 * Cashfree webhook handler — NOT by this endpoint. The frontend should
 * NOT call this for online payments.
 *
 * This endpoint is used ONLY for:
 *   1. COD (Cash on Delivery) — no payment gateway involved.
 *   2. Admin/internal order creation.
 *   3. Testing in development.
 *
 * The Cashfree webhook at POST /api/payments/cashfree/webhook handles
 * all card/UPI/netbanking/wallet payment confirmations server-side.
 */
export const confirmCheckout = asyncHandler(async (req, res) => {
    const { sessionId, gatewayOrderId } = req.body;
    const userId = req.user?.id || null;

    if (!sessionId) throw new ApiError(400, 'sessionId is required.');

    const session = await CheckoutSession.findOne({ sessionId }).lean();
    if (!session) throw new ApiError(404, `CheckoutSession "${sessionId}" not found.`);
    if (session.status === 'completed') {
        return res.status(200).json(
            new ApiResponse(200, { sessionId, orders: session.orderIds }, 'Already completed.')
        );
    }
    if (['failed', 'cancelled'].includes(session.status)) {
        throw new ApiError(409, `CheckoutSession is in "${session.status}" state and cannot be confirmed.`);
    }

    // For online payments, store the gatewayOrderId so the webhook can look up the session
    if (gatewayOrderId && session.paymentMethod !== 'cod') {
        await CheckoutSession.updateOne(
            { sessionId },
            { $set: { gatewayOrderId, paymentStatus: 'initiated' } }
        );
        // Webhook will complete the session — return session info for frontend polling
        return res.status(200).json(
            new ApiResponse(200, {
                sessionId,
                status:  'awaiting_payment',
                message: 'Session registered. Awaiting payment webhook confirmation.',
            }, 'Awaiting payment confirmation.')
        );
    }

    // COD path — create orders immediately
    const { items, coupon, customerLocation, shippingOption } = session.metadata || {};
    const { groups, orders } = await splitAndCreateOrders({
        sessionId:       session.sessionId,
        items:           items || [],
        shippingAddress: session.shippingAddress,
        paymentMethod:   session.paymentMethod,
        customerLocation,
        coupon,
        shippingAmount:  0,
        userId,
        settings:        { shippingOption },
    });

    await CheckoutSession.updateOne(
        { sessionId },
        { $set: { status: 'completed', completedAt: new Date() } }
    );

    return res.status(201).json(
        new ApiResponse(201, {
            sessionId,
            orderCount: orders.length,
            orders: orders.map((o) => ({
                orderId:         o.orderId,
                fulfillmentType: o.fulfillmentType,
                total:           o.total,
                status:          o.status,
            })),
        }, `${orders.length} order(s) created successfully.`)
    );
});

// ── GET /api/checkout/session/:sessionId ─────────────────────────────────────
export const getCheckoutSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user?.id || null;

    const session = await CheckoutSession.findOne({ sessionId })
        .select('-metadata -__v')
        .lean();

    if (!session) throw new ApiError(404, 'Checkout session not found.');
    if (userId && String(session.userId) !== String(userId)) {
        throw new ApiError(403, 'Access denied.');
    }

    return res.status(200).json(new ApiResponse(200, session, 'Checkout session retrieved.'));
});
