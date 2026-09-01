/**
 * Shopping Experiences
 *
 * DwellMart exposes two independent customer experiences over one shared
 * catalog, vendor, order, and delivery core:
 *
 *   marketplace     → B2C Retail + B2B Wholesale (the existing experience)
 *   quick_commerce  → hyperlocal, minutes-delivery
 *
 * The experience is a discriminator dimension carried on Vendor, Product,
 * Category, and Order, and resolved per-request by the `resolveExperience`
 * middleware. Marketplace is always the default so existing clients that send
 * no experience hint behave exactly as before.
 */

export const EXPERIENCES = {
    MARKETPLACE:    'marketplace',
    QUICK_COMMERCE: 'quick_commerce',
    // P2-CON-01 FIX: WHOLESALE was missing, causing EXPERIENCES.WHOLESALE === undefined.
    // Wholesale B2B is a distinct fulfillment channel that requires its own catalog/pricing logic.
    WHOLESALE:      'wholesale',
};

export const EXPERIENCE_VALUES = Object.values(EXPERIENCES);

export const DEFAULT_EXPERIENCE = EXPERIENCES.MARKETPLACE;

/**
 * Normalize an arbitrary experience hint into a known value.
 * Unknown/missing input resolves to marketplace (backward compatible).
 * P2-CON-01: 'wholesale' is now a valid experience value.
 */
export const normalizeExperience = (raw) => {
    const value = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (value === 'quick_commerce' || value === 'quickcommerce' || value === 'qc') {
        return EXPERIENCES.QUICK_COMMERCE;
    }
    if (value === 'wholesale' || value === 'b2b') {
        return EXPERIENCES.WHOLESALE;
    }
    if (value === 'marketplace' || value === 'retail' || value === 'b2c') {
        return EXPERIENCES.MARKETPLACE;
    }
    return EXPERIENCE_VALUES.includes(value) ? value : DEFAULT_EXPERIENCE;
};

/**
 * Read the effective experience for a request.
 *
 * Prefers the value already resolved by `resolveExperience`, but falls back to
 * reading the raw hint so callers that run before the middleware (notably the
 * response cache key builder) still derive the correct value.
 */
export const getRequestExperience = (req) => {
    if (req?.experience) return req.experience;
    const header = typeof req?.get === 'function' ? req.get('x-experience') : undefined;
    return normalizeExperience(header ?? req?.headers?.['x-experience'] ?? req?.query?.experience);
};
