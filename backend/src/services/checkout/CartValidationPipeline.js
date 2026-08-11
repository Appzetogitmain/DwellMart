/**
 * CartValidationPipeline
 *
 * Runs before the Checkout page renders (and again inside the Order Splitter
 * transaction). Returns a structured validation result so the UI can show
 * per-item warnings without exploding the checkout flow.
 *
 * Validation steps (in order):
 *   1. Products exist and are active.
 *   2. Vendor is active / not suspended.
 *   3. Stock is sufficient (per-SKU and variant-level).
 *   4. QC serviceability — store open, within radius, channel enabled.
 *   5. Wholesale MOQ satisfied.
 *   6. Per-item max order qty (QC cap).
 *
 * Design principles:
 *   - Collect ALL errors per item rather than throwing on the first one.
 *   - Never mutate DB state — read-only scan.
 *   - Idempotent: safe to call multiple times.
 */

import mongoose from 'mongoose';
import Product from '../../models/Product.model.js';
import Vendor from '../../models/Vendor.model.js';
import {
    resolveVendorAvailability,
    pointToLatLng,
    haversineDistanceKm,
    getQuickCommerceSettings,
    resolveEffectiveQCSettings,
} from '../quickCommerce.service.js';
import { resolvePriceForQuantity, resolveVariantSelection } from '../pricingEngine.service.js';
import { isWholesaleMarketplaceEnabled } from '../featureFlags.service.js';
import { isVendorEligibleForOrders, getVendorIneligibleReason } from '../../utils/vendorEligibility.js';

const FULFILLMENT_TYPES = ['quick_commerce', 'retail', 'wholesale'];

/**
 * Resolve the fulfillment type from a cart item payload.
 * Items tagged at add-to-cart time carry `fulfillmentType`.
 * Legacy items that have `experience` instead are migrated gracefully.
 */
const resolveFulfillmentType = (item, product = null) => {
    if (product?.quickCommerceEnabled === true && product?.retailEnabled !== true) {
        return 'quick_commerce';
    }
    if (product?.wholesaleEnabled === true && product?.retailEnabled !== true) {
        return 'wholesale';
    }
    const ft = String(item?.fulfillmentType || item?.experience || '').toLowerCase();
    if (ft === 'quick_commerce') return 'quick_commerce';
    if (ft === 'wholesale')      return 'wholesale';
    if (ft === 'retail')         return 'retail';

    if (product?.quickCommerceEnabled === true) return 'quick_commerce';
    if (product?.wholesaleEnabled === true)      return 'wholesale';

    return 'retail';
};

/**
 * @typedef {Object} CartValidationResult
 * @property {boolean} valid            — true when no blocking errors exist.
 * @property {ItemValidationResult[]} items
 * @property {string[]} globalErrors    — cart-level errors (e.g. empty cart).
 * @property {Object} summary           — { qcItems, retailItems, wholesaleItems }
 */

/**
 * @typedef {Object} ItemValidationResult
 * @property {string} productId
 * @property {string} productName
 * @property {string} fulfillmentType
 * @property {boolean} valid
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * Validate the cart for the given customer context.
 *
 * @param {Object} options
 * @param {Array}  options.items             — cart items (from useCartStore or req.body)
 * @param {Object} [options.customerLocation] — { latitude, longitude } for QC serviceability
 * @param {boolean} [options.strictMode]      — if true, treat warnings as errors
 * @returns {Promise<CartValidationResult>}
 */
export const validateCart = async ({ items = [], customerLocation = null, strictMode = false } = {}) => {
    const globalErrors = [];
    const itemResults = [];

    if (!Array.isArray(items) || items.length === 0) {
        return {
            valid: false,
            items: [],
            globalErrors: ['Cart is empty.'],
            summary: { qcItems: 0, retailItems: 0, wholesaleItems: 0 },
        };
    }

    // ── 1. Batch-fetch Products & Vendors ──────────────────────────────────
    const productIds = [...new Set(items.map((i) => (i.productId || i.id) ? new mongoose.Types.ObjectId(String(i.productId || i.id)) : null).filter(Boolean))];
    const [rawProducts, wholesaleEnabled] = await Promise.all([
        Product.find({ _id: { $in: productIds } })
            .select('_id name isActive isVisible stock stockQuantity lowStockThreshold vendorId '
                + 'quickCommerceEnabled retailEnabled wholesaleEnabled quickCommerce wholesale '
                + 'variants price taxRate taxIncluded')
            .lean(),
        isWholesaleMarketplaceEnabled(),
    ]);

    const productMap = new Map(rawProducts.map((p) => [String(p._id), p]));

    const vendorIds = [...new Set(rawProducts.map((p) => p.vendorId ? new mongoose.Types.ObjectId(String(p.vendorId)) : null).filter(Boolean))];
    const rawVendors = await Vendor.find({ _id: { $in: vendorIds } })
        .select('_id storeName status isActive vendorType sellingChannels quickCommerceProfile')
        .lean();
    const vendorMap = new Map(rawVendors.map((v) => [String(v._id), v]));

    // ── 2. Per-item validation ─────────────────────────────────────────────
    const summary = { qcItems: 0, retailItems: 0, wholesaleItems: 0 };

    for (const item of items) {
        const productId = String(item.productId || item.id || '');
        const quantity  = Number(item.quantity || 1);
        const product   = productMap.get(productId);
        const ft        = resolveFulfillmentType(item, product);
        const errors    = [];
        const warnings  = [];

        if (!product) {
            itemResults.push({ productId, productName: item.name || 'Unknown', fulfillmentType: ft, valid: false, errors: ['Product not found or has been removed.'], warnings: [] });
            continue;
        }

        const productName = product.name || 'Unknown Product';

        // ── Variant Selection & Price Resolution ──
        try {
            resolveVariantSelection(product, item.variant);
        } catch (variantErr) {
            errors.push(variantErr.message || `Invalid variant selected for ${productName}.`);
        }

        // ── Active / visible ──
        if (!product.isActive || !product.isVisible) {
            errors.push(`${productName} is no longer available.`);
        }

        // ── Channel eligibility ──
        if (ft === 'quick_commerce' && product.quickCommerceEnabled !== true) {
            errors.push(`${productName} is not enabled for Express Delivery.`);
        }
        if (ft === 'retail' && product.retailEnabled === false) {
            errors.push(`${productName} is not available for standard delivery.`);
        }
        if (ft === 'wholesale' && product.wholesaleEnabled !== true) {
            errors.push(`${productName} is not available for wholesale.`);
        }
        if (ft === 'wholesale' && !wholesaleEnabled) {
            errors.push('Wholesale Marketplace is currently disabled.');
        }

        // ── Vendor ──
        const vendor = vendorMap.get(String(product.vendorId || ''));
        if (!isVendorEligibleForOrders(vendor)) {
            errors.push(getVendorIneligibleReason(vendor, productName));
        } else {

            // QC-specific vendor checks
            if (ft === 'quick_commerce') {
                if (vendor.sellingChannels?.quickCommerce?.enabled !== true) {
                    errors.push(`${productName}: seller is not available on Express Delivery.`);
                }
                const availability = resolveVendorAvailability(vendor);
                if (!availability.isOrderable) {
                    errors.push(`${productName}: seller is not accepting orders right now (${availability.reason}).`);
                }
                // Serviceability radius (relaxes radius check in development mode to allow easy testing)
                if (customerLocation?.latitude && customerLocation?.longitude) {
                    const vendorPoint = pointToLatLng(vendor.quickCommerceProfile?.location);
                    if (vendorPoint) {
                        const distKm  = haversineDistanceKm(vendorPoint, customerLocation);
                        const platformSettings = await getQuickCommerceSettings();
                        const effectiveSettings = resolveEffectiveQCSettings(vendor, platformSettings);
                        const radiusKm = effectiveSettings.maxDistanceKm || 3;
                        if (distKm > radiusKm) {
                            errors.push(`${productName}: seller does not deliver to your location (distance ${distKm.toFixed(1)} km exceeds maximum ${radiusKm} km radius).`);
                        }
                    }
                }
            }
        }

        // ── Stock ──
        if (product.stock === 'out_of_stock') {
            errors.push(`${productName} is out of stock.`);
        } else if (product.stockQuantity < quantity) {
            errors.push(`Only ${product.stockQuantity} unit(s) of ${productName} available (requested ${quantity}).`);
        } else if (product.stockQuantity < quantity * 1.5) {
            // P1-12 FIX: Low-stock is informational only — never a hard error.
            // strictMode MUST NOT promote this to an error: a customer who already
            // paid must not have order creation fail because stock is "low but sufficient".
            warnings.push(`Low stock: only ${product.stockQuantity} units left for ${productName}.`);
        }

        // ── QC max order qty ──
        if (ft === 'quick_commerce') {
            const maxQty = Number(product.quickCommerce?.maxOrderQty);
            if (Number.isFinite(maxQty) && quantity > maxQty) {
                errors.push(`${productName} is limited to ${maxQty} per order on Express Delivery.`);
            }
        }

        // ── Wholesale MOQ ──
        if (ft === 'wholesale') {
            const pricing = resolvePriceForQuantity(product, Number(product.price), quantity, {
                vendorWholesaleEnabled: wholesaleEnabled && vendor?.sellingChannels?.wholesale?.enabled === true,
            });
            if (!pricing.eligible) {
                errors.push(`${productName} requires a minimum order of ${pricing.minimumQuantity} units (requested ${quantity}).`);
            }
        }

        // ── Summary counters ──
        if (ft === 'quick_commerce') summary.qcItems += quantity;
        else if (ft === 'wholesale')  summary.wholesaleItems += quantity;
        else                          summary.retailItems += quantity;

        itemResults.push({
            productId,
            productName,
            fulfillmentType: ft,
            // P1-12 FIX: warnings must NEVER cause valid=false, even in strictMode.
            // Only hard errors block checkout. Low-stock is advisory information only.
            valid: errors.length === 0,
            errors,
            warnings,
        });
    }

    const allValid = itemResults.every((r) => r.valid) && globalErrors.length === 0;

    return {
        valid: allValid,
        items: itemResults,
        globalErrors,
        summary,
    };
};

/**
 * Convenience helper: throws an ApiError-style object listing all errors
 * collected across the cart. Used inside the OrderSplitter transaction.
 */
export const assertCartValid = async (options) => {
    const result = await validateCart({ ...options, strictMode: true });
    if (!result.valid) {
        const messages = [
            ...result.globalErrors,
            ...result.items.flatMap((r) => r.errors),
        ].filter(Boolean);
        const err = new Error(messages.join(' | '));
        err.statusCode = 422;
        err.code = 'CART_VALIDATION_FAILED';
        err.details = result;
        throw err;
    }
    return result;
};
