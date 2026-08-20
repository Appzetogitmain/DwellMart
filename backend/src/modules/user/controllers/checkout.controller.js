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
import logger from '../../../utils/logger.js';

const randomId = () => Math.random().toString(36).substring(2, 14).toUpperCase();

import CheckoutSession from '../../../models/CheckoutSession.model.js';
import { generateSessionId, splitAndCreateOrders, calculateCheckoutSessionSummary } from '../../../services/checkout/OrderSplitterEngine.js';
import { validateCart } from '../../../services/checkout/CartValidationPipeline.js';
import { reserveStock, releaseReservation } from '../../../services/checkout/InventoryReservationService.js';
import Settings from '../../../models/Settings.model.js';
import Coupon from '../../../models/Coupon.model.js';
import { incrementCouponUsage, evaluateCouponEligibility } from '../../../services/coupon.service.js';

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

    // 1b. Validate deliverability (destination pincode + COD eligibility)
    if (shippingAddress?.zipCode) {
        const { checkDeliverability } = await import('../../../services/shipping/deliverability.service.js');
        const deliverability = await checkDeliverability(shippingAddress.zipCode, {
            requiresCod: String(normalized || '').toLowerCase() === 'cod',
        });
        if (deliverability.blocking) {
            throw new ApiError(400, deliverability.message, [{
                code: 'DESTINATION_NOT_DELIVERABLE',
                pincode: shippingAddress.zipCode,
                status: deliverability.status,
            }]);
        }
    }

    // 2. Validate cart (lightweight — full validation runs again in the splitter)
    const validation = await validateCart({ items, customerLocation });
    if (!validation.valid) {
        const firstError = validation.items
            ?.flatMap((i) => i.errors)
            ?.filter(Boolean)[0]
            || validation.globalErrors?.[0]
            || 'Cart validation failed. Please resolve the issues before checking out.';
        // Log the SHAPE of the failure, not the cart. The previous
        // `JSON.stringify(validation)` wrote the customer's full item list into
        // log aggregation on every failed checkout.
        logger.forRequest(req).warn('CheckoutSession validation failed', {
            itemCount: items.length,
            failedItemCount: validation.items?.filter((i) => i.errors?.length).length || 0,
            globalErrorCount: validation.globalErrors?.length || 0,
            firstError,
        });
        return res.status(422).json(new ApiResponse(422, validation, firstError));
    }

    // 3. Resolve coupon (optional)
    let resolvedCoupon = null;
    // Why a requested coupon was not applied, so the customer is told rather
    // than silently charged a higher total than the cart previewed.
    let couponRejectionReason = null;
    if (couponCode) {
        const couponDoc = await Coupon.findOne({
            code: String(couponCode).toUpperCase().trim(),
            isActive: true,
        }).lean();
        if (couponDoc) {
            // Rules come from the shared evaluator so this agrees with the
            // public validator — including the per-user cap, which did not
            // exist anywhere before. The min-order check runs below because the
            // cart total is not yet known at this point.
            const preVerdict = await evaluateCouponEligibility(couponDoc, {
                cartTotal: Number.MAX_SAFE_INTEGER,
                userId,
            });
            const couponError = preVerdict.ok ? null : preVerdict.reason;
            if (couponError) couponRejectionReason = couponError;

            if (!couponError) {
                const Product = (await import('../../../models/Product.model.js')).default;
                const { resolveVariantSelection } = await import('../../../services/pricingEngine.service.js');
                const productIds = items.map((i) => i.productId || i.id).filter(Boolean);
                const rawProducts = await Product.find({ _id: { $in: productIds } }).lean();
                const productMap = new Map(rawProducts.map((p) => [String(p._id), p]));

                const cartTotal = items.reduce((s, i) => {
                    const product = productMap.get(String(i.productId || i.id || ''));
                    const { price: unitPrice } = resolveVariantSelection(product || {}, i.variant);
                    return s + unitPrice * Number(i.quantity || 1);
                }, 0);

                if (cartTotal < (couponDoc.minOrderValue || 0)) {
                    // Not applied — but the customer is told why. Dropping it
                    // silently meant they saw a total higher than the cart
                    // previewed with no explanation.
                    couponRejectionReason = `Minimum order value for this coupon is ₹${couponDoc.minOrderValue}.`;
                    console.warn(`[Checkout] Coupon ${couponDoc.code} minOrderValue not met (cart=${cartTotal}, min=${couponDoc.minOrderValue})`);
                } else {
                    // P1-03 FIX: Use correct schema fields: type='percentage'/'fixed'/'freeship', value=amount
                    let discount = 0;
                    if (couponDoc.type === 'percentage') {
                        discount = cartTotal * (couponDoc.value / 100);
                        if (couponDoc.maxDiscount) discount = Math.min(discount, couponDoc.maxDiscount);
                    } else if (couponDoc.type === 'fixed') {
                        discount = Math.min(couponDoc.value, cartTotal);
                    } else if (couponDoc.type === 'freeship') {
                        discount = 0; // handled at shipping level
                    }
                    resolvedCoupon = {
                        code:     couponDoc.code,
                        type:     couponDoc.type,
                        discount: Number(discount.toFixed(2)),
                    };
                }
            }
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

    // 5. Compute full authoritative financial summary (reuses OrderSplitterEngine calculation)
    const financialSummary = await calculateCheckoutSessionSummary({
        items,
        shippingAddress,
        customerLocation,
        coupon: resolvedCoupon,
        shippingOption,
    });

    // 6. Create CheckoutSession document
    const sessionId = generateSessionId();
    const session = await CheckoutSession.create({
        sessionId,
        userId:        userId || null,
        paymentMethod: normalized,
        paymentStatus: 'pending',
        status:        'pending',
        shippingAddress,
        summary:       financialSummary,
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
            // Present when a coupon was requested but not applied. The customer
            // was previously charged the higher total with no explanation.
            couponRejectionReason,
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

    if (session.userId) {
        if (!userId) {
            throw new ApiError(401, 'Authentication required to confirm this checkout session.');
        }
        if (String(session.userId) !== String(userId)) {
            throw new ApiError(403, 'Access denied. You do not own this checkout session.');
        }
    }
    if (session.status === 'completed') {
        return res.status(200).json(
            new ApiResponse(200, { sessionId, orders: session.orderIds }, 'Already completed.')
        );
    }
    if (['failed', 'cancelled'].includes(session.status)) {
        throw new ApiError(409, `CheckoutSession is in "${session.status}" state and cannot be confirmed.`);
    }

    // For online payments, orders must be confirmed via Cashfree verify/webhook AFTER payment is captured
    if (session.paymentMethod !== 'cod' && session.paymentStatus !== 'paid') {
        throw new ApiError(400, 'Online payment is pending. Orders cannot be created until payment is verified.');
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

    // P1-04 FIX: Increment coupon usage count after successful order creation
    if (coupon?.code) {
        incrementCouponUsage(coupon.code, { userId, orderId: orders[0]?._id, checkoutSessionId: sessionId, amount: coupon.discount }).catch((err) =>
            console.error('[Checkout] Failed to increment coupon usage:', err?.message)
        );
    }

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
