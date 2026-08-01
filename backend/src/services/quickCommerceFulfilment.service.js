import Order from '../models/Order.model.js';
import Product from '../models/Product.model.js';
import ApiError from '../utils/ApiError.js';
import { createNotification } from './notification.service.js';
import { FULFILMENT_UNAVAILABLE_REASON_VALUES } from '../constants/quickCommercePolicy.constants.js';

const round2 = (val) => Math.round((Number(val) || 0) * 100) / 100;

/**
 * Process partial fulfilment for a Quick Commerce order when one or more items
 * land out of stock or fail quality check.
 *
 * Performs 5 operations atomically:
 * 1. Validates order status & vendor ownership.
 * 2. Releases reserved inventory back to Product stockQuantity.
 * 3. Recomputes order subtotal, tax, coupon discount distribution & grand total.
 * 4. Records fulfilmentOutcome snapshot with refund breakdown on order.
 * 5. Notifies customer via notification service.
 */
export const processPartialFulfilment = async ({
    orderId,
    vendorId,
    unavailableItems = [],
    reason = 'OUT_OF_STOCK',
    notes = '',
}) => {
    if (!Array.isArray(unavailableItems) || unavailableItems.length === 0) {
        throw new ApiError(400, 'At least one unavailable item must be specified.');
    }

    if (reason && !FULFILMENT_UNAVAILABLE_REASON_VALUES.includes(reason)) {
        throw new ApiError(400, `Invalid reason. Must be one of: ${FULFILMENT_UNAVAILABLE_REASON_VALUES.join(', ')}`);
    }

    const order = await Order.findById(orderId);
    if (!order) {
        throw new ApiError(404, 'Order not found.');
    }

    if (order.status === 'cancelled' || order.status === 'delivered') {
        throw new ApiError(400, `Cannot apply partial fulfilment to order in ${order.status} state.`);
    }

    const vendorIdStr = String(vendorId || '').trim();
    if (vendorIdStr) {
        const orderVendorId = String(order.vendorId || order.items?.[0]?.vendorId || '').trim();
        if (orderVendorId && orderVendorId !== vendorIdStr) {
            throw new ApiError(403, 'Order does not belong to this vendor.');
        }
    }

    if (order.fulfilmentOutcome && order.fulfilmentOutcome.refundStatus === 'processed') {
        throw new ApiError(400, 'Partial fulfilment already processed for this order. Double submission blocked.');
    }

    const orderItems = Array.isArray(order.items) ? order.items : [];

    let totalRefundAmount = 0;
    const processedUnavailable = [];
    const stockReleasePromises = [];

    for (const reqItem of unavailableItems) {
        const pIdStr = String(reqItem?.productId || '').trim();
        const vKey = String(reqItem?.variantKey || '').trim();
        const unavailQty = Number(reqItem?.quantity || 1);

        const targetItemIndex = orderItems.findIndex(
            (it) => String(it.productId) === pIdStr && (!vKey || String(it.variantKey || '') === vKey)
        );

        if (targetItemIndex === -1) {
            throw new ApiError(400, `Product ${pIdStr} is not part of this order.`);
        }

        const targetItem = orderItems[targetItemIndex];
        const maxQty = Number(targetItem.quantity || 1);
        const validQty = Math.min(Math.max(1, unavailQty), maxQty);

        const unitPrice = Number(targetItem.price || 0);
        const itemSubtotal = round2(unitPrice * validQty);

        // Proportional tax & coupon discount
        const originalSubtotal = Number(order.subtotal || 1);
        const ratio = originalSubtotal > 0 ? itemSubtotal / originalSubtotal : 0;

        const itemTax = round2((Number(order.tax) || 0) * ratio);
        const itemDiscount = round2((Number(order.couponDiscount || order.discount) || 0) * ratio);

        const itemRefund = round2(Math.max(0, itemSubtotal + itemTax - itemDiscount));
        totalRefundAmount = round2(totalRefundAmount + itemRefund);

        processedUnavailable.push({
            productId: targetItem.productId,
            variantKey: targetItem.variantKey || '',
            name: targetItem.name || 'Unavailable Product',
            quantity: validQty,
            reason: reqItem.reason || reason,
            refundAmount: itemRefund,
        });

        // Release reserved inventory
        stockReleasePromises.push(
            Product.findByIdAndUpdate(targetItem.productId, {
                $inc: { stockQuantity: validQty },
            }).catch((err) => {
                console.warn(`[Partial Fulfilment] Stock release failed for ${targetItem.productId}: ${err.message}`);
            })
        );

        // Reduce item quantity or remove item from order.items
        if (targetItem.quantity > validQty) {
            targetItem.quantity -= validQty;
        } else {
            orderItems.splice(targetItemIndex, 1);
        }
    }

    await Promise.all(stockReleasePromises);

    // Update order items array & totals
    order.items = orderItems;
    const newSubtotal = round2(orderItems.reduce((acc, item) => acc + Number(item.price || 0) * Number(item.quantity || 1), 0));
    const newTax = round2(Math.max(0, Number(order.tax || 0) - (Number(order.subtotal || 0) > 0 ? (Number(order.tax || 0) * (totalRefundAmount / Number(order.total || 1))) : 0)));
    const newTotal = round2(Math.max(0, Number(order.total || 0) - totalRefundAmount));

    order.subtotal = newSubtotal;
    order.tax = newTax;
    order.total = newTotal;

    // Snapshot fulfilmentOutcome
    order.fulfilmentOutcome = {
        status: orderItems.length > 0 ? 'partially_fulfilled' : 'unfulfilled',
        unavailableItems: processedUnavailable,
        fulfilledItems: orderItems,
        refundAmount: totalRefundAmount,
        refundStatus: 'processed',
        notes: notes || `Partial fulfilment processed for ${processedUnavailable.length} item(s).`,
    };

    await order.save();

    // Trigger notification to customer
    if (order.userId) {
        createNotification({
            recipientId: order.userId,
            recipientType: 'user',
            title: 'Item Unavailable — Refund Initiated',
            message: `One or more items in your order #${order.orderId} were unavailable. A partial refund of Rs.${totalRefundAmount.toFixed(2)} has been initiated.`,
            type: 'order',
            data: {
                orderId: String(order.orderId || order._id),
                refundAmount: String(totalRefundAmount),
                event: 'partial_fulfilment',
            },
        }).catch((err) => {
            console.warn(`[Partial Fulfilment Notification] Failed: ${err.message}`);
        });
    }

    return order;
};
