import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Order from '../../../models/Order.model.js';
import Vendor from '../../../models/Vendor.model.js';
import SubscriptionPlan from '../../../models/SubscriptionPlan.model.js';
import Payment from '../../../models/Payment.model.js';
import { CheckoutSession } from '../../../models/CheckoutSession.model.js';
import { claimCheckoutSessionForProcessing, releaseClaimOnError } from '../../../services/checkout/CheckoutSessionClaimService.js';
import {
    createRazorpayOrder,
    fetchRazorpayOrder,
    fetchRazorpayPayment,
    getRazorpayCredentials,
    verifyRazorpayPaymentSignature,
    verifyRazorpayWebhookSignature,
} from '../../../services/billing/razorpay.service.js';
import { activateSubscription } from '../../../services/billing/subscriptionState.service.js';
import { roundMoney } from '../../../services/PriceReconciliationService.js';
import { incrementCouponUsage } from '../../../services/coupon.service.js';
import {
    assertOnboardingAuthority,
    rememberSubscribedVendor,
} from '../../vendor/controllers/billing.controller.js';

const checkSessionOwnership = (session, reqUser) => {
    if (session.userId) {
        const callerUserId = reqUser?._id || reqUser?.id;
        if (!callerUserId) {
            throw new ApiError(401, 'Authentication required to access this payment session.');
        }
        if (String(session.userId) !== String(callerUserId)) {
            throw new ApiError(403, 'Access denied. You do not own this checkout session.');
        }
    }
};

const sanitizeCheckoutSessionResponse = (checkoutSession, orders = [], isOwner = false) => {
    if (isOwner) {
        return { checkoutSession, orders };
    }
    const sanitizedSession = {
        sessionId: checkoutSession.sessionId,
        status: checkoutSession.status,
        paymentStatus: checkoutSession.paymentStatus,
        paymentMethod: checkoutSession.paymentMethod,
        summary: checkoutSession.summary || { grandTotal: checkoutSession.grandTotal },
        completedAt: checkoutSession.completedAt,
    };
    const sanitizedOrders = (orders || []).map((o) => ({
        orderId: o.orderId,
        fulfillmentType: o.fulfillmentType,
        status: o.status,
        total: o.total,
        itemCount: o.items?.length || 0,
    }));
    return { checkoutSession: sanitizedSession, orders: sanitizedOrders };
};

/**
 * POST /api/payments/razorpay/session
 * Initiates a Razorpay payment order for CheckoutSession or Vendor Subscription.
 */
export const createPaymentSession = asyncHandler(async (req, res) => {
    const { orderId, subscriptionPlanId, email, checkoutSessionId, sessionId } = req.body;
    const creds = await getRazorpayCredentials();

    // ── Source 1: Enterprise CheckoutSession ───────────────────────────────────
    const targetSessionId = checkoutSessionId || sessionId;
    if (targetSessionId) {
        const session = await CheckoutSession.findOne({
            $or: [
                { sessionId: targetSessionId },
                ...(mongoose.isValidObjectId(targetSessionId) ? [{ _id: targetSessionId }] : []),
                { gatewayOrderId: targetSessionId },
            ],
        });

        if (!session) {
            throw new ApiError(404, 'CheckoutSession not found.');
        }

        checkSessionOwnership(session, req.user);

        if (session.paymentStatus === 'paid') {
            return res.status(200).json(
                new ApiResponse(200, { alreadyPaid: true, session }, 'CheckoutSession is already paid.')
            );
        }

        const amount = roundMoney(session.summary?.grandTotal ?? session.grandTotal ?? 0);
        if (amount <= 0) {
            throw new ApiError(400, 'Invalid payment amount for CheckoutSession.');
        }

        const rzpOrder = await createRazorpayOrder({
            amount,
            currency: 'INR',
            receipt: session.sessionId,
            notes: {
                sessionId: session.sessionId,
                source: 'checkout_session',
                userId: String(session.userId || req.user?._id || ''),
            },
        });

        session.gatewayOrderId = rzpOrder.orderId;
        session.gatewaySessionId = rzpOrder.orderId;
        session.metadata = {
            ...(session.metadata || {}),
            gateway: 'razorpay',
            razorpayOrderId: rzpOrder.orderId,
        };
        await session.save();

        return res.status(200).json(
            new ApiResponse(200, {
                razorpayOrderId: rzpOrder.orderId,
                keyId: rzpOrder.keyId,
                amount: rzpOrder.amount,
                amountInPaise: rzpOrder.amountInPaise,
                currency: rzpOrder.currency,
                orderId: session.sessionId,
                checkoutSessionId: session.sessionId,
                environment: rzpOrder.environment,
                customer: {
                    name: session.shippingAddress?.name || session.guestInfo?.name || req.user?.name || '',
                    email: session.shippingAddress?.email || session.guestInfo?.email || req.user?.email || email || '',
                    phone: session.shippingAddress?.phone || session.guestInfo?.phone || req.user?.phone || '',
                },
            }, 'Razorpay checkout session created.')
        );
    }

    // ── Source 2: Legacy Single Order ──────────────────────────────────────────
    if (orderId && !orderId.startsWith('sub_')) {
        const order = await Order.findOne({ orderId });
        if (!order) {
            throw new ApiError(404, 'Order not found.');
        }

        if (order.paymentStatus === 'paid') {
            return res.status(200).json(
                new ApiResponse(200, { alreadyPaid: true, order }, 'Order is already paid.')
            );
        }

        const rzpOrder = await createRazorpayOrder({
            amount: order.total,
            currency: 'INR',
            receipt: order.orderId,
            notes: {
                orderId: order.orderId,
                source: 'legacy_order',
            },
        });

        return res.status(200).json(
            new ApiResponse(200, {
                razorpayOrderId: rzpOrder.orderId,
                keyId: rzpOrder.keyId,
                amount: rzpOrder.amount,
                amountInPaise: rzpOrder.amountInPaise,
                currency: rzpOrder.currency,
                orderId: order.orderId,
                environment: rzpOrder.environment,
                customer: {
                    name: order.shippingAddress?.name || req.user?.name || '',
                    email: req.user?.email || email || '',
                    phone: order.shippingAddress?.phone || '',
                },
            }, 'Razorpay payment session created.')
        );
    }

    // ── Source 3: Vendor Subscription ──────────────────────────────────────────
    if (subscriptionPlanId) {
        let vendorEmail = email ? email.toLowerCase().trim() : (req.user?.email ? req.user.email.toLowerCase().trim() : null);
        let vendor = null;
        if (vendorEmail) {
            vendor = await Vendor.findOne({ email: vendorEmail });
        }
        if (!vendor && (req.user?._id || req.user?.id)) {
            vendor = await Vendor.findById(req.user._id || req.user.id);
        }
        if (!vendor) {
            throw new ApiError(404, 'Vendor profile not found. Please verify your email.');
        }

        assertOnboardingAuthority(vendor, req.user);

        const plan = await SubscriptionPlan.findById(subscriptionPlanId);
        if (!plan) {
            throw new ApiError(404, 'Subscription plan not found.');
        }

        const amount = roundMoney(plan.price_inr);
        const subReceipt = `sub_${vendor._id}_${plan._id}_${Date.now()}`;

        const isFreePlan = Number(plan.price_inr || 0) === 0 && Number(plan.price_usd || 0) === 0;

        if (isFreePlan) {
            if (vendor.hasUsedTrial) {
                throw new ApiError(403, 'You have already used your free trial. Please select a paid subscription plan.');
            }
            const subscription = await activateSubscription({
                vendor,
                plan,
                activationSource: 'zero_price_plan',
            });
            await rememberSubscribedVendor(vendor, plan._id);
            return res.status(200).json(
                new ApiResponse(200, { isFree: true, subscription }, 'Free plan activated successfully.')
            );
        }

        const rzpOrder = await createRazorpayOrder({
            amount,
            currency: 'INR',
            receipt: subReceipt,
            notes: {
                vendorId: String(vendor._id),
                planId: String(plan._id),
                receipt: subReceipt,
                source: 'vendor_subscription',
            },
        });

        return res.status(200).json(
            new ApiResponse(200, {
                razorpayOrderId: rzpOrder.orderId,
                keyId: rzpOrder.keyId,
                amount: rzpOrder.amount,
                amountInPaise: rzpOrder.amountInPaise,
                currency: rzpOrder.currency,
                orderId: subReceipt,
                subscriptionPlanId: plan._id,
                environment: rzpOrder.environment,
                customer: {
                    name: vendor.name || vendor.storeName || 'Vendor Owner',
                    email: vendor.email,
                    phone: vendor.phone || vendor.phoneE164 || '',
                },
            }, 'Vendor subscription payment session created.')
        );
    }

    throw new ApiError(400, 'Either orderId, subscriptionPlanId with email, or checkoutSessionId is required.');
});

/**
 * POST /api/payments/razorpay/verify
 * Verifies Razorpay payment signature and claims checkout session / activates subscription.
 */
export const verifyPayment = asyncHandler(async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        orderId,
        checkoutSessionId,
        sessionId,
    } = req.body;

    const rzpOrderId = razorpay_order_id;
    const rzpPaymentId = razorpay_payment_id;
    const rzpSignature = razorpay_signature;

    const targetId = orderId || checkoutSessionId || sessionId;

    // ── 1. Signature Verification ─────────────────────────────────────────────
    if (rzpOrderId && rzpPaymentId && rzpSignature) {
        const isValidSignature = await verifyRazorpayPaymentSignature({
            orderId: rzpOrderId,
            paymentId: rzpPaymentId,
            signature: rzpSignature,
        });

        if (!isValidSignature) {
            throw new ApiError(400, 'Payment signature verification failed. Untrusted payment payload.');
        }
    }

    // ── 2. Vendor Subscription Verification ───────────────────────────────────
    if (targetId && targetId.startsWith('sub_')) {
        const parts = targetId.split('_');
        const vendorId = parts[1];
        const planId = parts[2];

        if (!vendorId || !planId) {
            throw new ApiError(400, 'Invalid subscription payment reference format.');
        }

        const vendor = await Vendor.findById(vendorId);
        const plan = await SubscriptionPlan.findById(planId);

        if (!vendor || !plan) {
            throw new ApiError(404, 'Vendor or subscription plan not found.');
        }

        // Verify payment status and amount with Razorpay
        let isPaid = false;
        let gatewayAmount = 0;

        if (rzpPaymentId) {
            const paymentDoc = await fetchRazorpayPayment(rzpPaymentId);
            isPaid = paymentDoc.status === 'captured' || paymentDoc.status === 'authorized';
            gatewayAmount = roundMoney((paymentDoc.amount || 0) / 100);
        } else if (rzpOrderId) {
            const orderDoc = await fetchRazorpayOrder(rzpOrderId);
            isPaid = orderDoc.status === 'paid';
            gatewayAmount = roundMoney((orderDoc.amount_paid || orderDoc.amount || 0) / 100);
        }

        const expectedAmount = roundMoney(plan.price_inr);
        if (isPaid && Math.abs(gatewayAmount - expectedAmount) > 0.01) {
            console.error(
                `[Security Alert] Subscription amount mismatch for vendor ${vendorId}, plan ${planId}: ` +
                `expected ₹${expectedAmount}, gateway paid ₹${gatewayAmount}`
            );
            throw new ApiError(400, 'Subscription payment verification failed due to amount mismatch.');
        }

        if (isPaid) {
            const subscription = await activateSubscription({
                vendor,
                plan,
                activationSource: 'gateway_verified',
                gatewayPaymentRef: String(rzpPaymentId || rzpOrderId || targetId),
            });

            await rememberSubscribedVendor(vendor, plan._id);

            // Record in Payment collection
            await Payment.create({
                vendor: vendor._id,
                subscription: subscription._id,
                gateway: 'razorpay',
                amount: expectedAmount,
                currency: 'INR',
                status: 'paid',
                transaction_id: rzpPaymentId || rzpOrderId,
                raw: { rzpOrderId, rzpPaymentId },
            }).catch((err) => console.warn('[Payment] Payment record creation warning:', err?.message));

            return res.status(200).json(
                new ApiResponse(200, { verified: true, isPaid: true, subscription }, 'Vendor subscription payment verified.')
            );
        }

        return res.status(200).json(
            new ApiResponse(200, { verified: false, isPaid: false }, 'Subscription payment verification pending.')
        );
    }

    // ── 3. CheckoutSession Verification ───────────────────────────────────────
    const lookupSessionId = targetId || rzpOrderId;
    const checkoutSession = await CheckoutSession.findOne({
        $or: [
            { sessionId: lookupSessionId },
            ...(mongoose.isValidObjectId(lookupSessionId) ? [{ _id: lookupSessionId }] : []),
            { gatewayOrderId: lookupSessionId },
            ...(rzpOrderId ? [{ gatewayOrderId: rzpOrderId }, { 'metadata.razorpayOrderId': rzpOrderId }] : []),
        ],
    });

    if (checkoutSession) {
        checkSessionOwnership(checkoutSession, req.user);
        const callerUserId = req.user?._id || req.user?.id;
        const isOwner = Boolean(callerUserId && String(checkoutSession.userId) === String(callerUserId));

        let isPaid = false;
        let gatewayAmount = 0;

        if (rzpPaymentId) {
            const paymentDoc = await fetchRazorpayPayment(rzpPaymentId);
            isPaid = paymentDoc.status === 'captured' || paymentDoc.status === 'authorized';
            gatewayAmount = roundMoney((paymentDoc.amount || 0) / 100);
        } else if (rzpOrderId || checkoutSession.gatewayOrderId) {
            const orderDoc = await fetchRazorpayOrder(rzpOrderId || checkoutSession.gatewayOrderId);
            isPaid = orderDoc.status === 'paid';
            gatewayAmount = roundMoney((orderDoc.amount_paid || orderDoc.amount || 0) / 100);
        }

        const expectedAmount = roundMoney(checkoutSession.summary?.grandTotal ?? checkoutSession.grandTotal ?? 0);

        if (isPaid && Math.abs(gatewayAmount - expectedAmount) > 0.01) {
            console.error(
                `[Security Alert] Payment amount mismatch for session ${checkoutSession.sessionId}! Expected ₹${expectedAmount}, Gateway paid ₹${gatewayAmount}`
            );
            throw new ApiError(400, 'Payment verification failed due to amount mismatch.');
        }

        if (isPaid) {
            const claimResult = await claimCheckoutSessionForProcessing(checkoutSession.sessionId, {
                paymentDetails: {
                    paymentStatus: 'paid',
                    gatewayName: 'razorpay',
                    gatewayOrderId: rzpOrderId || checkoutSession.gatewayOrderId,
                    gatewayReference: rzpPaymentId,
                },
            });

            if (!claimResult.claimed) {
                // Already completed or claimed by concurrent worker / webhook
                const existingOrders = claimResult.orders || [];
                if (existingOrders.length > 0 && claimResult.session?.status !== 'completed') {
                    await CheckoutSession.updateOne(
                        { _id: claimResult.session._id },
                        { $set: { status: 'completed', completedAt: new Date(), orderIds: existingOrders.map((o) => o._id) } }
                    );
                    claimResult.session.status = 'completed';
                }
                const sanitized = sanitizeCheckoutSessionResponse(claimResult.session, existingOrders, isOwner);
                return res.status(200).json(
                    new ApiResponse(
                        200,
                        { verified: true, isPaid: true, checkoutSession: sanitized.checkoutSession, orders: sanitized.orders, ordersCreated: existingOrders.length },
                        'CheckoutSession payment verified (idempotent).'
                    )
                );
            }

            try {
                const { splitAndCreateOrders } = await import('../../../services/checkout/OrderSplitterEngine.js');
                const { items, coupon, customerLocation, shippingOption } = checkoutSession.metadata || {};

                const { orders } = await splitAndCreateOrders({
                    sessionId: checkoutSession.sessionId,
                    items: (items && items.length) ? items : (checkoutSession.items || []),
                    shippingAddress: checkoutSession.shippingAddress,
                    paymentMethod: checkoutSession.paymentMethod || 'card',
                    customerLocation,
                    coupon,
                    userId: checkoutSession.userId ? String(checkoutSession.userId) : null,
                    settings: { shippingOption },
                });

                await CheckoutSession.updateOne(
                    { _id: checkoutSession._id },
                    {
                        $set: {
                            status: 'completed',
                            completedAt: new Date(),
                            orderIds: orders.map((o) => o._id),
                            gatewayReference: rzpPaymentId || null,
                            gatewayOrderId: rzpOrderId || checkoutSession.gatewayOrderId,
                        },
                    }
                );

                if (coupon?.code) {
                    incrementCouponUsage(coupon.code, {
                        userId: checkoutSession.userId,
                        orderId: orders[0]?._id,
                        checkoutSessionId: checkoutSession.sessionId,
                        amount: coupon.discount,
                    }).catch((err) => console.error('[Razorpay Verify] Failed to increment coupon usage:', err?.message));
                }

                const finalSession = await CheckoutSession.findById(checkoutSession._id);
                const sanitized = sanitizeCheckoutSessionResponse(finalSession, orders, isOwner);
                return res.status(200).json(
                    new ApiResponse(
                        200,
                        { verified: true, isPaid: true, checkoutSession: sanitized.checkoutSession, orders: sanitized.orders, ordersCreated: orders.length },
                        'CheckoutSession payment verified and orders created.'
                    )
                );
            } catch (err) {
                console.error(`[Razorpay Verify] Split and create orders error: ${err.message}`, err);
                await releaseClaimOnError(checkoutSession.sessionId, err.message);
                throw new ApiError(500, err.message || 'Payment verification and order creation failed.');
            }
        }

        return res.status(200).json(
            new ApiResponse(200, { verified: false, isPaid: false }, 'Payment is pending or not yet confirmed by Razorpay.')
        );
    }

    throw new ApiError(400, 'orderId, checkoutSessionId, or razorpay_order_id is required.');
});

/**
 * POST /api/payments/razorpay/webhook
 * Webhook endpoint for Razorpay real-time asynchronous notifications.
 */
export const handleWebhook = asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (signature) {
        const isValid = await verifyRazorpayWebhookSignature({ rawBody, signature });
        if (!isValid) {
            console.warn('[Razorpay Webhook] Invalid webhook signature received.');
            return res.status(400).json({ status: 'invalid_signature' });
        }
    }

    const event = req.body?.event;
    const payload = req.body?.payload;

    console.log(`[Razorpay Webhook] Received event: ${event}`);

    if (event === 'order.paid' || event === 'payment.captured') {
        const paymentEntity = payload?.payment?.entity;
        const orderEntity = payload?.order?.entity;
        const rzpOrderId = orderEntity?.id || paymentEntity?.order_id;
        const rzpPaymentId = paymentEntity?.id;
        const notes = orderEntity?.notes || paymentEntity?.notes || {};

        const sessionId = notes?.sessionId || orderEntity?.receipt;

        if (sessionId && (sessionId.startsWith('CS-') || sessionId.startsWith('cf_') || sessionId.startsWith('rzp_') || !sessionId.startsWith('sub_'))) {
            const checkoutSession = await CheckoutSession.findOne({
                $or: [
                    { sessionId },
                    { gatewayOrderId: rzpOrderId },
                    { 'metadata.razorpayOrderId': rzpOrderId },
                ],
            });

            if (checkoutSession && checkoutSession.paymentStatus !== 'paid') {
                const claimResult = await claimCheckoutSessionForProcessing(checkoutSession.sessionId, {
                    paymentDetails: {
                        paymentStatus: 'paid',
                        gatewayName: 'razorpay',
                        gatewayOrderId: rzpOrderId,
                        gatewayReference: rzpPaymentId,
                    },
                });

                if (claimResult.claimed) {
                    try {
                        const { splitAndCreateOrders } = await import('../../../services/checkout/OrderSplitterEngine.js');
                        const { items, coupon, customerLocation, shippingOption } = checkoutSession.metadata || {};

                        const { orders } = await splitAndCreateOrders({
                            sessionId: checkoutSession.sessionId,
                            items: (items && items.length) ? items : (checkoutSession.items || []),
                            shippingAddress: checkoutSession.shippingAddress,
                            paymentMethod: checkoutSession.paymentMethod || 'card',
                            customerLocation,
                            coupon,
                            userId: checkoutSession.userId ? String(checkoutSession.userId) : null,
                            settings: { shippingOption },
                        });

                        await CheckoutSession.updateOne(
                            { _id: checkoutSession._id },
                            {
                                $set: {
                                    status: 'completed',
                                    completedAt: new Date(),
                                    orderIds: orders.map((o) => o._id),
                                    gatewayReference: rzpPaymentId,
                                },
                            }
                        );

                        if (coupon?.code) {
                            incrementCouponUsage(coupon.code, {
                                userId: checkoutSession.userId,
                                orderId: orders[0]?._id,
                                checkoutSessionId: checkoutSession.sessionId,
                                amount: coupon.discount,
                            }).catch(() => {});
                        }
                    } catch (splitErr) {
                        console.error('[Razorpay Webhook] Order creation error:', splitErr);
                        await releaseClaimOnError(checkoutSession.sessionId, splitErr.message);
                    }
                }
            }
        }
    }

    return res.status(200).json({ status: 'ok' });
});
