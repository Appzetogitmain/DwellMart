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
    createCashfreeOrder,
    fetchCashfreeOrder,
    fetchCashfreeOrderPayments,
    getCashfreeCredentials,
    verifyCashfreeSignature,
} from '../../../services/billing/cashfree.service.js';
import { activateSubscription } from '../../../services/billing/subscriptionState.service.js';
import { roundMoney } from '../../../services/PriceReconciliationService.js';
import { incrementCouponUsage } from '../../../services/coupon.service.js';
import { settleRefundFromGateway } from '../../../services/refund/RefundOrchestrator.service.js';

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

export const createPaymentSession = asyncHandler(async (req, res) => {
    const { orderId, subscriptionPlanId, email, checkoutSessionId, sessionId } = req.body;

    const creds = await getCashfreeCredentials();

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

        const customerId    = req.user?._id || session.userId || `cust_${session.sessionId}`;
        const customerName  = session.shippingAddress?.name || session.guestInfo?.name || req.user?.name || 'Customer';
        const customerEmail = session.shippingAddress?.email || session.guestInfo?.email || req.user?.email || email || null;
        const customerPhone = session.shippingAddress?.phone || session.guestInfo?.phone || req.user?.phone || null;

        const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
        const notifyUrl = process.env.CASHFREE_NOTIFY_URL || undefined;
        const cfSession = await createCashfreeOrder({
            orderId: session.sessionId,
            amount,
            currency: 'INR',
            customer: {
                id: customerId,
                name: customerName,
                email: customerEmail,
                phone: customerPhone,
            },
            // Cashfree may replace the current page on mobile (especially for
            // UPI app hand-offs). Return to a CheckoutSession-aware screen;
            // session.sessionId is not an Order.orderId yet.
            returnUrl: `${clientUrl}/payment-return?session_id=${encodeURIComponent(session.sessionId)}&order_id={order_id}`,
            notifyUrl,
        });

        session.gatewayOrderId   = session.sessionId;
        session.gatewaySessionId = cfSession.paymentSessionId;
        await session.save();

        return res.status(200).json(
            new ApiResponse(200, {
                paymentSessionId:  cfSession.paymentSessionId,
                cfOrderId:         cfSession.cfOrderId,
                orderId:           session.sessionId,
                checkoutSessionId: session.sessionId,
                environment:       cfSession.environment,
            }, 'Cashfree checkout session created.')
        );
    }

    // ── Source 2: Legacy Single Order ──────────────────────────────────────────
    if (orderId) {
        const order = await Order.findOne({ orderId });
        if (!order) {
            throw new ApiError(404, 'Order not found.');
        }

        if (order.paymentStatus === 'paid') {
            return res.status(200).json(
                new ApiResponse(200, { alreadyPaid: true, order }, 'Order is already paid.')
            );
        }

        const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
        const session = await createCashfreeOrder({
            orderId: order.orderId,
            amount: order.total,
            currency: 'INR',
            customer: {
                id: req.user?._id || order.userId || `cust_${order.orderId}`,
                name: order.shippingAddress?.name || req.user?.name || 'Customer',
                email: req.user?.email || email || null,
                phone: order.shippingAddress?.phone || null,
            },
            returnUrl: `${clientUrl}/order-confirmation/${order.orderId}?order_id={order_id}`,
        });

        return res.status(200).json(
            new ApiResponse(200, {
                paymentSessionId: session.paymentSessionId,
                cfOrderId: session.cfOrderId,
                orderId: session.orderId,
                environment: session.environment,
            }, 'Cashfree payment session created.')
        );
    }

    // ── Source 3: Vendor Subscription ──────────────────────────────────────────
    if (subscriptionPlanId && email) {
        const vendor = await Vendor.findOne({ email: email.toLowerCase().trim() });
        if (!vendor) {
            throw new ApiError(404, 'Vendor not found.');
        }

        const plan = await SubscriptionPlan.findById(subscriptionPlanId);
        if (!plan || !plan.isActive) {
            throw new ApiError(404, 'Selected plan not found or inactive.');
        }

        const cfOrderId = `sub_${vendor._id}_${plan._id}_${Date.now()}`;
        const amount = Number(plan.price_inr || 0);

        // Free means free in BOTH currencies. Testing price_inr alone would let
        // a ₹0/$49 plan take the no-payment branch, which the activation service
        // now refuses — routing it to real checkout instead of a 402.
        const isFreePlan = Number(plan.price_inr || 0) === 0 && Number(plan.price_usd || 0) === 0;

        if (isFreePlan) {
            const subscription = await activateSubscription({
                vendor,
                plan,
                activationSource: 'zero_price_plan',
            });
            return res.status(200).json(
                new ApiResponse(200, { isFree: true, subscription }, 'Free plan activated successfully.')
            );
        }

        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        const session = await createCashfreeOrder({
            orderId: cfOrderId,
            amount,
            currency: 'INR',
            customer: {
                id: vendor._id,
                name: vendor.name || vendor.storeName || 'Vendor Owner',
                email: vendor.email,
                phone: vendor.phone || null,
            },
            returnUrl: `${clientUrl}/vendor/register?cf_order_id=${cfOrderId}`,
        });

        return res.status(200).json(
            new ApiResponse(200, {
                paymentSessionId: session.paymentSessionId,
                cfOrderId: session.cfOrderId,
                orderId: session.orderId,
                environment: session.environment,
            }, 'Vendor subscription payment session created.')
        );
    }

    throw new ApiError(400, 'Either orderId, subscriptionPlanId with email, or checkoutSessionId is required.');
});

export const verifyPayment = asyncHandler(async (req, res) => {
    const { orderId, checkoutSessionId, sessionId } = req.body;
    const targetId = orderId || checkoutSessionId || sessionId;

    if (!targetId) {
        throw new ApiError(400, 'orderId, checkoutSessionId, or sessionId is required.');
    }

    // ── 1. Vendor Subscription check ──────────────────────────────────────────
    if (targetId.startsWith('sub_')) {
        const cfOrder = await fetchCashfreeOrder(targetId);
        const isPaid  = cfOrder.order_status === 'PAID';
        const parts    = targetId.split('_');
        const vendorId = parts[1];
        const planId   = parts[2];

        if (isPaid && vendorId && planId) {
            const vendor = await Vendor.findById(vendorId);
            const plan   = await SubscriptionPlan.findById(planId);

            if (vendor && plan) {
                // Verify the amount actually paid matches the plan's price, the
                // same guard the CheckoutSession branch applies. Without it the
                // gateway's "PAID" is trusted for an unknown amount.
                //
                // Compared against price_inr because `createPaymentSession`
                // charges subscriptions in INR for every vendor regardless of
                // country — comparing against a country-resolved price here
                // would reject every legitimate non-India payment.
                const expectedAmount = roundMoney(plan.price_inr);
                const gatewayAmount = roundMoney(cfOrder?.order_amount ?? 0);

                if (Math.abs(gatewayAmount - expectedAmount) > 0.01) {
                    console.error(
                        `[Security Alert] Subscription amount mismatch for vendor ${vendorId}, plan ${planId}: `
                        + `expected ${expectedAmount}, gateway paid ${gatewayAmount}`
                    );
                    throw new ApiError(400, 'Subscription payment verification failed due to amount mismatch.');
                }

                const subscription = await activateSubscription({
                    vendor,
                    plan,
                    activationSource: 'gateway_verified',
                    gatewayPaymentRef: String(cfOrder?.cf_order_id || targetId),
                });
                return res.status(200).json(
                    new ApiResponse(200, { verified: true, isPaid: true, subscription }, 'Vendor subscription payment verified.')
                );
            }
        }

        return res.status(200).json(
            new ApiResponse(200, { verified: true, isPaid, cfOrder }, 'Subscription payment checked.')
        );
    }

    // ── 2. CheckoutSession check ───────────────────────────────────────────────
    const checkoutSession = await CheckoutSession.findOne({
        $or: [
            { sessionId: targetId },
            ...(mongoose.isValidObjectId(targetId) ? [{ _id: targetId }] : []),
            { gatewayOrderId: targetId },
        ],
    });

    if (checkoutSession) {
        checkSessionOwnership(checkoutSession, req.user);
        const callerUserId = req.user?._id || req.user?.id;
        const isOwner = Boolean(callerUserId && String(checkoutSession.userId) === String(callerUserId));

        const lookupId = checkoutSession.gatewayOrderId || checkoutSession.sessionId;
        const cfOrder = await fetchCashfreeOrder(lookupId).catch(() => null);
        let payments = [];
        try {
            payments = await fetchCashfreeOrderPayments(lookupId);
        } catch {
            // No payment attempts yet
        }

        const expectedAmount = roundMoney(checkoutSession.summary?.grandTotal ?? 0);
        const gatewayAmount = roundMoney(cfOrder?.order_amount ?? 0);
        const isPaid = (cfOrder?.order_status === 'PAID' || (Array.isArray(payments) && payments.some(p => p.payment_status === 'SUCCESS')));

        if (isPaid && cfOrder && Math.abs(gatewayAmount - expectedAmount) > 0.01) {
            console.error(`[Security Alert] Payment amount mismatch for session ${checkoutSession.sessionId}! Expected ₹${expectedAmount}, Gateway paid ₹${gatewayAmount}`);
            throw new ApiError(400, 'Payment verification failed due to amount mismatch.');
        }

        if (isPaid) {
            const claimResult = await claimCheckoutSessionForProcessing(checkoutSession.sessionId, {
                paymentDetails: { paymentStatus: 'paid' },
            });

            if (!claimResult.claimed) {
                // Already completed or claimed by concurrent handler
                const existingOrders = claimResult.orders || [];
                if (existingOrders.length > 0 && claimResult.session?.status !== 'completed') {
                    await CheckoutSession.updateOne(
                        { _id: claimResult.session._id },
                        { $set: { status: 'completed', completedAt: new Date(), orderIds: existingOrders.map(o => o._id) } }
                    );
                    claimResult.session.status = 'completed';
                }
                const sanitized = sanitizeCheckoutSessionResponse(claimResult.session, existingOrders, isOwner);
                return res.status(200).json(
                    new ApiResponse(200, { verified: true, isPaid: true, checkoutSession: sanitized.checkoutSession, orders: sanitized.orders, ordersCreated: existingOrders.length }, 'CheckoutSession payment verified (idempotent).')
                );
            }

            try {
                const { splitAndCreateOrders } = await import('../../../services/checkout/OrderSplitterEngine.js');
                const { items, coupon, customerLocation, shippingOption } = checkoutSession.metadata || {};

                const { orders } = await splitAndCreateOrders({
                    sessionId:       checkoutSession.sessionId,
                    items:           (items && items.length) ? items : (checkoutSession.items || []),
                    shippingAddress: checkoutSession.shippingAddress,
                    paymentMethod:   checkoutSession.paymentMethod || 'card',
                    customerLocation,
                    coupon,
                    userId:          checkoutSession.userId ? String(checkoutSession.userId) : null,
                    settings:        { shippingOption },
                });

                await CheckoutSession.updateOne(
                    { _id: checkoutSession._id },
                    { $set: { status: 'completed', completedAt: new Date(), orderIds: orders.map(o => o._id) } }
                );

                // P1-04 FIX: Increment coupon usage after successful order creation (online payment path)
                if (coupon?.code) {
                    incrementCouponUsage(coupon.code, { userId: checkoutSession.userId, orderId: orders[0]?._id, checkoutSessionId: checkoutSession.sessionId, amount: coupon.discount }).catch((err) =>
                        console.error('[VerifyPayment] Failed to increment coupon usage:', err?.message)
                    );
                }

                const finalSession = await CheckoutSession.findById(checkoutSession._id);
                const sanitized = sanitizeCheckoutSessionResponse(finalSession, orders, isOwner);
                return res.status(200).json(
                    new ApiResponse(200, { verified: true, isPaid: true, checkoutSession: sanitized.checkoutSession, orders: sanitized.orders, ordersCreated: orders.length }, 'CheckoutSession payment verified and orders created.')
                );
            } catch (err) {
                console.error(`[VerifyPayment] Error: ${err.message}`, err);
                await releaseClaimOnError(checkoutSession.sessionId, err.message);
                throw new ApiError(500, err.message || 'Payment verification and order creation failed.');
            }
        }

        // An ACTIVE Cashfree order can contain a failed attempt while still
        // allowing the customer to retry. Do not turn that transient state
        // into a failed CheckoutSession while the gateway is still settling.
        const orderStatus = String(cfOrder?.order_status || '').toUpperCase();
        const paymentStatuses = Array.isArray(payments)
            ? payments.map((payment) => String(payment?.payment_status || '').toUpperCase())
            : [];
        const isPending = !cfOrder
            || ['ACTIVE', 'PENDING'].includes(orderStatus)
            || paymentStatuses.some((status) => ['PENDING', 'NOT_ATTEMPTED'].includes(status));
        const isCancelled = !isPending;

        if (isCancelled) {
            await CheckoutSession.updateOne(
                { _id: checkoutSession._id },
                { $set: { paymentStatus: 'failed' } }
            );
        }

        // P0-06 FIX: Sanitize the session before returning — the raw document contains
        // shippingAddress and guestInfo PII that must not be leaked to non-owners.
        const sanitizedPending = sanitizeCheckoutSessionResponse(checkoutSession, [], isOwner);
        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    verified: true,
                    isPaid: false,
                    isPending,
                    isCancelled,
                    checkoutSession: sanitizedPending.checkoutSession,
                    cfOrder: cfOrder ? { order_status: cfOrder.order_status, order_amount: cfOrder.order_amount } : null,
                },
                isPending
                    ? 'Payment confirmation is pending.'
                    : 'Payment was cancelled or failed. Your order has not been placed.'
            )
        );
    }

    // ── 3. Legacy Order check ──────────────────────────────────────────────────
    const order = await Order.findOne({ orderId: targetId });
    if (order) {
        // This route is `optionalAuth` so guest checkout can verify its own
        // payment. That is fine — returning the raw order document was not:
        // any unauthenticated caller supplying an order id received the
        // customer's name, phone, email, full shipping address and line items.
        const callerUserId = req.user?._id || req.user?.id;
        const isOwner = Boolean(
            callerUserId && order.userId && String(order.userId) === String(callerUserId)
        );

        // An order that belongs to a registered customer may only be inspected
        // by that customer. Guest orders (no userId) remain reachable by order
        // id, which is how guest payment return works, but only ever in the
        // sanitised shape below.
        if (order.userId && !isOwner) {
            throw new ApiError(403, 'Access denied. You do not own this order.');
        }

        const cfOrder = await fetchCashfreeOrder(targetId);
        const isPaid  = cfOrder.order_status === 'PAID';
        if (isPaid) {
            order.paymentStatus = 'paid';
            if (order.status === 'pending') {
                order.status = 'confirmed';
            }
            await order.save();
        }

        // Allowlisted projection — never the raw document.
        const safeOrder = isOwner
            ? order
            : {
                orderId: order.orderId,
                status: order.status,
                paymentStatus: order.paymentStatus,
                total: order.total,
                itemCount: order.items?.length || 0,
                createdAt: order.createdAt,
            };

        return res.status(200).json(
            new ApiResponse(200, { verified: true, isPaid, order: safeOrder }, 'Order payment verified.')
        );
    }

    const fallbackCfOrder = await fetchCashfreeOrder(targetId).catch(() => null);
    if (!fallbackCfOrder) {
        throw new ApiError(404, `No payment record found for ID: ${targetId}`);
    }
    return res.status(200).json(
        new ApiResponse(200, { verified: true, isPaid: fallbackCfOrder?.order_status === 'PAID', cfOrder: fallbackCfOrder }, 'Cashfree payment checked.')
    );
});

export const handleWebhook = asyncHandler(async (req, res) => {
    const rawBody   = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    // ── 1. Signature verification ──────────────────────────────────────────────
    const isValid = await verifyCashfreeSignature(rawBody, timestamp, signature);
    if (!isValid) {
        return res.status(400).json({ status: 'error', message: 'Invalid webhook signature' });
    }

    const payload     = req.body || {};
    const eventType   = payload.type || payload.event;
    const orderData   = payload.data?.order || {};
    const paymentData = payload.data?.payment || {};
    const cfOrderId   = orderData.order_id || paymentData.order_id;
    const isSuccess   = eventType === 'PAYMENT_SUCCESS_WEBHOOK'
        || orderData.order_status === 'PAID'
        || paymentData.payment_status === 'SUCCESS';
    const isFailed    = eventType === 'PAYMENT_FAILED_WEBHOOK'
        || paymentData.payment_status === 'FAILED';

    // ── 2. Always return 200 immediately — Cashfree retries on non-200 ─────────
    res.status(200).json({ status: 'OK' });

    // ── 3. Process asynchronously after response sent (sync in test mode) ───────
    const processAsync = async () => {
        try {
            // ── 3z. Refund lifecycle ────────────────────────────────────────
            // A refund settles asynchronously over days; this is the only event
            // that may mark one `succeeded` and trigger its reversals.
            const refundData = payload.data?.refund;
            if (refundData || String(eventType || '').includes('REFUND')) {
                await settleRefundFromGateway({
                    gatewayRefundId: refundData?.cf_refund_id,
                    refundIdKey: refundData?.refund_id,
                    status: refundData?.refund_status,
                    raw: refundData || payload.data || {},
                });
                return;
            }

            if (!cfOrderId) return;

            // ── 3a. Vendor subscription payment ────────────────────────────────
            if (cfOrderId.startsWith('sub_')) {
                if (isSuccess) {
                    const parts    = cfOrderId.split('_');
                    const vendorId = parts[1];
                    const planId   = parts[2];
                    if (vendorId && planId) {
                        const vendor = await Vendor.findById(vendorId);
                        const plan   = await SubscriptionPlan.findById(planId);
                        if (vendor && plan) {
                            // Same amount guard as the verify path: a webhook
                            // asserting PAID for the wrong amount must not
                            // activate the plan. Compared against price_inr for
                            // the same reason — subscriptions are charged in INR.
                            const expectedAmount = roundMoney(plan.price_inr);
                            const webhookAmount = roundMoney(
                                orderData.order_amount ?? paymentData.payment_amount ?? 0
                            );

                            if (webhookAmount > 0 && Math.abs(webhookAmount - expectedAmount) > 0.01) {
                                console.error(
                                    `[Webhook Security Alert] Subscription amount mismatch for vendor ${vendorId}, `
                                    + `plan ${planId}: expected ${expectedAmount}, gateway paid ${webhookAmount}. Activation refused.`
                                );
                                return;
                            }

                            await activateSubscription({
                                vendor,
                                plan,
                                activationSource: 'gateway_webhook',
                                gatewayPaymentRef: String(paymentData.cf_payment_id || cfOrderId),
                            });
                        }
                    }
                }
                return;
            }

            // ── 3b. Enterprise CheckoutSession payment ──────────────────────────
            const session = await CheckoutSession.findOne({
                $or: [
                    { gatewayOrderId: cfOrderId },
                    { sessionId: cfOrderId },
                ],
            });

            if (session) {
                if (isSuccess) {
                    const expectedAmount = roundMoney(session.summary?.grandTotal ?? 0);
                    const webhookPaidAmount = roundMoney(orderData.order_amount ?? paymentData.payment_amount ?? 0);
                    if (webhookPaidAmount > 0 && Math.abs(webhookPaidAmount - expectedAmount) > 0.01) {
                        console.error(`[Webhook Security Alert] Payment amount mismatch for session ${session.sessionId}! Expected ₹${expectedAmount}, Gateway paid ₹${webhookPaidAmount}`);
                        await CheckoutSession.updateOne(
                            { _id: session._id },
                            {
                                $set: {
                                    paymentStatus: 'failed',
                                    status: 'failed',
                                    failedAt: new Date(),
                                    failureReason: `Payment amount mismatch: Expected ₹${expectedAmount}, paid ₹${webhookPaidAmount}`,
                                },
                            }
                        );
                        return;
                    }

                    const claimResult = await claimCheckoutSessionForProcessing(session.sessionId, {
                        paymentDetails: {
                            paymentStatus:    'paid',
                            gatewayReference: paymentData.cf_payment_id || cfOrderId,
                        },
                    });
                    if (!claimResult.claimed) {
                        console.log(`[Webhook] Session ${session.sessionId} already claimed/completed. Skipping order creation (idempotent).`);
                        return;
                    }

                    try {
                        // Run the order splitter engine
                        const { splitAndCreateOrders } = await import('../../../services/checkout/OrderSplitterEngine.js');
                        const { items, coupon, customerLocation, shippingOption } = session.metadata || {};

                        const { orders } = await splitAndCreateOrders({
                            sessionId:       session.sessionId,
                            items:           (items && items.length) ? items : (session.items || []),
                            shippingAddress: session.shippingAddress,
                            paymentMethod:   session.paymentMethod || 'card',
                            customerLocation,
                            coupon,
                            userId:          session.userId ? String(session.userId) : null,
                            settings:        { shippingOption },
                        });

                        await CheckoutSession.updateOne(
                            { sessionId: session.sessionId },
                            { $set: { status: 'completed', completedAt: new Date(), orderIds: orders.map(o => o._id) } }
                        );

                        // P1-04 FIX: Increment coupon usage after successful order creation (webhook path)
                        if (coupon?.code) {
                            incrementCouponUsage(coupon.code, { userId: session.userId, orderId: orders[0]?._id, checkoutSessionId: session.sessionId, amount: coupon.discount }).catch(() => null);
                        }

                        console.log(`[Webhook] CheckoutSession ${session.sessionId} completed — ${orders.length} orders created.`);
                    } catch (err) {
                        await releaseClaimOnError(session.sessionId, err.message);
                        throw err;
                    }
                }

                if (isFailed) {
                    await CheckoutSession.updateOne(
                        { _id: session._id },
                        {
                            $set: {
                                paymentStatus: 'failed',
                                status:        'failed',
                                failedAt:      new Date(),
                                failureReason: `Payment failed: ${paymentData.payment_message || 'Gateway declined'}`,
                            },
                        }
                    );

                    // Release inventory reservation
                    const { releaseReservation } = await import('../../../services/checkout/InventoryReservationService.js');
                    await releaseReservation(session.sessionId, 'payment_failed').catch(() => null);

                    console.log(`[Webhook] CheckoutSession ${session.sessionId} payment failed. Inventory released.`);
                }
                return;
            }

            // ── 3c. Legacy single-Order payment ────────────────────────────────
            if (isSuccess) {
                const order = await Order.findOne({ orderId: cfOrderId });
                if (order) {
                    order.paymentStatus = 'paid';
                    if (order.status === 'pending') order.status = 'confirmed';
                    await order.save();
                }
            }
        } catch (err) {
            console.error('[Webhook] Error processing Cashfree webhook:', err?.message, err?.stack);
        }
    };

    if (process.env.NODE_ENV === 'test' || global.__TEST_MODE__) {
        await processAsync();
    } else {
        setImmediate(processAsync);
    }
});


