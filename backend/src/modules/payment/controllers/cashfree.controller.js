import asyncHandler from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Order from '../../../models/Order.model.js';
import Vendor from '../../../models/Vendor.model.js';
import SubscriptionPlan from '../../../models/SubscriptionPlan.model.js';
import Payment from '../../../models/Payment.model.js';
import {
    createCashfreeOrder,
    fetchCashfreeOrder,
    fetchCashfreeOrderPayments,
    getCashfreeCredentials,
    verifyCashfreeSignature,
} from '../../../services/billing/cashfree.service.js';
import { activateInternalSubscription } from '../../../services/billing/subscriptionState.service.js';

export const createPaymentSession = asyncHandler(async (req, res) => {
    const { orderId, subscriptionPlanId, email } = req.body;

    const creds = await getCashfreeCredentials();

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

        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        const session = await createCashfreeOrder({
            orderId: order.orderId,
            amount: order.total,
            currency: 'INR',
            customer: {
                id: req.user?._id || order.userId || `cust_${order.orderId}`,
                name: order.shippingAddress?.name || req.user?.name || 'Customer',
                email: req.user?.email || email || 'customer@dwellmart.com',
                phone: order.shippingAddress?.phone || '9999999999',
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

        if (amount === 0) {
            const subscription = await activateInternalSubscription({ vendor, plan, gateway: 'internal' });
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
                phone: vendor.phone || '9999999999',
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

    throw new ApiError(400, 'Either orderId or subscriptionPlanId with email is required.');
});

export const verifyPayment = asyncHandler(async (req, res) => {
    const { orderId } = req.body;

    if (!orderId) {
        throw new ApiError(400, 'orderId is required.');
    }

    const cfOrder = await fetchCashfreeOrder(orderId);
    const isPaid = cfOrder.order_status === 'PAID';

    if (orderId.startsWith('sub_')) {
        const parts = orderId.split('_');
        const vendorId = parts[1];
        const planId = parts[2];

        if (isPaid && vendorId && planId) {
            const vendor = await Vendor.findById(vendorId);
            const plan = await SubscriptionPlan.findById(planId);

            if (vendor && plan) {
                const subscription = await activateInternalSubscription({ vendor, plan, gateway: 'cashfree' });
                return res.status(200).json(
                    new ApiResponse(200, { verified: true, isPaid: true, subscription }, 'Vendor subscription payment verified.')
                );
            }
        }
    } else {
        const order = await Order.findOne({ orderId });
        if (order) {
            if (isPaid) {
                order.paymentStatus = 'paid';
                if (order.status === 'pending') {
                    order.status = 'confirmed';
                }
                await order.save();
            }
            return res.status(200).json(
                new ApiResponse(200, { verified: true, isPaid, order }, 'Order payment verified.')
            );
        }
    }

    return res.status(200).json(
        new ApiResponse(200, { verified: true, isPaid, cfOrder }, 'Cashfree payment checked.')
    );
});

export const handleWebhook = asyncHandler(async (req, res) => {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    const isValid = await verifyCashfreeSignature(rawBody, timestamp, signature);
    if (!isValid) {
        return res.status(400).json({ status: 'error', message: 'Invalid webhook signature' });
    }

    const payload = req.body || {};
    const eventType = payload.type || payload.event;
    const orderData = payload.data?.order || {};
    const paymentData = payload.data?.payment || {};

    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || orderData.order_status === 'PAID' || paymentData.payment_status === 'SUCCESS') {
        const cfOrderId = orderData.order_id || paymentData.order_id;
        if (cfOrderId) {
            if (cfOrderId.startsWith('sub_')) {
                const parts = cfOrderId.split('_');
                const vendorId = parts[1];
                const planId = parts[2];
                if (vendorId && planId) {
                    const vendor = await Vendor.findById(vendorId);
                    const plan = await SubscriptionPlan.findById(planId);
                    if (vendor && plan) {
                        await activateInternalSubscription({ vendor, plan, gateway: 'cashfree' });
                    }
                }
            } else {
                const order = await Order.findOne({ orderId: cfOrderId });
                if (order) {
                    order.paymentStatus = 'paid';
                    if (order.status === 'pending') {
                        order.status = 'confirmed';
                    }
                    await order.save();
                }
            }
        }
    }

    return res.status(200).json({ status: 'OK' });
});
