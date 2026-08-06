import ApiError from '../utils/ApiError.js';

/**
 * Shared wholesale/bulk-pricing validation.
 *
 * Single source of truth for the wholesale business rules, used by both the
 * vendor and admin product controllers (and, in a later phase, the bulk CSV
 * importer) so tier rules can never drift between entry points.
 */

/**
 * Resolve and validate the Quick Commerce portion of a product payload.
 *
 * Enforces:
 *   - Quick Commerce can only be enabled when the owning vendor has the channel.
 *   - A Quick Commerce product must be filed in the Quick Commerce category tree.
 *   - maxOrderQty, when set, must be a positive whole number.
 *
 * Mirrors `resolveWholesalePayload` so both channels validate the same way.
 *
 * @param {object} params
 * @param {boolean} params.quickCommerceEnabled
 * @param {object}  params.quickCommerce            Raw sub-document payload.
 * @param {string}  params.quickCommerceCategoryId
 * @param {boolean} params.vendorQuickCommerceEnabled
 * @param {string}  [params.categoryExperience]     Experience of the referenced
 *   category, resolved by the caller (cross-collection lookup).
 * @returns {{ quickCommerceEnabled: boolean, quickCommerceCategoryId?: any, quickCommerce?: object }}
 */
export const resolveQuickCommercePayload = ({
    quickCommerceEnabled,
    quickCommerce,
    quickCommerceCategoryId,
    vendorQuickCommerceEnabled,
    categoryExperience,
}) => {
    const isEnabled = quickCommerceEnabled === true;

    if (!isEnabled) {
        // Preserve any previously stored configuration; it is simply inactive.
        return { quickCommerceEnabled: false };
    }

    if (!vendorQuickCommerceEnabled) {
        throw new ApiError(
            403,
            'This vendor does not have the Quick Commerce channel enabled. Enable it in the vendor selling channels before adding Quick Commerce products.'
        );
    }

    if (!quickCommerceCategoryId) {
        throw new ApiError(400, 'Quick Commerce products require a Quick Commerce category.');
    }

    if (categoryExperience && categoryExperience !== 'quick_commerce') {
        throw new ApiError(400, 'The selected category does not belong to the Quick Commerce category tree.');
    }

    const resolved = {
        isPerishable: quickCommerce?.isPerishable === true,
    };

    if (quickCommerce?.packSize) resolved.packSize = String(quickCommerce.packSize).trim();
    if (quickCommerce?.handlingNote) resolved.handlingNote = String(quickCommerce.handlingNote).trim();

    if (quickCommerce?.shelfLifeDays !== undefined && quickCommerce?.shelfLifeDays !== null && quickCommerce?.shelfLifeDays !== '') {
        const shelfLife = Number(quickCommerce.shelfLifeDays);
        if (!Number.isInteger(shelfLife) || shelfLife < 0) {
            throw new ApiError(400, 'Shelf life must be a whole number of days.');
        }
        resolved.shelfLifeDays = shelfLife;
    }

    if (quickCommerce?.maxOrderQty !== undefined && quickCommerce?.maxOrderQty !== null && quickCommerce?.maxOrderQty !== '') {
        const maxOrderQty = Number(quickCommerce.maxOrderQty);
        if (!Number.isInteger(maxOrderQty) || maxOrderQty < 1) {
            throw new ApiError(400, 'Maximum order quantity must be a whole number of 1 or more.');
        }
        resolved.maxOrderQty = maxOrderQty;
    }

    return {
        quickCommerceEnabled: true,
        quickCommerceCategoryId,
        quickCommerce: resolved,
    };
};

/**
 * Serialize price tiers into the CSV cell format: "10:950|25:900|50:850".
 *
 * The database always stores a structured array; this delimited form exists
 * only because a spreadsheet cell cannot hold a nested array. Defined here so
 * the template, importer, and exporter can never drift apart.
 */
export const serializePriceTiers = (tiers) => {
    if (!Array.isArray(tiers) || tiers.length === 0) return '';
    return tiers
        .map((tier) => ({ minQty: Number(tier?.minQty), price: Number(tier?.price) }))
        .filter((tier) => Number.isFinite(tier.minQty) && Number.isFinite(tier.price))
        .sort((a, b) => a.minQty - b.minQty)
        .map((tier) => `${tier.minQty}:${tier.price}`)
        .join('|');
};

/**
 * Parse the CSV cell format back into structured tiers.
 *
 * @param {string} raw Cell contents, e.g. "10:950|25:900".
 * @returns {{ tiers: Array<{minQty:number, price:number}>, errors: string[] }}
 *          Malformed segments are reported rather than silently dropped, so a
 *          typo surfaces in the import error report instead of losing a tier.
 */
export const parsePriceTiersCell = (raw) => {
    const text = String(raw ?? '').trim();
    if (!text) return { tiers: [], errors: [] };

    const tiers = [];
    const errors = [];

    for (const segment of text.split('|')) {
        const part = segment.trim();
        if (!part) continue;

        const pieces = part.split(':');
        if (pieces.length !== 2) {
            errors.push(`Bulk pricing tier "${part}" must use the format quantity:price (e.g. 10:950).`);
            continue;
        }

        const minQty = Number(pieces[0].trim());
        const price = Number(pieces[1].trim());

        if (!Number.isInteger(minQty) || minQty < 1) {
            errors.push(`Bulk pricing tier "${part}" has an invalid quantity. Use a whole number of 1 or more.`);
            continue;
        }
        if (!Number.isFinite(price) || price < 0) {
            errors.push(`Bulk pricing tier "${part}" has an invalid price.`);
            continue;
        }

        tiers.push({ minQty, price });
    }

    return { tiers, errors };
};

/**
 * Normalize a raw price-tier array into sorted { minQty, price } entries.
 * Returns [] for any non-array input.
 */
export const normalizePriceTiers = (rawTiers) => {
    if (!Array.isArray(rawTiers)) return [];
    return rawTiers
        .map((tier) => ({
            minQty: Number(tier?.minQty),
            price: Number(tier?.price),
        }))
        .filter((tier) => Number.isFinite(tier.minQty) && Number.isFinite(tier.price))
        .sort((a, b) => a.minQty - b.minQty);
};

/**
 * Validate vendor-authored bulk pricing tiers against the wholesale business rules.
 *
 * Rules enforced (blueprint §9):
 *   4. A wholesale-enabled product requires at least one pricing tier.
 *   6. Tier quantities must be unique, whole numbers >= 1, and sorted ascending.
 *   7. Every tier price must be lower than the product's retail price.
 *
 * @param {number} retailPrice   The product's base retail price.
 * @param {Array}  priceTiers    Raw tier array from the request payload.
 * @returns {Array} normalized, sorted tiers
 * @throws {ApiError} 400 with a user-friendly message on the first violation
 */
export const validatePriceTiers = (retailPrice, priceTiers) => {
    const tiers = normalizePriceTiers(priceTiers);

    if (tiers.length === 0) {
        throw new ApiError(400, 'Wholesale products require at least one bulk pricing tier.');
    }

    const numericRetailPrice = Number(retailPrice);
    const seenQuantities = new Set();

    for (const tier of tiers) {
        if (!Number.isInteger(tier.minQty) || tier.minQty < 1) {
            throw new ApiError(400, 'Each bulk pricing tier must have a whole minimum quantity of 1 or more.');
        }
        if (tier.price < 0) {
            throw new ApiError(400, 'Bulk pricing tier prices cannot be negative.');
        }
        if (seenQuantities.has(tier.minQty)) {
            throw new ApiError(400, `Duplicate bulk pricing tier for quantity ${tier.minQty}. Each tier must use a unique minimum quantity.`);
        }
        seenQuantities.add(tier.minQty);

        if (Number.isFinite(numericRetailPrice) && tier.price >= numericRetailPrice) {
            throw new ApiError(400, `Bulk price for ${tier.minQty}+ units must be lower than the retail price.`);
        }
    }

    return tiers;
};

/**
 * Resolve and validate the wholesale portion of a product payload.
 *
 * Enforces (blueprint §9):
 *   2. At least one selling channel must be enabled on the product.
 *   3. Wholesale can only be enabled when the owning vendor has the wholesale channel enabled.
 *   5. MOQ cannot exceed available stock.
 *   + tier rules via validatePriceTiers()
 *
 * @param {object} params
 * @param {boolean} params.retailEnabled
 * @param {boolean} params.wholesaleEnabled
 * @param {object}  params.wholesale       Raw { moqEnabled, moq, priceTiers } payload.
 * @param {number}  params.price           Product retail price.
 * @param {number}  params.stockQuantity   Resolved stock quantity.
 * @param {boolean} params.vendorWholesaleEnabled  Whether the owning vendor allows wholesale.
 * @returns {{ retailEnabled: boolean, wholesaleEnabled: boolean, wholesale: object }}
 */
export const resolveWholesalePayload = ({
    retailEnabled,
    wholesaleEnabled,
    wholesale,
    price,
    stockQuantity,
    vendorWholesaleEnabled,
    quickCommerceEnabled = false,
}) => {
    const isRetailEnabled = retailEnabled !== false;
    const isWholesaleEnabled = wholesaleEnabled === true;
    const isQuickCommerceEnabled = quickCommerceEnabled === true;

    if (!isRetailEnabled && !isWholesaleEnabled && !isQuickCommerceEnabled) {
        throw new ApiError(400, 'At least one selling channel (Retail, Wholesale, or Quick Commerce) must be enabled for this product.');
    }

    if (!isWholesaleEnabled) {
        // Preserve any previously configured wholesale data untouched; it is simply inactive.
        return {
            retailEnabled: isRetailEnabled,
            wholesaleEnabled: false,
        };
    }

    if (!vendorWholesaleEnabled) {
        throw new ApiError(
            403,
            'This vendor does not have the Wholesale Marketplace channel enabled. Enable it in the vendor selling channels before adding wholesale products.'
        );
    }

    const tiers = validatePriceTiers(price, wholesale?.priceTiers);

    const moqEnabled = wholesale?.moqEnabled === true;
    let moq;
    if (moqEnabled) {
        moq = Number(wholesale?.moq);
        if (!Number.isInteger(moq) || moq < 1) {
            throw new ApiError(400, 'Minimum order quantity must be a whole number of 1 or more.');
        }
        const numericStock = Number(stockQuantity);
        if (Number.isFinite(numericStock) && moq > numericStock) {
            throw new ApiError(400, `Minimum order quantity (${moq}) cannot exceed available stock (${numericStock}).`);
        }
    }

    return {
        retailEnabled: isRetailEnabled,
        wholesaleEnabled: true,
        wholesale: {
            moqEnabled,
            ...(moqEnabled ? { moq } : {}),
            priceTiers: tiers,
        },
    };
};
