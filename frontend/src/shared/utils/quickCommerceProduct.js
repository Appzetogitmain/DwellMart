/**
 * Shared helpers for Quick Commerce product state across product forms.
 *
 * Keeps form-state hydration and API payload construction defined once so the
 * Vendor Add, Vendor Edit, and Admin product forms cannot drift apart — the
 * same pattern used for wholesale.
 */

/** Default state for a new product: not on Quick Commerce. */
export const emptyQuickCommerceState = () => ({
    quickCommerceEnabled: false,
    quickCommerceCategoryId: "",
    quickCommerce: {
        packSize: "",
        shelfLifeDays: "",
        isPerishable: false,
        maxOrderQty: "",
        handlingNote: "",
    },
});

/**
 * Hydrate form state from a fetched product.
 * Products without Quick Commerce fields resolve to "not enabled".
 */
export const quickCommerceStateFromProduct = (product) => ({
    quickCommerceEnabled: product?.quickCommerceEnabled === true,
    quickCommerceCategoryId:
        product?.quickCommerceCategoryId?._id || product?.quickCommerceCategoryId || "",
    quickCommerce: {
        packSize: product?.quickCommerce?.packSize ?? "",
        shelfLifeDays: product?.quickCommerce?.shelfLifeDays ?? "",
        isPerishable: product?.quickCommerce?.isPerishable === true,
        maxOrderQty: product?.quickCommerce?.maxOrderQty ?? "",
        handlingNote: product?.quickCommerce?.handlingNote ?? "",
    },
});

/**
 * Convert form state into the API payload.
 * When the channel is off only the flag is sent, so stored configuration on the
 * server is preserved rather than cleared.
 */
export const buildQuickCommercePayload = (state) => {
    if (state?.quickCommerceEnabled !== true) {
        return { quickCommerceEnabled: false };
    }

    const details = state.quickCommerce || {};
    const shelfLifeDays = parseInt(details.shelfLifeDays, 10);
    const maxOrderQty = parseInt(details.maxOrderQty, 10);

    return {
        quickCommerceEnabled: true,
        quickCommerceCategoryId: state.quickCommerceCategoryId || null,
        quickCommerce: {
            isPerishable: details.isPerishable === true,
            ...(details.packSize ? { packSize: String(details.packSize).trim() } : {}),
            ...(details.handlingNote ? { handlingNote: String(details.handlingNote).trim() } : {}),
            ...(Number.isFinite(shelfLifeDays) ? { shelfLifeDays } : {}),
            ...(Number.isFinite(maxOrderQty) ? { maxOrderQty } : {}),
        },
    };
};

/**
 * Client-side pre-submit validation mirroring the backend rules.
 * Returns an error message, or null when valid.
 */
export const validateQuickCommerceState = (state) => {
    if (state?.quickCommerceEnabled !== true) return null;

    if (!state.quickCommerceCategoryId) {
        return "Quick Commerce products require a Quick Commerce category.";
    }

    const details = state.quickCommerce || {};

    if (details.maxOrderQty !== "" && details.maxOrderQty !== null && details.maxOrderQty !== undefined) {
        const maxOrderQty = Number(details.maxOrderQty);
        if (!Number.isInteger(maxOrderQty) || maxOrderQty < 1) {
            return "Maximum order quantity must be a whole number of 1 or more.";
        }
    }

    if (details.shelfLifeDays !== "" && details.shelfLifeDays !== null && details.shelfLifeDays !== undefined) {
        const shelfLifeDays = Number(details.shelfLifeDays);
        if (!Number.isInteger(shelfLifeDays) || shelfLifeDays < 0) {
            return "Shelf life must be a whole number of days.";
        }
    }

    return null;
};
