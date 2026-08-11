/**
 * Wholesale Bulk Pricing Engine — AUTHORITATIVE implementation.
 *
 * This module is the single source of truth for what a customer is charged.
 * It is a pure, dependency-free function set so it can be reused by checkout,
 * shipping estimation, and any future pricing surface without side effects.
 *
 * A mirrored preview implementation exists at
 * `frontend/src/shared/utils/resolvePriceForQuantity.js`. That copy is for
 * display only and must never determine the amount charged. Both are verified
 * against the shared fixture in `pricingEngine.fixtures.js`.
 *
 * Business rules (blueprint §2 / §5):
 *   1. Wholesale disabled (on the product OR on the owning vendor) → retail price.
 *   2. Wholesale floor = MOQ when enabled, otherwise the lowest tier quantity.
 *      When both apply, the higher of the two wins.
 *   3. Wholesale-only product below the floor → not purchasable (BELOW_MOQ).
 *   4. Hybrid product below the floor → retail price (still purchasable).
 *   5. At or above the floor → the highest applicable tier wins.
 */

import ApiError from '../utils/ApiError.js';

export const PRICING_TYPE_RETAIL = 'retail';
export const PRICING_TYPE_WHOLESALE = 'wholesale';
export const INELIGIBLE_BELOW_MOQ = 'BELOW_MOQ';

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

export const resolveVariantSelection = (product, selectedVariant) => {
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

/** Normalize raw tiers into ascending, numeric, valid { minQty, price } entries. */
export const normalizeTiers = (rawTiers) => {
    if (!Array.isArray(rawTiers)) return [];
    return rawTiers
        .map((tier) => ({
            minQty: Number(tier?.minQty),
            price: Number(tier?.price),
        }))
        .filter(
            (tier) =>
                Number.isFinite(tier.minQty)
                && Number.isFinite(tier.price)
                && tier.minQty >= 1
                && tier.price >= 0
        )
        .sort((a, b) => a.minQty - b.minQty);
};

/**
 * Resolve the effective unit price for a given quantity.
 *
 * @param {object} product   Product document/POJO with { retailEnabled, wholesaleEnabled, wholesale }.
 * @param {number} basePrice Retail unit price, already variant-resolved by the caller.
 * @param {number} quantity  Requested quantity.
 * @param {object} [options]
 * @param {boolean} [options.vendorWholesaleEnabled=true]
 *        Live vendor selling-channel state. When false, wholesale is treated as
 *        disabled without destroying stored tier data (blueprint §9.1 cascade).
 * @returns {{
 *   pricingType: 'retail'|'wholesale',
 *   unitPrice: number,
 *   unitRetailPrice: number,
 *   appliedTier: {minQty:number, price:number}|null,
 *   nextTier: {minQty:number, price:number}|null,
 *   savings: number,
 *   eligible: boolean,
 *   reason: string|null,
 *   minimumQuantity: number|null
 * }}
 */
export const resolvePriceForQuantity = (product, basePrice, quantity, options = {}) => {
    const { vendorWholesaleEnabled = true } = options;

    const numericBasePrice = Number(basePrice);
    const numericQuantity = Number(quantity);
    const safeBasePrice = Number.isFinite(numericBasePrice) && numericBasePrice >= 0 ? numericBasePrice : 0;
    const safeQuantity = Number.isFinite(numericQuantity) && numericQuantity > 0 ? numericQuantity : 0;

    const retailResult = (extra = {}) => ({
        pricingType: PRICING_TYPE_RETAIL,
        unitPrice: safeBasePrice,
        unitRetailPrice: safeBasePrice,
        appliedTier: null,
        nextTier: null,
        savings: 0,
        eligible: true,
        reason: null,
        minimumQuantity: null,
        ...extra,
    });

    // Rule 1 — wholesale not active for this product.
    const wholesaleActive = product?.wholesaleEnabled === true && vendorWholesaleEnabled !== false;
    if (!wholesaleActive) return retailResult();

    const tiers = normalizeTiers(product?.wholesale?.priceTiers);
    if (tiers.length === 0) return retailResult();

    const retailEnabled = product?.retailEnabled !== false;
    const lowestTierMinQty = tiers[0].minQty;

    // Rule 2 — the wholesale floor.
    const moqEnabled = product?.wholesale?.moqEnabled === true;
    const rawMoq = Number(product?.wholesale?.moq);
    const moq = moqEnabled && Number.isFinite(rawMoq) && rawMoq >= 1 ? rawMoq : null;
    const floor = moq !== null ? Math.max(moq, lowestTierMinQty) : lowestTierMinQty;

    if (safeQuantity < floor) {
        // Rule 3 — wholesale-only products cannot be bought below the floor.
        if (!retailEnabled) {
            return {
                pricingType: PRICING_TYPE_WHOLESALE,
                unitPrice: tiers[0].price,
                unitRetailPrice: safeBasePrice,
                appliedTier: null,
                nextTier: tiers[0],
                savings: 0,
                eligible: false,
                reason: INELIGIBLE_BELOW_MOQ,
                minimumQuantity: floor,
            };
        }
        // Rule 4 — hybrid products fall back to retail below the floor.
        return retailResult({ nextTier: tiers[0], minimumQuantity: floor });
    }

    // Rule 5 — highest applicable tier wins.
    let appliedIndex = -1;
    for (let i = tiers.length - 1; i >= 0; i -= 1) {
        if (safeQuantity >= tiers[i].minQty) {
            appliedIndex = i;
            break;
        }
    }

    // Defensive: floor satisfied but no tier matched (only reachable if MOQ < lowest tier
    // and quantity sits between them — already handled above, but keep the path safe).
    if (appliedIndex === -1) {
        if (!retailEnabled) {
            return {
                pricingType: PRICING_TYPE_WHOLESALE,
                unitPrice: tiers[0].price,
                unitRetailPrice: safeBasePrice,
                appliedTier: null,
                nextTier: tiers[0],
                savings: 0,
                eligible: false,
                reason: INELIGIBLE_BELOW_MOQ,
                minimumQuantity: lowestTierMinQty,
            };
        }
        return retailResult({ nextTier: tiers[0], minimumQuantity: lowestTierMinQty });
    }

    const appliedTier = tiers[appliedIndex];
    const nextTier = appliedIndex < tiers.length - 1 ? tiers[appliedIndex + 1] : null;
    const savings = Math.max(0, (safeBasePrice - appliedTier.price) * safeQuantity);

    return {
        pricingType: PRICING_TYPE_WHOLESALE,
        unitPrice: appliedTier.price,
        unitRetailPrice: safeBasePrice,
        appliedTier: { minQty: appliedTier.minQty, price: appliedTier.price },
        nextTier: nextTier ? { minQty: nextTier.minQty, price: nextTier.price } : null,
        savings: Number(savings.toFixed(2)),
        eligible: true,
        reason: null,
        minimumQuantity: floor,
    };
};

/**
 * Derive an order-level classification from the per-item pricing types.
 * @param {Array<{pricingType:string}>} items
 * @returns {'retail'|'wholesale'|'mixed'}
 */
export const deriveOrderType = (items = []) => {
    if (!Array.isArray(items) || items.length === 0) return PRICING_TYPE_RETAIL;
    let hasRetail = false;
    let hasWholesale = false;
    for (const item of items) {
        if (item?.pricingType === PRICING_TYPE_WHOLESALE) hasWholesale = true;
        else hasRetail = true;
    }
    if (hasWholesale && hasRetail) return 'mixed';
    return hasWholesale ? PRICING_TYPE_WHOLESALE : PRICING_TYPE_RETAIL;
};
