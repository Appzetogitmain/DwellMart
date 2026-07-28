import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Product from '../../../models/Product.model.js';
import Coupon from '../../../models/Coupon.model.js';
import Commission from '../../../models/Commission.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Admin from '../../../models/Admin.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Settings from '../../../models/Settings.model.js';
import { generateOrderId } from '../../../utils/generateOrderId.js';
import { generateTrackingNumber } from '../../../utils/generateTrackingNumber.js';
import mongoose from 'mongoose';
import { createNotification } from '../../../services/notification.service.js';
import { calculateVendorShippingForGroups } from '../../../services/vendorShipping.service.js';

const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();
const normalizeAxisName = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
const createDynamicVariantKey = (selection = {}) =>
    Object.entries(selection || {})
        .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
        .filter(([axis, value]) => axis && value)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([axis, value]) => `${axis}=${value}`)
        .join('|');

const toVariantPriceEntries = (variantPrices) => {
    if (!variantPrices) return [];
    if (variantPrices instanceof Map) return Array.from(variantPrices.entries());
    if (typeof variantPrices === 'object') return Object.entries(variantPrices);
    return [];
};

const toVariantStockEntries = (stockMap) => {
    if (!stockMap) return [];
    if (stockMap instanceof Map) return Array.from(stockMap.entries());
    if (typeof stockMap === 'object') return Object.entries(stockMap);
    return [];
};

const resolveVariantSelection = (product, selectedVariant) => {
    const basePrice = Number(product?.price);
    if (!Number.isFinite(basePrice)) {
        throw new ApiError(400, `Invalid price configured for product ${product?.name || product?._id || ''}.`);
    }

    const entries = toVariantPriceEntries(product?.variants?.prices);
    const attributeAxes = Array.isArray(product?.variants?.attributes)
        ? product.variants.attributes
            .map((attr) => ({
                axisKey: normalizeAxisName(attr?.name),
                values: Array.isArray(attr?.values) ? attr.values : [],
            }))
            .filter((attr) => attr.axisKey && attr.values.length > 0)
        : [];
    const hasDynamicAxes = attributeAxes.length > 0;

    if (hasDynamicAxes) {
        const normalizedSelection = {};
        Object.entries(selectedVariant || {}).forEach(([axis, value]) => {
            const axisKey = normalizeAxisName(axis);
            const selectedValue = String(value || '').trim();
            if (axisKey && selectedValue) normalizedSelection[axisKey] = selectedValue;
        });

        const missingAxis = attributeAxes.find((attr) => !String(normalizedSelection[attr.axisKey] || '').trim());
        if (missingAxis) {
            throw new ApiError(400, `Please select ${missingAxis.axisKey.replace(/_/g, ' ')} for ${product?.name || 'product'}.`);
        }

        const selectionKey = createDynamicVariantKey(normalizedSelection);
        if (!selectionKey) {
            throw new ApiError(400, `Please select a variant for ${product?.name || 'product'}.`);
        }
        if (!entries.length) {
            return { price: basePrice, variantKey: selectionKey, hasVariantAxes: true };
        }

        const exact = entries.find(([rawKey]) => String(rawKey).trim() === selectionKey);
        if (exact) {
            const price = Number(exact[1]);
            if (Number.isFinite(price) && price >= 0) {
                return { price, variantKey: String(exact[0]).trim(), hasVariantAxes: true };
            }
        }
        const normalized = entries.find(
            ([rawKey]) => normalizeVariantPart(rawKey) === normalizeVariantPart(selectionKey)
        );
        if (normalized) {
            const price = Number(normalized[1]);
            if (Number.isFinite(price) && price >= 0) {
                return { price, variantKey: String(normalized[0]).trim(), hasVariantAxes: true };
            }
        }
        throw new ApiError(400, `Selected variant is not available for ${product?.name || 'product'}.`);
    }

    const sizes = Array.isArray(product?.variants?.sizes) ? product.variants.sizes : [];
    const colors = Array.isArray(product?.variants?.colors) ? product.variants.colors : [];
    const hasVariantAxes = sizes.length > 0 || colors.length > 0;

    const size = normalizeVariantPart(selectedVariant?.size);
    const color = normalizeVariantPart(selectedVariant?.color);
    if (hasVariantAxes && !size && !color) {
        throw new ApiError(400, `Please select a variant for ${product?.name || 'product'}.`);
    }
    if (!entries.length || (!size && !color)) {
        return { price: basePrice, variantKey: null, hasVariantAxes };
    }

    const candidateKeys = [
        `${size}|${color}`,
        `${size}-${color}`,
        `${size}_${color}`,
        `${size}:${color}`,
        size && !color ? size : null,
        color && !size ? color : null,
    ].filter(Boolean);

    for (const candidate of candidateKeys) {
        const exact = entries.find(([rawKey]) => String(rawKey).trim() === candidate);
        if (exact) {
            const price = Number(exact[1]);
            if (Number.isFinite(price) && price >= 0) {
                return { price, variantKey: String(exact[0]).trim(), hasVariantAxes };
            }
        }

        const normalized = entries.find(
            ([rawKey]) => normalizeVariantPart(rawKey) === normalizeVariantPart(candidate)
        );
        if (normalized) {
            const price = Number(normalized[1]);
            if (Number.isFinite(price) && price >= 0) {
                return { price, variantKey: String(normalized[0]).trim(), hasVariantAxes };
            }
        }
    }

    if (hasVariantAxes) {
        throw new ApiError(400, `Selected variant is not available for ${product?.name || 'product'}.`);
    }
    return { price: basePrice, variantKey: null, hasVariantAxes };
};

const resolveOrderItemVariantKey = (product, orderItem) => {
    const explicitKey = String(orderItem?.variantKey || '').trim();
    if (explicitKey) return explicitKey;

    const stockEntries = toVariantStockEntries(product?.variants?.stockMap).map(([k]) => String(k).trim());
    const priceEntries = toVariantPriceEntries(product?.variants?.prices).map(([k]) => String(k).trim());
    const existingKeys = [...new Set([...stockEntries, ...priceEntries])];
    if (!existingKeys.length) return null;

    const dynamicSelection = Object.entries(orderItem?.variant || {}).reduce((acc, [axis, value]) => {
        const axisKey = normalizeAxisName(axis);
        const selectedValue = String(value || '').trim();
        if (axisKey && selectedValue) acc[axisKey] = selectedValue;
        return acc;
    }, {});
    const dynamicKey = createDynamicVariantKey(dynamicSelection);
    if (dynamicKey) {
        const exactDynamic = existingKeys.find((key) => key === dynamicKey);
        if (exactDynamic) return exactDynamic;
        const normalizedDynamic = existingKeys.find(
            (key) => normalizeVariantPart(key) === normalizeVariantPart(dynamicKey)
        );
        if (normalizedDynamic) return normalizedDynamic;
    }

    const size = normalizeVariantPart(orderItem?.variant?.size);
    const color = normalizeVariantPart(orderItem?.variant?.color);
    if (!size && !color) return null;

    const candidates = [
        `${size}|${color}`,
        `${size}-${color}`,
        `${size}_${color}`,
        `${size}:${color}`,
        size && !color ? size : null,
        color && !size ? color : null,
    ].filter(Boolean);

    for (const candidate of candidates) {
        const exact = existingKeys.find((key) => key === candidate);
        if (exact) return exact;
        const normalized = existingKeys.find((key) => normalizeVariantPart(key) === normalizeVariantPart(candidate));
        if (normalized) return normalized;
    }
    return null;
};

// POST /api/user/orders
export const placeOrder = asyncHandler(async (req, res) => {
    const { items, shippingAddress, paymentMethod, couponCode, shippingOption } = req.body;
    const normalizedPaymentMethod = paymentMethod === 'cash' ? 'cod' : paymentMethod;
    const userId = req.user?.id || null;
    const rawIdempotencyKey = String(req.get('x-idempotency-key') || '').trim();
    const idempotencyKey = rawIdempotencyKey || null;
    const normalizedGuestEmail = String(shippingAddress?.email || '').trim().toLowerCase();
    const normalizedGuestPhone = String(shippingAddress?.phone || '').replace(/\D/g, '').slice(-10);
    const idempotencyScope = userId
        ? `user:${String(userId)}`
        : `guest:${normalizedGuestEmail || normalizedGuestPhone || 'anonymous'}`;

    if (idempotencyKey) {
        const existingOrder = await Order.findOne({ idempotencyScope, idempotencyKey })
            .select('orderId total trackingNumber')
            .lean();
        if (existingOrder) {
            return res.status(200).json(
                new ApiResponse(
                    200,
                    {
                        orderId: existingOrder.orderId,
                        total: existingOrder.total,
                        trackingNumber: existingOrder.trackingNumber,
                        idempotentReplay: true,
                    },
                    'Duplicate order request ignored. Returning existing order.'
                )
            );
        }
    }

    // 0. Validate Payment Method
    const paymentSettingsDoc = await Settings.findOne({ key: 'payment' }).lean();
    const paymentSettings = paymentSettingsDoc?.value || {};
    
    let isMethodEnabled = true;
    if (normalizedPaymentMethod === 'card' && paymentSettings.cardEnabled === false) isMethodEnabled = false;
    if (normalizedPaymentMethod === 'cod' && paymentSettings.codEnabled === false) isMethodEnabled = false;
    if (normalizedPaymentMethod === 'wallet' && paymentSettings.walletEnabled === false) isMethodEnabled = false;
    if (normalizedPaymentMethod === 'upi' && paymentSettings.upiEnabled === false) isMethodEnabled = false;
    if (normalizedPaymentMethod === 'bank') isMethodEnabled = false; // Bank transfer not supported in new UI

    if (!isMethodEnabled) {
        throw new ApiError(400, `The selected payment method (${normalizedPaymentMethod}) is currently disabled.`);
    }

    // 1. Validate items and calculate subtotal
    let subtotal = 0;
    let totalTaxReporting = 0;
    let extraTaxToPay = 0;
    const enrichedItems = [];
    const vendorMap = {};

    for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product) throw new ApiError(404, `Product not found: ${item.productId}`);
        const linkedVendorId = String(product?.vendorId || '').trim();
        const vendor = linkedVendorId
            ? await Vendor.findById(linkedVendorId).select(
                'commissionRate storeName shippingEnabled defaultShippingRate freeShippingThreshold'
            )
            : null;
        if (!vendor?._id) {
            await Product.updateOne(
                { _id: product._id },
                { $set: { isActive: false, isVisible: false } }
            );
            const productName = String(product?.name || '').trim();
            const productLabel = productName
                ? `Product "${productName}" (ID: ${String(product._id)})`
                : `Product ID ${String(product._id)}`;
            throw new ApiError(
                409,
                `${productLabel} is no longer available from its seller (Vendor ID: ${linkedVendorId || 'unknown'}). Please remove it from cart and try again.`,
                [{
                    code: 'PRODUCT_VENDOR_MISSING',
                    productId: String(product._id),
                    vendorId: linkedVendorId || null,
                }]
            );
        }
        if (product.stock === 'out_of_stock') throw new ApiError(400, `${product.name} is out of stock.`);
        if (product.stockQuantity < item.quantity) throw new ApiError(400, `Only ${product.stockQuantity} units of ${product.name} available.`);

        // Always trust server-side product pricing; never trust client-sent item.price.
        const { price: itemPrice, variantKey, hasVariantAxes } = resolveVariantSelection(product, item.variant);
        const variantStockValue = variantKey ? Number(product?.variants?.stockMap?.get?.(variantKey) ?? product?.variants?.stockMap?.[variantKey]) : null;
        if (hasVariantAxes && variantKey && Number.isFinite(variantStockValue) && variantStockValue < item.quantity) {
            throw new ApiError(400, `Only ${variantStockValue} units available for selected variant of ${product.name}.`);
        }
        const itemSubtotal = itemPrice * item.quantity;
        subtotal += itemSubtotal;

        const variantImage =
            variantKey
                ? String((product?.variants?.imageMap?.get?.(variantKey) ?? product?.variants?.imageMap?.[variantKey]) || '').trim()
                : '';
        const enriched = {
            productId: product._id,
            vendorId: vendor._id,
            name: product.name,
            image: variantImage || product.image,
            price: itemPrice,
            quantity: item.quantity,
            variant: item.variant,
            variantKey: variantKey || undefined,
        };
        enrichedItems.push(enriched);

        // Group by vendor
        const vid = vendor._id.toString();
        if (!vendorMap[vid]) {
            vendorMap[vid] = {
                vendorId: vendor._id,
                vendorName: vendor.storeName,
                commissionRate: vendor.commissionRate || 10,
                shippingEnabled: vendor.shippingEnabled !== false,
                defaultShippingRate: vendor.defaultShippingRate,
                freeShippingThreshold: vendor.freeShippingThreshold,
                items: [],
                subtotal: 0,
                tax: 0,
            };
        }

        const pTaxRate = Number(product.taxRate) || 0;
        const pTaxIncluded = product.taxIncluded || false;
        let itemTax = 0;
        
        if (pTaxRate > 0) {
            if (pTaxIncluded) {
                const basePrice = itemSubtotal / (1 + (pTaxRate / 100));
                itemTax = itemSubtotal - basePrice;
                totalTaxReporting += itemTax;
                vendorMap[vid].tax += itemTax;
            } else {
                itemTax = itemSubtotal * (pTaxRate / 100);
                totalTaxReporting += itemTax;
                extraTaxToPay += itemTax;
                vendorMap[vid].tax += itemTax;
            }
        }

        vendorMap[vid].items.push(enriched);
        vendorMap[vid].subtotal += itemSubtotal;
    }

    // 2. Validate coupon
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
        if (!coupon) throw new ApiError(400, 'Invalid coupon code.');
        if (coupon.startsAt && coupon.startsAt > Date.now()) throw new ApiError(400, 'Coupon is not active yet.');
        if (coupon.expiresAt && coupon.expiresAt < Date.now()) throw new ApiError(400, 'Coupon has expired.');
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new ApiError(400, 'Coupon usage limit reached.');
        if (subtotal < coupon.minOrderValue) throw new ApiError(400, `Minimum order value for this coupon is Rs.${coupon.minOrderValue}.`);

        if (coupon.type === 'percentage') {
            couponDiscount = (subtotal * coupon.value) / 100;
            if (coupon.maxDiscount) couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
        } else if (coupon.type === 'fixed') {
            couponDiscount = coupon.value;
        }
        appliedCoupon = coupon;
    }

    // 3. Calculate shipping
    const vendorShippingInput = Object.values(vendorMap).map((vendorGroup) => ({
        vendorId: vendorGroup.vendorId,
        subtotal: vendorGroup.subtotal,
        shippingEnabled: vendorGroup.shippingEnabled,
        defaultShippingRate: vendorGroup.defaultShippingRate,
        freeShippingThreshold: vendorGroup.freeShippingThreshold,
    }));
    const { totalShipping: shipping, shippingByVendor } = await calculateVendorShippingForGroups({
        vendorGroups: vendorShippingInput,
        shippingAddress,
        shippingOption,
        couponType: appliedCoupon?.type || null,
    });

    // 4. Calculate final totals (using dynamic tax)
    const tax = parseFloat(totalTaxReporting.toFixed(2));
    const total = parseFloat((subtotal - couponDiscount + shipping + extraTaxToPay).toFixed(2));

    // 5. Build vendor item groups
    const vendorItems = Object.values(vendorMap).map((v) => ({
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        items: v.items,
        subtotal: v.subtotal,
        shipping: Number(shippingByVendor[String(v.vendorId)] || 0),
        tax: parseFloat(v.tax.toFixed(2)),
        discount: 0,
        status: 'pending',
    }));

    // 6-9. Transactional order creation to avoid partial writes.
    let order = null;
    let idempotentReplay = false;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            if (idempotencyKey) {
                const existingOrder = await Order.findOne({ idempotencyScope, idempotencyKey })
                    .select('orderId total trackingNumber')
                    .session(session);
                if (existingOrder) {
                    order = existingOrder;
                    idempotentReplay = true;
                    return;
                }
            }

            const [createdOrder] = await Order.create([{
                orderId: generateOrderId(),
                userId,
                items: enrichedItems,
                vendorItems,
                shippingAddress,
                paymentMethod: normalizedPaymentMethod,
                // Keep every new order pending until gateway/webhook confirmation is implemented.
                paymentStatus: 'pending',
                subtotal,
                shipping,
                tax,
                discount: couponDiscount,
                total,
                couponCode: couponCode?.toUpperCase(),
                couponDiscount,
                trackingNumber: generateTrackingNumber(),
                estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // +5 days
                idempotencyKey: idempotencyKey || undefined,
                idempotencyScope: idempotencyKey ? idempotencyScope : undefined,
            }], { session });
            order = createdOrder;

            // 7. Deduct stock atomically to prevent oversell under concurrent checkout.
            for (const item of enrichedItems) {
                const variantPath = item.variantKey ? `variants.stockMap.${item.variantKey}` : null;
                const baseFilter = {
                    _id: item.productId,
                    stock: { $ne: 'out_of_stock' },
                    stockQuantity: { $gte: Number(item.quantity || 0) },
                };
                if (variantPath) {
                    baseFilter[variantPath] = { $gte: Number(item.quantity || 0) };
                }

                const updatePayload = { $inc: { stockQuantity: -Number(item.quantity || 0) } };
                if (variantPath) {
                    updatePayload.$inc[variantPath] = -Number(item.quantity || 0);
                }

                const updatedProduct = await Product.findOneAndUpdate(
                    baseFilter,
                    updatePayload,
                    { new: true, session }
                );

                if (!updatedProduct) {
                    throw new ApiError(409, `Insufficient stock while processing ${item.name}. Please refresh and try again.`);
                }

                const nextStockState =
                    updatedProduct.stockQuantity <= 0
                        ? 'out_of_stock'
                        : (updatedProduct.stockQuantity <= updatedProduct.lowStockThreshold ? 'low_stock' : 'in_stock');

                await Product.updateOne(
                    { _id: updatedProduct._id },
                    { $set: { stock: nextStockState } },
                    { session }
                );
            }

            // 8. Record commissions
            const commissionDocs = Object.values(vendorMap).map((v) => ({
                orderId: order._id,
                vendorId: v.vendorId,
                vendorName: v.vendorName,
                subtotal: v.subtotal,
                commissionRate: v.commissionRate,
                commission: parseFloat(((v.subtotal * v.commissionRate) / 100).toFixed(2)),
                vendorEarnings: parseFloat((v.subtotal - (v.subtotal * v.commissionRate) / 100).toFixed(2)),
            }));
            await Commission.insertMany(commissionDocs, { session });

            // 9. Increment coupon usage
            if (appliedCoupon) {
                if (appliedCoupon.usageLimit) {
                    const usageResult = await Coupon.updateOne(
                        {
                            _id: appliedCoupon._id,
                            usedCount: { $lt: appliedCoupon.usageLimit },
                        },
                        { $inc: { usedCount: 1 } },
                        { session }
                    );
                    if (!usageResult?.modifiedCount) {
                        throw new ApiError(409, 'Coupon usage limit reached.');
                    }
                } else {
                    await Coupon.updateOne(
                        { _id: appliedCoupon._id },
                        { $inc: { usedCount: 1 } },
                        { session }
                    );
                }
            }
        });
    } catch (err) {
        if (idempotencyKey && err?.code === 11000) {
            const existingOrder = await Order.findOne({ idempotencyScope, idempotencyKey })
                .select('orderId total trackingNumber')
                .lean();
            if (existingOrder) {
                order = existingOrder;
                idempotentReplay = true;
            } else {
                throw err;
            }
        } else {
            throw err;
        }
    } finally {
        await session.endSession();
    }

    const responseStatus = idempotentReplay ? 200 : 201;
    const responseMessage = idempotentReplay
        ? 'Duplicate order request ignored. Returning existing order.'
        : 'Order placed successfully.';
    res.status(responseStatus).json(
        new ApiResponse(
            responseStatus,
            {
                orderId: order.orderId,
                total: order.total,
                trackingNumber: order.trackingNumber,
                ...(idempotentReplay ? { idempotentReplay: true } : {}),
            },
            responseMessage
        )
    );
});

// GET /api/user/orders
export const getUserOrders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await Order.countDocuments({ userId: req.user.id });
    res.status(200).json(new ApiResponse(200, { orders, total, page: Number(page), pages: Math.ceil(total / limit) }, 'Orders fetched.'));
});

// GET /api/user/orders/:id
export const getOrderDetail = asyncHandler(async (req, res) => {
    const order = await Order.findOne({ orderId: req.params.id, userId: req.user.id });
    if (!order) throw new ApiError(404, 'Order not found.');
    res.status(200).json(new ApiResponse(200, order, 'Order detail fetched.'));
});

// PATCH /api/user/orders/:id/cancel
export const cancelOrder = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const order = await Order.findOne({ orderId: req.params.id, userId: req.user.id }).session(session);
            if (!order) throw new ApiError(404, 'Order not found.');
            if (!['pending', 'processing'].includes(order.status)) throw new ApiError(400, 'Order cannot be cancelled at this stage.');

            order.status = 'cancelled';
            order.cancelledAt = new Date();
            order.cancellationReason = req.body.reason || 'Cancelled by customer';
            if (Array.isArray(order.vendorItems)) {
                order.vendorItems = order.vendorItems.map((vendorGroup) => ({
                    ...vendorGroup.toObject(),
                    status: 'cancelled',
                }));
            }
            await order.save({ session });

            // Restore stock and status
            for (const item of order.items) {
                const quantity = Number(item.quantity || 0);
                if (quantity <= 0) continue;

                const productSnapshot = await Product.findById(item.productId)
                    .select('variants.stockMap variants.prices')
                    .session(session)
                    .lean();
                const variantKey = resolveOrderItemVariantKey(productSnapshot, item);

                const incUpdate = { stockQuantity: quantity };
                if (variantKey) {
                    incUpdate[`variants.stockMap.${variantKey}`] = quantity;
                }

                const product = await Product.findByIdAndUpdate(item.productId, { $inc: incUpdate }, { new: true, session });
                if (!product) continue;

                const nextStockState =
                    product.stockQuantity <= 0
                        ? 'out_of_stock'
                        : (product.stockQuantity <= product.lowStockThreshold ? 'low_stock' : 'in_stock');

                await Product.updateOne(
                    { _id: product._id },
                    { $set: { stock: nextStockState } },
                    { session }
                );
            }

            // Reverse vendor earnings visibility for this order.
            await Commission.updateMany(
                {
                    orderId: order._id,
                    status: { $ne: 'cancelled' },
                },
                {
                    $set: {
                        status: 'cancelled',
                        paidAt: null,
                        settlementId: null,
                    },
                },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    res.status(200).json(new ApiResponse(200, null, 'Order cancelled successfully.'));
});

const normalizeReturnRequest = (requestDoc) => {
    const request = typeof requestDoc?.toObject === 'function' ? requestDoc.toObject() : requestDoc;
    const orderOrderId = request?.orderId?.orderId || '';
    const orderRefId = request?.orderId?._id || request?.orderId || null;
    return {
        ...request,
        id: String(request?._id || ''),
        orderId: orderOrderId || String(orderRefId || ''),
        orderRefId: orderRefId ? String(orderRefId) : null,
        requestDate: request?.createdAt,
    };
};

// POST /api/user/orders/:id/returns
export const createReturnRequest = asyncHandler(async (req, res) => {
    const order = await Order.findOne({ orderId: req.params.id, userId: req.user.id });
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.status !== 'delivered') {
        throw new ApiError(400, 'Return can only be requested for delivered orders.');
    }

    const requestedVendorId = String(req.body.vendorId || '').trim();
    const orderItems = Array.isArray(order.items) ? order.items : [];
    const orderVendorIds = [...new Set(orderItems.map((item) => String(item?.vendorId || '')).filter(Boolean))];

    let vendorId = requestedVendorId;
    if (!vendorId) {
        if (orderVendorIds.length > 1) {
            throw new ApiError(400, 'vendorId is required for multi-vendor orders.');
        }
        vendorId = orderVendorIds[0] || '';
    }
    if (!vendorId) {
        throw new ApiError(400, 'Unable to resolve vendor for return request.');
    }

    const vendorScopedItems = orderItems.filter((item) => String(item?.vendorId || '') === vendorId);
    if (vendorScopedItems.length === 0) {
        throw new ApiError(400, 'Selected vendor has no items in this order.');
    }

    const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
    let normalizedItems = [];

    if (requestedItems.length > 0) {
        normalizedItems = requestedItems.map((inputItem) => {
            const productId = String(inputItem?.productId || '');
            const orderItem = vendorScopedItems.find((it) => String(it?.productId || '') === productId);
            if (!orderItem) {
                throw new ApiError(400, `Product ${productId} is not valid for this return request.`);
            }

            const requestedQty = Number(inputItem?.quantity || 0);
            const maxQty = Number(orderItem?.quantity || 0);
            if (!Number.isFinite(requestedQty) || requestedQty <= 0 || requestedQty > maxQty) {
                throw new ApiError(400, `Invalid quantity for product ${orderItem.name || productId}.`);
            }

            return {
                productId: orderItem.productId,
                name: orderItem.name,
                quantity: requestedQty,
                reason: String(inputItem?.reason || req.body.reason || '').trim(),
            };
        });
    } else {
        normalizedItems = vendorScopedItems.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: Number(item.quantity || 1),
            reason: String(req.body.reason || '').trim(),
        }));
    }

    const existingOpen = await ReturnRequest.findOne({
        orderId: order._id,
        userId: req.user.id,
        vendorId,
        status: { $in: ['pending', 'approved', 'processing'] },
    });
    if (existingOpen) {
        throw new ApiError(409, 'An active return request already exists for this vendor in the selected order.');
    }

    const refundAmount = normalizedItems.reduce((sum, item) => {
        const orderItem = vendorScopedItems.find((it) => String(it?.productId || '') === String(item.productId || ''));
        const unitPrice = Number(orderItem?.price || 0);
        return sum + unitPrice * Number(item.quantity || 0);
    }, 0);

    const request = await ReturnRequest.create({
        orderId: order._id,
        userId: req.user.id,
        vendorId,
        items: normalizedItems,
        reason: String(req.body.reason || '').trim(),
        status: 'pending',
        refundAmount: Number(refundAmount.toFixed(2)),
        refundStatus: 'pending',
        images: Array.isArray(req.body.images) ? req.body.images : [],
    });

    const admins = await Admin.find({ isActive: true }).select('_id').lean();
    await Promise.all(
        admins.map((admin) =>
            createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: 'New Return Request',
                message: `Order ${order.orderId} has a new return request awaiting review.`,
                type: 'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId: String(order.orderId),
                    vendorId: String(vendorId),
                },
            })
        )
    );

    await createNotification({
        recipientId: vendorId,
        recipientType: 'vendor',
        title: 'New Return Request',
        message: `Order ${order.orderId} has a return request from customer.`,
        type: 'order',
        data: {
            returnRequestId: String(request._id),
            orderId: String(order.orderId),
        },
    });

    const populated = await ReturnRequest.findById(request._id)
        .populate('orderId', 'orderId total createdAt')
        .populate('vendorId', 'storeName email');

    res.status(201).json(new ApiResponse(201, normalizeReturnRequest(populated), 'Return request submitted successfully.'));
});

// GET /api/user/returns
export const getUserReturnRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const filter = { userId: req.user.id };
    if (status && status !== 'all') filter.status = status;

    const [requests, total] = await Promise.all([
        ReturnRequest.find(filter)
            .populate('orderId', 'orderId total createdAt')
            .populate('vendorId', 'storeName email')
            .sort({ createdAt: -1 })
            .skip((numericPage - 1) * numericLimit)
            .limit(numericLimit),
        ReturnRequest.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        returnRequests: requests.map(normalizeReturnRequest),
        pagination: {
            total,
            page: numericPage,
            limit: numericLimit,
            pages: Math.ceil(total / numericLimit),
        },
    }, 'Return requests fetched.'));
});

// GET /api/user/returns/:id
export const getUserReturnRequestById = asyncHandler(async (req, res) => {
    const request = await ReturnRequest.findOne({ _id: req.params.id, userId: req.user.id })
        .populate('orderId', 'orderId total createdAt')
        .populate('vendorId', 'storeName email');
    if (!request) throw new ApiError(404, 'Return request not found.');
    res.status(200).json(new ApiResponse(200, normalizeReturnRequest(request), 'Return request fetched.'));
});
