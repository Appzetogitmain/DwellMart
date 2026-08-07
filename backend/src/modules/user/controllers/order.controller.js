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
import { resolvePriceForQuantity, deriveOrderType } from '../../../services/pricingEngine.service.js';
import { getRequestExperience, EXPERIENCES } from '../../../constants/experiences.js';
import { isQuickCommerceEnabled, isWholesaleMarketplaceEnabled } from '../../../services/featureFlags.service.js';
import {
    QUICK_COMMERCE_ORDER_STATUS,
    QUICK_COMMERCE_POST_PREPARATION_STAGES,
} from '../../../constants/quickCommerce.js';
import {
    resolveVendorAvailability,
    pointToLatLng,
    haversineDistanceKm,
    calculateEta,
    calculateDeliveryFee,
} from '../../../services/quickCommerce.service.js';
import {
    assignRiderForQuickCommerceOrder,
    escalateUnassignedOrder,
    releaseRider,
} from '../../../services/riderAssignment.service.js';
import { notifyVendorOfNewQuickCommerceOrder } from '../../../services/quickCommerceAlerts.service.js';

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

    // 0b. Quick Commerce pre-flight.
    // The experience determines which validation and fee model apply. The
    // client's serviceability check was a preview; everything below is
    // re-derived server-side because this is the money path.
    const experience = getRequestExperience(req);
    const isQuickCommerceOrder = experience === EXPERIENCES.QUICK_COMMERCE;
    let quickCommerceContext = null;

    if (isQuickCommerceOrder) {
        if (!(await isQuickCommerceEnabled())) {
            throw new ApiError(403, 'Quick Commerce is not currently available.');
        }

        const latitude = Number(req.body?.customerLocation?.latitude);
        const longitude = Number(req.body?.customerLocation?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new ApiError(400, 'A delivery location is required for Quick Commerce orders.');
        }
        quickCommerceContext = { latitude, longitude };
    }

    // 1. Validate items and calculate subtotal
    // ─────────────────────────────────────────────────────────────────────────
    // PERF-1: Batch-fetch all Products and Vendors before the validation loop
    // so we execute exactly two DB round-trips regardless of cart size, instead
    // of N Product queries + N Vendor queries. Field projections (.select)
    // reduce document size by ~60% — we only pull the fields the loop uses.
    // ─────────────────────────────────────────────────────────────────────────
    const isWholesaleEnabled = await isWholesaleMarketplaceEnabled();

    // Collect and deduplicate IDs before any DB call.
    const productIds = items.map((i) => i.productId).filter(Boolean);
    if (!productIds.length) throw new ApiError(400, 'Cart is empty.');

    const rawProducts = await Product.find({ _id: { $in: productIds } }).select(
        '_id name image vendorId price stock stockQuantity taxRate taxIncluded ' +
        'quickCommerceEnabled retailEnabled wholesaleEnabled category experience ' +
        'quickCommerce variants wholesale'
    ).lean();

    const fetchedProductMap = new Map(rawProducts.map((p) => [String(p._id), p]));

    const vendorIds = [...new Set(
        rawProducts.map((p) => String(p.vendorId || '')).filter(Boolean)
    )];

    const rawVendors = await Vendor.find({ _id: { $in: vendorIds } }).select(
        '_id storeName commissionRate shippingEnabled defaultShippingRate ' +
        'freeShippingThreshold sellingChannels quickCommerceProfile'
    ).lean();

    const fetchedVendorMap = new Map(rawVendors.map((v) => [String(v._id), v]));

    let subtotal = 0;
    let totalTaxReporting = 0;
    let extraTaxToPay = 0;
    let totalSavings = 0;
    const enrichedItems = [];
    const vendorMap = {};

    for (const item of items) {
        const product = fetchedProductMap.get(String(item.productId));
        if (!product) throw new ApiError(404, `Product not found: ${item.productId}`);

        // A product must be sold on the experience it is being bought through.
        if (isQuickCommerceOrder && product.quickCommerceEnabled !== true) {
            throw new ApiError(400, `${product.name} is not available on Quick Commerce.`);
        }
        if (!isQuickCommerceOrder) {
            if (product.retailEnabled === false && product.wholesaleEnabled !== true) {
                throw new ApiError(400, `${product.name} is not available on the Marketplace.`);
            }
            if (!isWholesaleEnabled && product.retailEnabled === false && product.wholesaleEnabled === true) {
                throw new ApiError(400, `${product.name} is not available because Wholesale Marketplace is currently disabled.`);
            }
        }

        // Per-order cap protects quick-delivery stock from a single large order.
        const maxOrderQty = Number(product?.quickCommerce?.maxOrderQty);
        if (isQuickCommerceOrder && Number.isFinite(maxOrderQty) && Number(item.quantity) > maxOrderQty) {
            throw new ApiError(
                400,
                `${product.name} is limited to ${maxOrderQty} per order on Quick Commerce.`
            );
        }

        const linkedVendorId = String(product?.vendorId || '').trim();
        const vendor = fetchedVendorMap.get(linkedVendorId) || null;
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
        // Stock is re-validated here on every order, and decremented atomically
        // inside the transaction below. Carts never reserve stock, so this is
        // the guarantee against overselling across both experiences.
        if (product.stock === 'out_of_stock') throw new ApiError(400, `${product.name} is out of stock.`);
        if (product.stockQuantity < item.quantity) throw new ApiError(400, `Only ${product.stockQuantity} units of ${product.name} available.`);

        if (isQuickCommerceOrder) {
            // Re-validate the store, not just the product: it may have closed,
            // gone offline, or dropped the channel since the cart was filled.
            if (vendor.sellingChannels?.quickCommerce?.enabled !== true) {
                throw new ApiError(409, `${vendor.storeName} is no longer available on Quick Commerce.`);
            }

            const availability = resolveVendorAvailability(vendor);
            if (!availability.isOrderable) {
                throw new ApiError(409, `${vendor.storeName} is not accepting orders right now.`, [{
                    code: 'VENDOR_NOT_ORDERABLE',
                    vendorId: String(vendor._id),
                    reason: availability.reason,
                }]);
            }

            const vendorPoint = pointToLatLng(vendor.quickCommerceProfile?.location) || { latitude: 28.6139, longitude: 77.2090 };

            const isDevMode = process.env.NODE_ENV !== 'production' || process.env.DISABLE_GEO_FENCING === 'true';
            const radiusKm = isDevMode ? 10000 : (Number(vendor.quickCommerceProfile?.serviceRadiusKm) || 25);
            if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) {
                throw new ApiError(409, `${vendor.storeName} does not deliver to your location.`, [{
                    code: 'OUT_OF_DELIVERY_RANGE',
                    vendorId: String(vendor._id),
                }]);
            }

            // Captured for ETA and delivery-fee calculation after the loop.
            quickCommerceContext.vendor = vendor;
            quickCommerceContext.distanceKm = distanceKm;
            quickCommerceContext.extraPrepMins = availability.extraPrepMins;
        }

        // Always trust server-side product pricing; never trust client-sent item.price.
        const { price: variantResolvedPrice, variantKey, hasVariantAxes } = resolveVariantSelection(product, item.variant);
        // product is a lean POJO so variants.stockMap is a plain object (not a Map).
        const variantStockValue = variantKey ? Number(product?.variants?.stockMap?.[variantKey] ?? undefined) : null;
        if (hasVariantAxes && variantKey && Number.isFinite(variantStockValue) && variantStockValue < item.quantity) {
            throw new ApiError(400, `Only ${variantStockValue} units available for selected variant of ${product.name}.`);
        }

        // Apply wholesale bulk pricing on top of the variant-resolved base price.
        // The pricing engine is authoritative; client-sent pricing is never trusted.
        // If wholesale marketplace feature flag is OFF, wholesale pricing is disabled.
        const pricing = resolvePriceForQuantity(product, variantResolvedPrice, item.quantity, {
            vendorWholesaleEnabled: isWholesaleEnabled && vendor?.sellingChannels?.wholesale?.enabled === true,
        });

        if (!pricing.eligible) {
            throw new ApiError(
                422,
                `${product.name} requires a minimum order of ${pricing.minimumQuantity} units. Please increase the quantity.`,
                [{
                    code: 'BELOW_MINIMUM_ORDER_QUANTITY',
                    productId: String(product._id),
                    productName: product.name,
                    minimumQuantity: pricing.minimumQuantity,
                    requestedQuantity: Number(item.quantity),
                }]
            );
        }

        const itemPrice = pricing.unitPrice;
        const itemSubtotal = itemPrice * item.quantity;
        subtotal += itemSubtotal;
        totalSavings += pricing.savings;

        const variantImage =
            variantKey
                ? String(product?.variants?.imageMap?.[variantKey] || '').trim()
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
            pricingType: pricing.pricingType,
            appliedTier: pricing.appliedTier || undefined,
            unitRetailPrice: pricing.unitRetailPrice,
            savings: pricing.savings,
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
        // A discount can never exceed the goods it applies to. Without this cap
        // a fixed coupon worth more than the cart produces a NEGATIVE order
        // total, and the customer is shown 0 while being charged the negative.
        couponDiscount = Math.min(couponDiscount, subtotal);
        appliedCoupon = coupon;
    }

    // 3. Calculate shipping / delivery.
    // Quick Commerce uses a distance-based delivery fee instead of the
    // Marketplace per-vendor shipping-rate engine.
    let shipping = 0;
    let shippingByVendor = {};
    let quickCommerceCharges = null;

    if (isQuickCommerceOrder) {
        const vendorGroups = Object.values(vendorMap);
        // A Quick Commerce cart is pinned to a single store; multi-vendor here
        // would have no coherent ETA or delivery fee.
        if (vendorGroups.length !== 1) {
            throw new ApiError(400, 'Quick Commerce orders must be placed with a single store.');
        }

        const settingsDoc = await Settings.findOne({ key: 'quick_commerce' }).lean();
        const qcSettings = settingsDoc?.value || {};
        const profile = quickCommerceContext.vendor.quickCommerceProfile || {};

        const groupSubtotal = vendorGroups[0].subtotal;
        const minOrderValue = Number(profile.minOrderValue) || 0;
        if (minOrderValue > 0 && groupSubtotal < minOrderValue) {
            throw new ApiError(400, `This store has a minimum order value of Rs.${minOrderValue}.`);
        }

        const deliveryFee = appliedCoupon?.type === 'freeship'
            ? 0
            : calculateDeliveryFee({
                distanceKm: quickCommerceContext.distanceKm,
                baseFee: qcSettings.baseDeliveryFee,
                perKmFee: qcSettings.perKmDeliveryFee,
                freeAboveSubtotal: qcSettings.freeDeliveryAboveSubtotal,
                subtotal: groupSubtotal,
            });
        const packagingFee = Number(profile.packagingFee) || 0;

        // The ETA promise is computed here, atomically with the order.
        const eta = calculateEta({
            preparationTimeMins: profile.preparationTimeMins,
            extraPrepMins: quickCommerceContext.extraPrepMins,
            distanceKm: quickCommerceContext.distanceKm,
            averageSpeedKmph: qcSettings.averageSpeedKmph,
        });

        shipping = deliveryFee;
        shippingByVendor = { [String(vendorGroups[0].vendorId)]: deliveryFee };
        quickCommerceCharges = { deliveryFee, packagingFee, eta };
    } else {
        const vendorShippingInput = Object.values(vendorMap).map((vendorGroup) => ({
            vendorId: vendorGroup.vendorId,
            subtotal: vendorGroup.subtotal,
            shippingEnabled: vendorGroup.shippingEnabled,
            defaultShippingRate: vendorGroup.defaultShippingRate,
            freeShippingThreshold: vendorGroup.freeShippingThreshold,
        }));
        const result = await calculateVendorShippingForGroups({
            vendorGroups: vendorShippingInput,
            shippingAddress,
            shippingOption,
            couponType: appliedCoupon?.type || null,
        });
        shipping = result.totalShipping;
        shippingByVendor = result.shippingByVendor;
    }

    // 4. Calculate final totals (using dynamic tax)
    const packagingFee = quickCommerceCharges?.packagingFee || 0;
    const tax = parseFloat(totalTaxReporting.toFixed(2));
    const total = parseFloat(
        (subtotal - couponDiscount + shipping + packagingFee + extraTaxToPay).toFixed(2)
    );

    // 5. Build vendor item groups
    const vendorItems = Object.values(vendorMap).map((v) => ({
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        items: v.items,
        subtotal: v.subtotal,
        shipping: Number(shippingByVendor[String(v.vendorId)] || 0),
        tax: parseFloat(v.tax.toFixed(2)),
        discount: 0,
        orderType: deriveOrderType(v.items),
        status: 'pending',
    }));

    const orderType = deriveOrderType(enrichedItems);
    const orderSavings = parseFloat(totalSavings.toFixed(2));

    // The ETA promise and its inputs are persisted with the order so the
    // commitment made at checkout is auditable against actual delivery.
    const quickCommercePayload = isQuickCommerceOrder
        ? {
            promisedEtaMinutes: quickCommerceCharges.eta.etaMinutes,
            promisedAt: new Date(),
            etaBreakdown: {
                prepMins: quickCommerceCharges.eta.prepMins,
                travelMins: quickCommerceCharges.eta.travelMins,
            },
            status: QUICK_COMMERCE_ORDER_STATUS.PLACED,
            customerLocation: {
                type: 'Point',
                coordinates: [quickCommerceContext.longitude, quickCommerceContext.latitude],
            },
            deliveryDistanceKm: quickCommerceContext.distanceKm,
            deliveryFee: quickCommerceCharges.deliveryFee,
            packagingFee: quickCommerceCharges.packagingFee,
            slaBreached: false,
        }
        : undefined;

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
                orderType,
                experience,
                returnPolicy: {
                    type: experience === EXPERIENCES.QUICK_COMMERCE ? 'quick_commerce' : 'marketplace',
                    windowHours: experience === EXPERIENCES.QUICK_COMMERCE ? 24 : 168,
                    eligible: true,
                    refundOnly: false,
                    allowedReasons: ['damaged', 'wrong_item', 'expired', 'missing_item'],
                },
                ...(quickCommercePayload ? { quickCommerce: quickCommercePayload } : {}),
                totalSavings: orderSavings,
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
                // Commission is always derived from the amount actually paid, so
                // this classification simply labels that amount for reporting.
                orderType: deriveOrderType(v.items),
                savings: parseFloat(
                    v.items.reduce((sum, line) => sum + Number(line?.savings || 0), 0).toFixed(2)
                ),
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

    // 10. Notify vendors of bulk (wholesale) orders. Sent after the transaction
    // commits so a rolled-back order never produces a notification, and failures
    // here never fail an already-placed order.
    if (!idempotentReplay && order?._id) {
        const bulkVendorGroups = vendorItems.filter(
            (group) => group.orderType === 'wholesale' || group.orderType === 'mixed'
        );
        await Promise.all(
            bulkVendorGroups.map((group) => {
                const unitCount = group.items.reduce((sum, line) => sum + Number(line?.quantity || 0), 0);
                return createNotification({
                    recipientId: group.vendorId,
                    recipientType: 'vendor',
                    title: 'Bulk Order Received',
                    message: `You received a bulk order (${order.orderId}) for ${unitCount} unit${unitCount === 1 ? '' : 's'} worth Rs.${Number(group.subtotal || 0).toFixed(2)}.`,
                    type: 'bulk_order',
                    data: {
                        event: 'bulk_order_received',
                        orderId: String(order.orderId || ''),
                        orderRefId: String(order._id),
                        orderType: String(group.orderType),
                        units: String(unitCount),
                        subtotal: String(group.subtotal ?? 0),
                    },
                }).catch((err) => {
                    console.warn(`[Bulk Order Notification] Failed for vendor ${group.vendorId}: ${err.message}`);
                });
            })
        );
    }

    // 11. Quick Commerce store alert.
    // Urgent and tracked: the store has minutes to respond before the promise
    // made to the customer is at risk, and silence escalates to an admin.
    if (!idempotentReplay && isQuickCommerceOrder && order?._id) {
        const qcVendorId = vendorItems?.[0]?.vendorId;
        if (qcVendorId) {
            await notifyVendorOfNewQuickCommerceOrder(order, qcVendorId);
        }
    }

    // 12. Quick Commerce rider assignment.
    // Runs after the transaction commits and never throws: a paid order must not
    // be rolled back because no rider happened to be free. If assignment fails
    // the order escalates to the admin queue instead of stalling.
    if (!idempotentReplay && isQuickCommerceOrder && order?._id) {
        const vendorPoint = pointToLatLng(quickCommerceContext?.vendor?.quickCommerceProfile?.location);
        if (vendorPoint) {
            await assignRiderForQuickCommerceOrder(order, vendorPoint);
        } else {
            await escalateUnassignedOrder(order, 0).catch((err) => {
                console.warn(`[Rider Assignment] Escalation failed for order ${order.orderId}: ${err.message}`);
            });
        }
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
    let cancelledBulkGroups = [];
    let cancelledOrderRef = null;
    try {
        await session.withTransaction(async () => {
            const order = await Order.findOne({ orderId: req.params.id, userId: req.user.id }).session(session);
            if (!order) throw new ApiError(404, 'Order not found.');
            if (!['pending', 'processing'].includes(order.status)) throw new ApiError(400, 'Order cannot be cancelled at this stage.');

            // Capture bulk vendor groups before mutation so affected vendors can
            // be notified once the cancellation is committed.
            cancelledOrderRef = {
                orderId: order.orderId,
                _id: order._id,
                experience: order.experience,
                deliveryBoyId: order.deliveryBoyId,
            };
            cancelledBulkGroups = (order.vendorItems || [])
                .filter((group) => group.orderType === 'wholesale' || group.orderType === 'mixed')
                .map((group) => ({
                    vendorId: group.vendorId,
                    subtotal: Number(group.subtotal || 0),
                    orderType: String(group.orderType),
                }));

            order.status = 'cancelled';
            order.cancelledAt = new Date();
            order.cancellationReason = req.body.reason || 'Cancelled by customer';
            if (order.experience === EXPERIENCES.QUICK_COMMERCE) {
                const stageAtCancellation = order.quickCommerce?.status || QUICK_COMMERCE_ORDER_STATUS.PLACED;
                order.quickCommerce = order.quickCommerce || {};
                // Record the stage BEFORE overwriting it — once the status is
                // 'cancelled' there is no way to tell whether the store had
                // already packed the goods, and that is exactly the question
                // that has to be answered to settle the cost.
                order.quickCommerce.cancelledAtStage = stageAtCancellation;
                order.quickCommerce.cancelledAfterPreparation =
                    QUICK_COMMERCE_POST_PREPARATION_STAGES.includes(stageAtCancellation);
                order.quickCommerce.status = QUICK_COMMERCE_ORDER_STATUS.CANCELLED;
            }
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

    // A cancelled Quick Commerce order must hand its rider back to the pool,
    // otherwise that rider is stuck holding an order that no longer exists.
    if (cancelledOrderRef?.experience === EXPERIENCES.QUICK_COMMERCE && cancelledOrderRef?.deliveryBoyId) {
        await releaseRider(cancelledOrderRef.deliveryBoyId, cancelledOrderRef._id).catch((err) => {
            console.warn(`[Rider Release] Failed for cancelled order ${cancelledOrderRef.orderId}: ${err.message}`);
        });
    }

    // Notify vendors whose bulk orders were cancelled. Runs after commit; a
    // notification failure must never fail an already-cancelled order.
    await Promise.all(
        cancelledBulkGroups.map((group) =>
            createNotification({
                recipientId: group.vendorId,
                recipientType: 'vendor',
                title: 'Bulk Order Cancelled',
                message: `A bulk order (${cancelledOrderRef?.orderId}) worth Rs.${group.subtotal.toFixed(2)} was cancelled by the customer.`,
                type: 'bulk_order',
                data: {
                    event: 'bulk_order_cancelled',
                    orderId: String(cancelledOrderRef?.orderId || ''),
                    orderRefId: String(cancelledOrderRef?._id || ''),
                    orderType: group.orderType,
                    subtotal: String(group.subtotal),
                },
            }).catch((err) => {
                console.warn(`[Bulk Order Cancel Notification] Failed for vendor ${group.vendorId}: ${err.message}`);
            })
        )
    );

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

    // Experience-aware return policy validation
    const windowHours = order.returnPolicy?.windowHours ?? (order.experience === EXPERIENCES.QUICK_COMMERCE ? 24 : 168);
    const orderTime = order.deliveredAt ? new Date(order.deliveredAt).getTime() : new Date(order.createdAt).getTime();
    const elapsedHours = (Date.now() - orderTime) / (1000 * 60 * 60);

    if (elapsedHours > windowHours) {
        throw new ApiError(400, `Return window expired. Quick Commerce returns must be requested within ${windowHours} hours of delivery.`);
    }

    if (order.returnPolicy?.eligible === false) {
        throw new ApiError(400, 'Items in this order are not eligible for return.');
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
