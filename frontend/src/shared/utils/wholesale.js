/**
 * Shared helpers for wholesale selling-channel state across product forms.
 *
 * Keeps form-state initialisation and API payload construction defined once so
 * the Vendor Add, Vendor Edit, and Admin product forms cannot drift apart.
 */

/** Default state for a new product: retail only, no wholesale configuration. */
export const emptyWholesaleState = () => ({
    retailEnabled: true,
    wholesaleEnabled: false,
    wholesale: {
        moqEnabled: false,
        moq: "",
        priceTiers: [],
    },
});

/**
 * Hydrate form state from a fetched product document.
 * Legacy products without wholesale fields resolve to "retail only".
 */
export const wholesaleStateFromProduct = (product) => ({
    retailEnabled: product?.retailEnabled !== false,
    wholesaleEnabled: product?.wholesaleEnabled === true,
    wholesale: {
        moqEnabled: product?.wholesale?.moqEnabled === true,
        moq: product?.wholesale?.moq ?? "",
        priceTiers: Array.isArray(product?.wholesale?.priceTiers)
            ? product.wholesale.priceTiers.map((tier) => ({
                minQty: tier?.minQty ?? "",
                price: tier?.price ?? "",
            }))
            : [],
    },
});

/**
 * Convert form state (string-based inputs) into the API payload (numeric).
 * When wholesale is disabled only the channel flags are sent, so existing
 * wholesale data on the server is left untouched.
 */
export const buildWholesalePayload = (state) => {
    const retailEnabled = state?.retailEnabled !== false;
    const wholesaleEnabled = state?.wholesaleEnabled === true;

    if (!wholesaleEnabled) {
        return { retailEnabled, wholesaleEnabled: false };
    }

    const moqEnabled = state?.wholesale?.moqEnabled === true;
    const parsedMoq = parseInt(state?.wholesale?.moq, 10);

    const priceTiers = (Array.isArray(state?.wholesale?.priceTiers) ? state.wholesale.priceTiers : [])
        .map((tier) => ({
            minQty: parseInt(tier?.minQty, 10),
            price: parseFloat(tier?.price),
        }))
        .filter((tier) => Number.isFinite(tier.minQty) && Number.isFinite(tier.price))
        .sort((a, b) => a.minQty - b.minQty);

    return {
        retailEnabled,
        wholesaleEnabled: true,
        wholesale: {
            moqEnabled,
            ...(moqEnabled && Number.isFinite(parsedMoq) ? { moq: parsedMoq } : {}),
            priceTiers,
        },
    };
};

/**
 * Client-side pre-submit validation mirroring the backend rules.
 * Returns an error message string, or null when the state is valid.
 */
export const validateWholesaleState = (state, retailPrice, stockQuantity) => {
    const retailEnabled = state?.retailEnabled !== false;
    const wholesaleEnabled = state?.wholesaleEnabled === true;

    if (!retailEnabled && !wholesaleEnabled) {
        return "At least one selling channel (Retail or Wholesale) must be enabled.";
    }
    if (!wholesaleEnabled) return null;

    const payload = buildWholesalePayload(state);
    const tiers = payload.wholesale.priceTiers;

    if (tiers.length === 0) {
        return "Wholesale products require at least one bulk pricing tier.";
    }

    const numericRetailPrice = Number(retailPrice);
    const seen = new Set();
    for (const tier of tiers) {
        if (!Number.isInteger(tier.minQty) || tier.minQty < 1) {
            return "Each bulk pricing tier needs a whole minimum quantity of 1 or more.";
        }
        if (seen.has(tier.minQty)) {
            return `Duplicate bulk pricing tier for quantity ${tier.minQty}.`;
        }
        seen.add(tier.minQty);
        if (Number.isFinite(numericRetailPrice) && numericRetailPrice > 0 && tier.price >= numericRetailPrice) {
            return `Bulk price for ${tier.minQty}+ units must be lower than the retail price.`;
        }
    }

    if (payload.wholesale.moqEnabled) {
        const moq = payload.wholesale.moq;
        if (!Number.isInteger(moq) || moq < 1) {
            return "Minimum order quantity must be a whole number of 1 or more.";
        }
        const numericStock = Number(stockQuantity);
        if (Number.isFinite(numericStock) && moq > numericStock) {
            return `Minimum order quantity (${moq}) cannot exceed available stock (${numericStock}).`;
        }
    }

    return null;
};
