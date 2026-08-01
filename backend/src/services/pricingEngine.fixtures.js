/**
 * Shared pricing-engine conformance fixture.
 *
 * Executed against BOTH the authoritative server engine
 * (`backend/src/services/pricingEngine.service.js`) and the frontend preview
 * mirror (`frontend/src/shared/utils/resolvePriceForQuantity.js`).
 *
 * Any divergence between the two implementations fails the test suite — this is
 * the guard that keeps the preview layer honest against the source of truth.
 */

const RETAIL_ONLY = {
    retailEnabled: true,
    wholesaleEnabled: false,
};

const LEGACY = {
    // Pre-wholesale product document: no wholesale fields at all.
    name: 'Legacy Product',
};

const HYBRID = {
    retailEnabled: true,
    wholesaleEnabled: true,
    wholesale: {
        moqEnabled: false,
        priceTiers: [
            { minQty: 10, price: 950 },
            { minQty: 25, price: 900 },
            { minQty: 50, price: 850 },
            { minQty: 100, price: 800 },
        ],
    },
};

const HYBRID_WITH_MOQ = {
    retailEnabled: true,
    wholesaleEnabled: true,
    wholesale: {
        moqEnabled: true,
        moq: 20,
        priceTiers: [
            { minQty: 10, price: 950 },
            { minQty: 25, price: 900 },
        ],
    },
};

const WHOLESALE_ONLY = {
    retailEnabled: false,
    wholesaleEnabled: true,
    wholesale: {
        moqEnabled: true,
        moq: 20,
        priceTiers: [
            { minQty: 20, price: 900 },
            { minQty: 50, price: 850 },
        ],
    },
};

const WHOLESALE_ONLY_NO_MOQ = {
    retailEnabled: false,
    wholesaleEnabled: true,
    wholesale: {
        moqEnabled: false,
        priceTiers: [{ minQty: 15, price: 880 }],
    },
};

const SINGLE_TIER = {
    retailEnabled: true,
    wholesaleEnabled: true,
    wholesale: { moqEnabled: false, priceTiers: [{ minQty: 5, price: 90 }] },
};

const EMPTY_TIERS = {
    retailEnabled: true,
    wholesaleEnabled: true,
    wholesale: { moqEnabled: false, priceTiers: [] },
};

const UNSORTED_TIERS = {
    retailEnabled: true,
    wholesaleEnabled: true,
    wholesale: {
        moqEnabled: false,
        priceTiers: [
            { minQty: 50, price: 850 },
            { minQty: 10, price: 950 },
            { minQty: 25, price: 900 },
        ],
    },
};

/**
 * Each case: { label, product, basePrice, quantity, options, expect }
 * `expect` lists only the fields asserted, so both engines must agree on them.
 */
export const PRICING_FIXTURES = [
    // ── Retail-only / legacy: must be byte-identical to pre-wholesale behavior ──
    {
        label: 'retail-only product, qty 1',
        product: RETAIL_ONLY, basePrice: 1000, quantity: 1,
        expect: { pricingType: 'retail', unitPrice: 1000, savings: 0, eligible: true, appliedTier: null },
    },
    {
        label: 'retail-only product, large qty stays retail',
        product: RETAIL_ONLY, basePrice: 1000, quantity: 500,
        expect: { pricingType: 'retail', unitPrice: 1000, savings: 0, eligible: true, appliedTier: null },
    },
    {
        label: 'legacy product with no wholesale fields',
        product: LEGACY, basePrice: 249.99, quantity: 100,
        expect: { pricingType: 'retail', unitPrice: 249.99, savings: 0, eligible: true, appliedTier: null },
    },
    {
        label: 'wholesale enabled but empty tiers falls back to retail',
        product: EMPTY_TIERS, basePrice: 1000, quantity: 100,
        expect: { pricingType: 'retail', unitPrice: 1000, savings: 0, eligible: true, appliedTier: null },
    },
    {
        label: 'vendor wholesale channel disabled overrides product flag',
        product: HYBRID, basePrice: 1000, quantity: 100,
        options: { vendorWholesaleEnabled: false },
        expect: { pricingType: 'retail', unitPrice: 1000, savings: 0, eligible: true, appliedTier: null },
    },

    // ── Hybrid tier boundaries ──
    {
        label: 'hybrid below lowest tier (qty 9) → retail',
        product: HYBRID, basePrice: 1000, quantity: 9,
        expect: { pricingType: 'retail', unitPrice: 1000, savings: 0, eligible: true, appliedTier: null },
    },
    {
        label: 'hybrid exactly at first tier (qty 10)',
        product: HYBRID, basePrice: 1000, quantity: 10,
        expect: { pricingType: 'wholesale', unitPrice: 950, savings: 500, eligible: true, appliedTier: { minQty: 10, price: 950 } },
    },
    {
        label: 'hybrid between tiers (qty 24) uses lower tier',
        product: HYBRID, basePrice: 1000, quantity: 24,
        expect: { pricingType: 'wholesale', unitPrice: 950, savings: 1200, eligible: true, appliedTier: { minQty: 10, price: 950 } },
    },
    {
        label: 'hybrid exactly at second tier (qty 25)',
        product: HYBRID, basePrice: 1000, quantity: 25,
        expect: { pricingType: 'wholesale', unitPrice: 900, savings: 2500, eligible: true, appliedTier: { minQty: 25, price: 900 } },
    },
    {
        label: 'hybrid at highest tier (qty 100)',
        product: HYBRID, basePrice: 1000, quantity: 100,
        expect: { pricingType: 'wholesale', unitPrice: 800, savings: 20000, eligible: true, appliedTier: { minQty: 100, price: 800 } },
    },
    {
        label: 'hybrid above highest tier (qty 1000) stays at top tier',
        product: HYBRID, basePrice: 1000, quantity: 1000,
        expect: { pricingType: 'wholesale', unitPrice: 800, savings: 200000, eligible: true, appliedTier: { minQty: 100, price: 800 } },
    },
    {
        label: 'unsorted tier input resolves identically to sorted',
        product: UNSORTED_TIERS, basePrice: 1000, quantity: 30,
        expect: { pricingType: 'wholesale', unitPrice: 900, savings: 3000, eligible: true, appliedTier: { minQty: 25, price: 900 } },
    },
    {
        label: 'single-tier product below tier → retail',
        product: SINGLE_TIER, basePrice: 100, quantity: 4,
        expect: { pricingType: 'retail', unitPrice: 100, savings: 0, eligible: true, appliedTier: null },
    },
    {
        label: 'single-tier product at tier',
        product: SINGLE_TIER, basePrice: 100, quantity: 5,
        expect: { pricingType: 'wholesale', unitPrice: 90, savings: 50, eligible: true, appliedTier: { minQty: 5, price: 90 } },
    },

    // ── Hybrid + MOQ: MOQ raises the wholesale floor but never blocks purchase ──
    {
        label: 'hybrid+MOQ below MOQ (qty 19) → retail, still purchasable',
        product: HYBRID_WITH_MOQ, basePrice: 1000, quantity: 19,
        expect: { pricingType: 'retail', unitPrice: 1000, savings: 0, eligible: true, appliedTier: null },
    },
    {
        label: 'hybrid+MOQ exactly at MOQ (qty 20) applies tier 10',
        product: HYBRID_WITH_MOQ, basePrice: 1000, quantity: 20,
        expect: { pricingType: 'wholesale', unitPrice: 950, savings: 1000, eligible: true, appliedTier: { minQty: 10, price: 950 } },
    },
    {
        label: 'hybrid+MOQ above MOQ at higher tier (qty 25)',
        product: HYBRID_WITH_MOQ, basePrice: 1000, quantity: 25,
        expect: { pricingType: 'wholesale', unitPrice: 900, savings: 2500, eligible: true, appliedTier: { minQty: 25, price: 900 } },
    },

    // ── Wholesale-only: MOQ is a hard purchase floor ──
    {
        label: 'wholesale-only below MOQ (qty 19) is ineligible',
        product: WHOLESALE_ONLY, basePrice: 1000, quantity: 19,
        expect: { pricingType: 'wholesale', eligible: false, reason: 'BELOW_MOQ', minimumQuantity: 20, savings: 0 },
    },
    {
        label: 'wholesale-only at MOQ (qty 20) is eligible',
        product: WHOLESALE_ONLY, basePrice: 1000, quantity: 20,
        expect: { pricingType: 'wholesale', unitPrice: 900, savings: 2000, eligible: true, appliedTier: { minQty: 20, price: 900 } },
    },
    {
        label: 'wholesale-only at higher tier (qty 50)',
        product: WHOLESALE_ONLY, basePrice: 1000, quantity: 50,
        expect: { pricingType: 'wholesale', unitPrice: 850, savings: 7500, eligible: true, appliedTier: { minQty: 50, price: 850 } },
    },
    {
        label: 'wholesale-only qty 1 is ineligible',
        product: WHOLESALE_ONLY, basePrice: 1000, quantity: 1,
        expect: { pricingType: 'wholesale', eligible: false, reason: 'BELOW_MOQ', minimumQuantity: 20 },
    },
    {
        label: 'wholesale-only without MOQ uses lowest tier as floor (qty 14)',
        product: WHOLESALE_ONLY_NO_MOQ, basePrice: 1000, quantity: 14,
        expect: { pricingType: 'wholesale', eligible: false, reason: 'BELOW_MOQ', minimumQuantity: 15 },
    },
    {
        label: 'wholesale-only without MOQ at floor (qty 15)',
        product: WHOLESALE_ONLY_NO_MOQ, basePrice: 1000, quantity: 15,
        expect: { pricingType: 'wholesale', unitPrice: 880, savings: 1800, eligible: true, appliedTier: { minQty: 15, price: 880 } },
    },

    // ── Variant base prices flow through unchanged ──
    {
        label: 'variant base price is the tier comparison base (retail path)',
        product: HYBRID, basePrice: 1200, quantity: 5,
        expect: { pricingType: 'retail', unitPrice: 1200, savings: 0, eligible: true },
    },
    {
        label: 'variant base price affects savings, not tier price',
        product: HYBRID, basePrice: 1200, quantity: 10,
        expect: { pricingType: 'wholesale', unitPrice: 950, savings: 2500, eligible: true, appliedTier: { minQty: 10, price: 950 } },
    },

    // ── Defensive input handling ──
    {
        label: 'quantity 0 treated as retail-safe',
        product: HYBRID, basePrice: 1000, quantity: 0,
        expect: { pricingType: 'retail', unitPrice: 1000, savings: 0 },
    },
];

export default PRICING_FIXTURES;
