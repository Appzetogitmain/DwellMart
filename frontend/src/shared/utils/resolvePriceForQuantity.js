/**
 * Wholesale Bulk Pricing — PREVIEW MIRROR.
 *
 * ⚠️  This is a display-only mirror of the authoritative engine at
 *     `backend/src/services/pricingEngine.service.js`.
 *     It must NEVER determine the amount charged to a customer — checkout
 *     re-derives every price server-side and its result always wins.
 *
 * Both implementations are executed against the shared conformance fixture
 * (`backend/src/services/pricingEngine.fixtures.js`). If you change the rules
 * here, change them there too or the test suite will fail.
 *
 * Business rules (blueprint §2 / §5):
 *   1. Wholesale disabled (product or vendor) → retail price.
 *   2. Wholesale floor = MOQ when enabled, otherwise lowest tier quantity;
 *      when both apply, the higher wins.
 *   3. Wholesale-only below the floor → not purchasable (BELOW_MOQ).
 *   4. Hybrid below the floor → retail price (still purchasable).
 *   5. At or above the floor → highest applicable tier wins.
 */

export const PRICING_TYPE_RETAIL = "retail";
export const PRICING_TYPE_WHOLESALE = "wholesale";
export const INELIGIBLE_BELOW_MOQ = "BELOW_MOQ";

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
        Number.isFinite(tier.minQty) &&
        Number.isFinite(tier.price) &&
        tier.minQty >= 1 &&
        tier.price >= 0
    )
    .sort((a, b) => a.minQty - b.minQty);
};

/**
 * Resolve the effective unit price for a given quantity (preview only).
 * Mirrors `resolvePriceForQuantity` in the backend pricing engine exactly.
 */
export const resolvePriceForQuantity = (product, basePrice, quantity, options = {}) => {
  const { vendorWholesaleEnabled = true } = options;

  const numericBasePrice = Number(basePrice);
  const numericQuantity = Number(quantity);
  const safeBasePrice =
    Number.isFinite(numericBasePrice) && numericBasePrice >= 0 ? numericBasePrice : 0;
  const safeQuantity =
    Number.isFinite(numericQuantity) && numericQuantity > 0 ? numericQuantity : 0;

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
  const wholesaleActive =
    product?.wholesaleEnabled === true && vendorWholesaleEnabled !== false;
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

/** True when the product cannot be purchased at this quantity (below MOQ). */
export const isBelowMinimumOrder = (pricing) =>
  pricing?.eligible === false && pricing?.reason === INELIGIBLE_BELOW_MOQ;

export default resolvePriceForQuantity;
