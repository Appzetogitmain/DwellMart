/**
 * OrderSplitterEngine
 *
 * The transactional core of the enterprise checkout architecture.
 *
 * Responsibility: Given a validated CheckoutSession payload, atomically:
 *   1. Create one FulfillmentGroup per (vendor × fulfillmentType) combination.
 *   2. Create one independent Order per FulfillmentGroup.
 *   3. Populate the CheckoutSession.paymentAllocationLedger.
 *   4. Reserve inventory for each Order.
 *   5. Emit marketplace events.
 *
 * All DB writes run inside a single MongoDB session transaction.
 * If ANY step fails the entire transaction rolls back → no partial state.
 *
 * This module is the ONLY code that creates Orders during the new checkout
 * path. Legacy order creation in orderController.js continues to work
 * unchanged for backward compatibility.
 */

import mongoose from 'mongoose';

import Order from '../../models/Order.model.js';
import { FulfillmentGroup } from '../../models/FulfillmentGroup.model.js';
import { CheckoutSession } from '../../models/CheckoutSession.model.js';
import Product from '../../models/Product.model.js';
import Vendor from '../../models/Vendor.model.js';
import Settings from '../../models/Settings.model.js';

import { resolvePriceForQuantity, deriveOrderType } from '../pricingEngine.service.js';
import { isWholesaleMarketplaceEnabled } from '../featureFlags.service.js';
import {
    resolveVendorAvailability,
    pointToLatLng,
    haversineDistanceKm,
    calculateEta,
    calculateDeliveryFee,
    getQuickCommerceSettings,
    resolveEffectiveQCSettings,
} from '../quickCommerce.service.js';
import { assertCartValid } from './CartValidationPipeline.js';
import { commitReservation } from './InventoryReservationService.js';
import { marketplaceEventBus, MARKETPLACE_EVENTS } from '../events/marketplaceEventBus.js';
import { roundMoney, assertPriceConsistency } from '../PriceReconciliationService.js';
import { calculateVendorShippingForGroups } from '../vendorShipping.service.js';

// ── ID helpers ──────────────────────────────────────────────────────────────

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

const randomId = (len = 8) =>
    Math.random().toString(36).substring(2, 2 + len).toUpperCase();

export const generateSessionId  = () => `CS-${today()}-${randomId(8)}`;
export const generateOrderId    = (ft) => {
    const prefix = ft === 'quick_commerce' ? 'QC' : ft === 'wholesale' ? 'WS' : 'RT';
    return `${prefix}-${today()}-${randomId(10)}`;
};

// ── Fulfillment type resolution ──────────────────────────────────────────────
const resolveFT = (item, product = null) => {
    // 1. Tagged item fulfillmentType in cart payload
    const rawFt = String(item?.fulfillmentType || item?.experience || '').toLowerCase();
    if (rawFt === 'quick_commerce') return 'quick_commerce';
    if (rawFt === 'wholesale')      return 'wholesale';
    if (rawFt === 'retail')         return 'retail';

    // 2. Authoritative Product capability flags from DB
    if (product?.quickCommerceEnabled === true) return 'quick_commerce';
    if (product?.wholesaleEnabled === true)      return 'wholesale';

    return 'retail';
};

// ── Split cart items into { fulfillmentType → vendorId → item[] } ─────────────
// Authoritatively reads Product.vendorId from the DB productMap to ensure 100% vendor isolation
const groupItems = (items, productMap = null) => {
    const map = {};
    for (const item of items) {
        const productId = String(item.productId || item.id || '');
        const product   = productMap?.get(productId);

        // ALWAYS use authoritative product.vendorId from DB schema if product exists
        const vid = String(product?.vendorId || item.vendorId || 'unknown');
        const ft  = resolveFT(item, product);

        if (!map[ft])       map[ft]       = {};
        if (!map[ft][vid])  map[ft][vid]  = { vendorId: vid, items: [] };

        map[ft][vid].items.push({
            ...item,
            productId,
            vendorId: vid, // Lock item to authoritative vendorId
            fulfillmentType: ft,
        });
    }
    return map;
};

// ── Build a QC delivery sub-document for an order ────────────────────────────
const buildQcDelivery = async (vendorDoc, customerLocation, subtotal, settings = {}) => {
    const profile = vendorDoc?.quickCommerceProfile || {};
    const vendorPoint = pointToLatLng(profile?.location) || { latitude: 28.6139, longitude: 77.2090 };
    if (!customerLocation?.latitude) return null;

    const platformSettings = await getQuickCommerceSettings();
    const mergedSettings = { ...platformSettings, ...settings };
    const effective = resolveEffectiveQCSettings(vendorDoc, mergedSettings);

    const distKm = haversineDistanceKm(vendorPoint, customerLocation) || 0;
    const availability = resolveVendorAvailability(vendorDoc);
    const eta = calculateEta({
        preparationTimeMins: Number(profile?.preparationTimeMins) || Number(mergedSettings.defaultPreparationMins) || 20,
        extraPrepMins: availability.extraPrepMins || 0,
        distanceKm: distKm,
        averageSpeedKmph: Number(mergedSettings.averageSpeedKmph) || 20,
    });

    const deliveryFee = calculateDeliveryFee({
        distanceKm: distKm,
        baseFee:             effective.baseFee,
        perKmFee:            effective.perKmFee,
        freeAboveSubtotal:   effective.freeAboveSubtotal,
        freeDeliveryEnabled: effective.freeDeliveryEnabled,
        maxDistanceKm:       effective.maxDistanceKm,
        subtotal,
    });

    const packagingFee = effective.packagingFee;

    return {
        promisedEtaMinutes:  eta.etaMinutes,
        promisedAt:          new Date(),
        prepMins:            eta.prepMins,
        travelMins:          eta.travelMins,
        deliveryFee,
        packagingFee,
        distanceKm:          distKm,
        customerLocation: {
            type: 'Point',
            coordinates: [customerLocation.longitude, customerLocation.latitude],
        },
    };
};

// ── Compute pricing for one vendor group ──────────────────────────────────────
const computeGroupPricing = async (
    vendorItems,
    vendorDoc,
    productMap,
    wholesaleEnabled,
    { shippingAmount = 0, discountAmount = 0, qcDelivery = null }
) => {
    let subtotal = 0;
    let savings  = 0;
    const pricedItems = [];

    const vendorWholesaleEnabled =
        wholesaleEnabled && vendorDoc?.sellingChannels?.wholesale?.enabled === true;

    for (const item of vendorItems) {
        const productId = String(item.productId || item.id || '');
        const product   = productMap.get(productId);
        const basePrice = Number(item.price ?? product?.price ?? 0);
        const qty       = Number(item.quantity || 1);

        const pricing = resolvePriceForQuantity(product || {}, basePrice, qty, {
            vendorWholesaleEnabled,
        });

        const lineSubtotal = pricing.unitPrice * qty;
        subtotal += lineSubtotal;
        savings  += pricing.savings || 0;

        pricedItems.push({
            productId:       productId ? new mongoose.Types.ObjectId(productId) : null,
            vendorId:        vendorDoc?._id || null,
            name:            item.name || product?.name || '',
            image:           item.image || product?.images?.[0] || '',
            price:           pricing.unitPrice,
            quantity:        qty,
            variantKey:      item.variantKey || '',
            variant:         item.variant    || {},
            pricingType:     pricing.pricingType,
            appliedTier:     pricing.appliedTier || null,
            unitRetailPrice: pricing.unitRetailPrice,
            savings:         pricing.savings || 0,
        });
    }

    // Tax — per-product tax-inclusive model; compute after bulk pricing applied
    let taxAddedToTotal = 0;
    for (const pi of pricedItems) {
        const product = productMap.get(String(pi.productId || ''));
        if (!product) continue;
        const rate = Number(product.taxRate) || 0;
        if (rate <= 0) continue;
        const lineAmt = pi.price * pi.quantity;
        if (product.taxIncluded === true) {
            // Tax is already in the price — extract it, don't add it again.
        } else {
            taxAddedToTotal += lineAmt * (rate / 100);
        }
    }

    const deliveryFee  = roundMoney(qcDelivery?.deliveryFee ?? shippingAmount);
    const packagingFee = roundMoney(qcDelivery?.packagingFee ?? 0);
    const tax          = roundMoney(taxAddedToTotal);
    const discount     = roundMoney(discountAmount);
    const roundedSubtotal = roundMoney(subtotal);
    const roundedSavings  = roundMoney(savings);
    const total        = roundMoney(
        Math.max(0, roundedSubtotal + deliveryFee + packagingFee + tax - discount)
    );

    return {
        pricedItems,
        pricing: {
            subtotal: roundedSubtotal,
            shipping: deliveryFee,
            packagingFee,
            tax,
            discount,
            total,
            savings: roundedSavings,
        },
    };
};

// ── Main splitter ─────────────────────────────────────────────────────────────

/**
 * Split a checkout into FulfillmentGroups + Orders, all inside a transaction.
 *
 * @param {Object} options
 * @param {string}  options.sessionId               — CheckoutSession to populate
 * @param {Array}   options.items                   — validated cart items
 * @param {Object}  options.shippingAddress
 * @param {string}  options.paymentMethod
 * @param {Object}  [options.customerLocation]      — { latitude, longitude } for QC
 * @param {Object}  [options.coupon]                — { code, type, discount }
 * @param {number}  [options.shippingAmount]        — retail shipping override
 * @param {Object}  [options.settings]              — platform-level overrides
 * @returns {Promise<{ session: CheckoutSession, groups: FulfillmentGroup[], orders: Order[] }>}
 */
export const splitAndCreateOrders = async ({
    sessionId,
    items,
    shippingAddress,
    paymentMethod,
    customerLocation = null,
    coupon = null,
    shippingAmount  = 0,
    userId          = null,
    settings        = {},
}) => {
    // ── 0. Validate cart (throws CartValidationFailed if invalid) ──────────
    await assertCartValid({ items, customerLocation });

    // ── 1. Batch-fetch all required documents ──────────────────────────────
    const productIds = [...new Set(items.map((i) => i.productId || i.id).filter(Boolean))];
    const [rawProducts, wholesaleEnabled] = await Promise.all([
        Product.find({ _id: { $in: productIds } })
            .select('_id name images price taxRate taxIncluded retailEnabled wholesaleEnabled quickCommerceEnabled wholesale vendorId stock stockQuantity')
            .lean(),
        isWholesaleMarketplaceEnabled(),
    ]);
    const productMap = new Map(rawProducts.map((p) => [String(p._id), p]));

    const vendorIds = [...new Set(rawProducts.map((p) => String(p.vendorId || '')).filter(Boolean))];
    const rawVendors = await Vendor.find({ _id: { $in: vendorIds } })
        .select('_id storeName sellingChannels quickCommerceProfile status freeShippingThreshold defaultShippingRate shippingEnabled')
        .lean();
    const vendorMap = new Map(rawVendors.map((v) => [String(v._id), v]));

    // ── 2. Group items into { fulfillmentType → vendorId → items[] } ───────
    const grouped = groupItems(items, productMap);

    // ── 3. Open MongoDB transaction ────────────────────────────────────────
    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    try {
        const createdGroups = [];
        const createdOrders = [];
        const ledger        = [];

        const session = await CheckoutSession.findOne({ sessionId }).session(dbSession);
        if (!session) throw new Error(`CheckoutSession ${sessionId} not found.`);

        // ── 4. Pre-pass: compute raw subtotal per (FT,vendor) group for coupon splitting ──
        //    Coupon discount is distributed PROPORTIONALLY to each FG's subtotal share.
        //    This prevents the same discount being applied N times across N groups.
        let cartSubtotalForCoupon = 0;
        const groupSubtotals = {}; // key: `${ft}:${vendorId}`
        const shippingGroupInputs = [];

        for (const [ft, vendorGroups] of Object.entries(grouped)) {
            for (const [vendorId, groupData] of Object.entries(vendorGroups)) {
                const key = `${ft}:${vendorId}`;
                const vendorDoc = vendorMap.get(vendorId);
                const subtotal = groupData.items.reduce((s, item) => {
                    const product = productMap.get(String(item.productId || item.id || ''));
                    const unitPrice = Number(item.price ?? product?.price ?? 0);
                    return s + unitPrice * Number(item.quantity || 1);
                }, 0);
                groupSubtotals[key] = subtotal;
                cartSubtotalForCoupon += subtotal;

                if (ft === 'retail' || ft === 'wholesale') {
                    shippingGroupInputs.push({
                        vendorId,
                        subtotal,
                        shippingEnabled: vendorDoc?.shippingEnabled !== false,
                        defaultShippingRate: vendorDoc?.defaultShippingRate,
                        freeShippingThreshold: vendorDoc?.freeShippingThreshold,
                    });
                }
            }
        }

        const { shippingByVendor } = await calculateVendorShippingForGroups({
            vendorGroups: shippingGroupInputs,
            shippingAddress,
            couponType: coupon?.type,
        });

        for (const [ft, vendorGroups] of Object.entries(grouped)) {
            for (const [vendorId, groupData] of Object.entries(vendorGroups)) {
                const vendorDoc  = vendorMap.get(vendorId) || null;
                const vendorName = vendorDoc?.storeName || 'Unknown Vendor';

                // Proportional coupon discount for this specific FG
                const key             = `${ft}:${vendorId}`;
                const fgSubtotal      = groupSubtotals[key] || 0;
                const couponRatio     = cartSubtotalForCoupon > 0 ? fgSubtotal / cartSubtotalForCoupon : 0;
                const fgCouponDiscount = coupon ? Number(((coupon.discount || 0) * couponRatio).toFixed(2)) : 0;

                // QC-specific delivery calculation
                let qcDelivery = null;
                if (ft === 'quick_commerce') {
                    const { pricedItems: tempPriced, pricing: tempPricing } =
                        await computeGroupPricing(groupData.items, vendorDoc, productMap, wholesaleEnabled, {});
                    qcDelivery = await buildQcDelivery(vendorDoc, customerLocation, tempPricing.subtotal, settings);
                }

                const calculatedShipping = (ft === 'retail' || ft === 'wholesale')
                    ? (shippingByVendor[vendorId] ?? shippingAmount)
                    : 0;

                // Compute final pricing — use proportional coupon discount, not total
                const { pricedItems, pricing } = await computeGroupPricing(
                    groupData.items,
                    vendorDoc,
                    productMap,
                    wholesaleEnabled,
                    {
                        shippingAmount: calculatedShipping,
                        discountAmount: fgCouponDiscount,   // ← proportional, not total
                        qcDelivery,
                    }
                );

                // ── 4a. Create FulfillmentGroup ─────────────────────────────
                const [fgDoc] = await FulfillmentGroup.create(
                    [{
                        sessionId: session._id,
                        orderId:   null,   // back-filled after order is created
                        vendorId:  vendorDoc?._id || new mongoose.Types.ObjectId(vendorId),
                        vendorName,
                        fulfillmentType: ft,
                        status:          'validated',
                        items:           pricedItems,
                        pricing,
                        coupon: coupon ? {
                            code:     coupon.code,
                            type:     coupon.type,
                            discount: fgCouponDiscount,  // ← proportional share
                            scope:    'platform',
                        } : undefined,
                        deliveryDetails: {
                            qc:      ft === 'quick_commerce' ? qcDelivery : undefined,
                            retail:  ft === 'retail'  ? { shippingOption: settings.shippingOption || 'standard' } : undefined,
                            wholesale: ft === 'wholesale' ? { minOrderQuantity: settings.moq || 1 } : undefined,
                        },
                    }],
                    { session: dbSession }
                );

                // ── 4b. Create Order ────────────────────────────────────────
                const orderId = generateOrderId(ft);
                const pricingTypes = pricedItems.map((i) => ({ pricingType: i.pricingType }));

                const orderPayload = {
                    orderId,
                    userId: userId ? new mongoose.Types.ObjectId(userId) : null,
                    items:  pricedItems,
                    vendorItems: [{
                        vendorId:  fgDoc.vendorId,
                        vendorName,
                        items:     pricedItems,
                        subtotal:  pricing.subtotal,
                        shipping:  pricing.shipping,
                        packagingFee: pricing.packagingFee || 0,
                        tax:       pricing.tax,
                        discount:  pricing.discount,
                        orderType: deriveOrderType(pricingTypes),
                        status:    'pending',
                    }],
                    shippingAddress,
                    paymentMethod,
                    paymentStatus: session.paymentStatus === 'paid' ? 'paid' : 'pending',
                    status:        session.paymentStatus === 'paid' ? 'confirmed' : 'pending',
                    subtotal:      pricing.subtotal,
                    shipping:      pricing.shipping,
                    tax:           pricing.tax,
                    packagingFee:  pricing.packagingFee || 0,
                    total:         pricing.total,
                    totalSavings:  pricing.savings,
                    orderType:     deriveOrderType(pricingTypes),
                    // Enterprise Marketplace linkage
                    vendorId:           fgDoc.vendorId,
                    checkoutSessionId:  session._id,
                    fulfillmentGroupId: fgDoc._id,
                    fulfillmentType:    fgDoc.fulfillmentType,
                    // Fulfillment-type-specific fields
                    experience: ft === 'quick_commerce' ? 'quick_commerce' : 'marketplace',
                    couponCode:     coupon?.code     || null,
                    couponDiscount: coupon?.discount || 0,
                };

                if (ft === 'quick_commerce' && qcDelivery) {
                    orderPayload.quickCommerce = {
                        promisedEtaMinutes: qcDelivery.promisedEtaMinutes,
                        promisedAt:         qcDelivery.promisedAt,
                        etaBreakdown:       { prepMins: qcDelivery.prepMins, travelMins: qcDelivery.travelMins },
                        status:             'placed',
                        customerLocation:   qcDelivery.customerLocation,
                        deliveryDistanceKm: qcDelivery.distanceKm,
                        deliveryFee:        qcDelivery.deliveryFee,
                        packagingFee:       qcDelivery.packagingFee,
                        assignment:         { status: 'pending', attempts: 0 },
                    };
                }

                const [orderDoc] = await Order.create([orderPayload], { session: dbSession });

                // ── 4c. Back-fill orderId in FulfillmentGroup ───────────────
                await FulfillmentGroup.updateOne(
                    { _id: fgDoc._id },
                    { $set: { orderId: orderDoc._id, status: 'order_created' } },
                    { session: dbSession }
                );

                // ── 4d. Commit inventory reservation → atomic stock deduction ──
                //    Uses the InventoryReservationService which already reserved
                //    stock atomically at session creation. If reservation not found
                //    (legacy order path), falls back gracefully with a warning.
                await commitReservation(sessionId, dbSession);

                // ── 4e. Ledger entry ────────────────────────────────────────
                ledger.push({
                    orderId:            orderDoc._id,
                    fulfillmentGroupId: fgDoc._id,
                    vendorId:           fgDoc.vendorId,
                    vendorName,
                    fulfillmentType:    ft,
                    amount:             pricing.total,
                    captured:           0,
                    refunded:           0,
                    pendingSettlement:  0,
                    settled:            0,
                    status:             'allocated',
                });

                createdGroups.push(fgDoc);
                createdOrders.push(orderDoc);
            }
        }

        // ── 5. Update CheckoutSession ────────────────────────────────────────
        const grandTotal = ledger.reduce((s, l) => s + l.amount, 0);
        await CheckoutSession.updateOne(
            { _id: session._id },
            {
                $set: {
                    fulfillmentGroupIds:     createdGroups.map((g) => g._id),
                    orderIds:                createdOrders.map((o) => o._id),
                    paymentAllocationLedger: ledger,
                    status:                  'processing',
                    'summary.grandTotal':    grandTotal,
                },
            },
            { session: dbSession }
        );

        await dbSession.commitTransaction();
        assertPriceConsistency({
            checkoutTotal: grandTotal,
            orderTotals: createdOrders.map((o) => o.total),
            context: `OrderSplitterEngine:${sessionId}`,
        });

        // ── 6. Emit events (after commit — never inside transaction) ──────────
        for (const order of createdOrders) {
            marketplaceEventBus.emit(MARKETPLACE_EVENTS.ORDER_CREATED, {
                order,
                fulfillmentType: order.fulfillmentType,
            });
            if (order.fulfillmentType === 'quick_commerce') {
                marketplaceEventBus.emit(MARKETPLACE_EVENTS.QC_ORDER_PLACED, { order });
            }
        }
        marketplaceEventBus.emit(MARKETPLACE_EVENTS.CHECKOUT_COMPLETED, {
            sessionId,
            orderCount: createdOrders.length,
        });

        return { session, groups: createdGroups, orders: createdOrders, ledger };

    } catch (err) {
        await dbSession.abortTransaction();
        await dbSession.endSession();
        throw err;
    }
};

/**
 * Compute full authoritative financial summary for a CheckoutSession prior to session creation.
 * Reuses the EXACT SAME pricing, QC delivery, vendor shipping, tax, packaging, and coupon logic
 * that splitAndCreateOrders uses, ensuring CheckoutSession.summary.grandTotal === Order.total === Cashfree Amount.
 */
export const calculateCheckoutSessionSummary = async ({
    items = [],
    shippingAddress = {},
    customerLocation = null,
    coupon = null,
    shippingAmount = 0,
    shippingOption = 'standard',
}) => {
    const rawProducts = await Product.find({
        _id: { $in: items.map((i) => i.productId || i.id).filter(Boolean) },
    }).lean();
    const productMap = new Map(rawProducts.map((p) => [String(p._id), p]));

    const vendorIds = [...new Set(rawProducts.map((p) => String(p.vendorId || '')).filter(Boolean))];
    const rawVendors = await Vendor.find({ _id: { $in: vendorIds } })
        .select('_id storeName sellingChannels quickCommerceProfile status freeShippingThreshold defaultShippingRate shippingEnabled')
        .lean();
    const vendorMap = new Map(rawVendors.map((v) => [String(v._id), v]));

    const grouped = groupItems(items, productMap);

    let cartSubtotalForCoupon = 0;
    const groupSubtotals = {};
    const shippingGroupInputs = [];

    for (const [ft, vendorGroups] of Object.entries(grouped)) {
        for (const [vendorId, groupData] of Object.entries(vendorGroups)) {
            const key = `${ft}:${vendorId}`;
            const vendorDoc = vendorMap.get(vendorId);
            const subtotal = groupData.items.reduce((s, item) => {
                const product = productMap.get(String(item.productId || item.id || ''));
                const unitPrice = Number(item.price ?? product?.price ?? 0);
                return s + unitPrice * Number(item.quantity || 1);
            }, 0);
            groupSubtotals[key] = subtotal;
            cartSubtotalForCoupon += subtotal;

            if (ft === 'retail' || ft === 'wholesale') {
                shippingGroupInputs.push({
                    vendorId,
                    subtotal,
                    shippingEnabled: vendorDoc?.shippingEnabled !== false,
                    defaultShippingRate: vendorDoc?.defaultShippingRate,
                    freeShippingThreshold: vendorDoc?.freeShippingThreshold,
                });
            }
        }
    }

    const { shippingByVendor } = await calculateVendorShippingForGroups({
        vendorGroups: shippingGroupInputs,
        shippingAddress,
        couponType: coupon?.type,
    });

    const settingsDoc = await Settings.findOne({ key: 'quick_commerce' }).lean();
    const settings = settingsDoc?.value || {};
    const wholesaleSettingsDoc = await Settings.findOne({ key: 'wholesale' }).lean();
    const wholesaleEnabled = wholesaleSettingsDoc?.value?.enabled !== false;

    let totalSubtotal = 0;
    let totalShipping = 0;
    let totalPackaging = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    for (const [ft, vendorGroups] of Object.entries(grouped)) {
        for (const [vendorId, groupData] of Object.entries(vendorGroups)) {
            const vendorDoc = vendorMap.get(vendorId) || null;
            const key = `${ft}:${vendorId}`;
            const fgSubtotal = groupSubtotals[key] || 0;
            const couponRatio = cartSubtotalForCoupon > 0 ? fgSubtotal / cartSubtotalForCoupon : 0;
            const fgCouponDiscount = coupon ? Number(((coupon.discount || 0) * couponRatio).toFixed(2)) : 0;

            let qcDelivery = null;
            if (ft === 'quick_commerce') {
                const { pricing: tempPricing } = await computeGroupPricing(groupData.items, vendorDoc, productMap, wholesaleEnabled, {});
                qcDelivery = await buildQcDelivery(vendorDoc, customerLocation, tempPricing.subtotal, settings);
            }

            const calculatedShipping = (ft === 'retail' || ft === 'wholesale')
                ? (shippingByVendor[vendorId] ?? shippingAmount)
                : 0;

            const { pricing } = await computeGroupPricing(
                groupData.items,
                vendorDoc,
                productMap,
                wholesaleEnabled,
                {
                    shippingAmount: calculatedShipping,
                    discountAmount: fgCouponDiscount,
                    qcDelivery,
                }
            );

            totalSubtotal += pricing.subtotal;
            totalShipping += pricing.shipping;
            totalPackaging += pricing.packagingFee;
            totalTax += pricing.tax;
            totalDiscount += pricing.discount;
        }
    }

    const grandTotal = Math.max(0, totalSubtotal + totalShipping + totalPackaging + totalTax - totalDiscount);

    return {
        subtotal: roundMoney(totalSubtotal),
        deliveryFee: roundMoney(totalShipping),
        totalShipping: roundMoney(totalShipping),
        packagingFee: roundMoney(totalPackaging),
        totalPackagingFee: roundMoney(totalPackaging),
        tax: roundMoney(totalTax),
        totalTax: roundMoney(totalTax),
        discount: roundMoney(totalDiscount),
        totalDiscount: roundMoney(totalDiscount),
        grandTotal: roundMoney(grandTotal),
    };
};
