/**
 * Product field ownership model.
 *
 * The multi-channel architecture stores ONE product document that may be
 * published to several channels. Fields therefore fall into exactly two
 * classes, and conflating them is what made `productCapabilityGuard` reject
 * every Wholesale and Quick Commerce write:
 *
 *   SHARED CORE   — channel-neutral product identity (name, images, price,
 *                   stock, category, variants, SEO...). Editable from ANY
 *                   workspace the vendor holds. There is one copy; editing it
 *                   from Wholesale legitimately changes what Retail shows,
 *                   because it is the same product.
 *
 *   CHANNEL-OWNED — data that only exists because a specific channel exists
 *                   (wholesale price tiers/MOQ, Quick Commerce pack size and
 *                   per-order cap, and each channel's publication flag).
 *                   Writable ONLY from the owning workspace.
 *
 * The guard's security purpose is the second class: a Retail workspace must
 * not be able to rewrite wholesale tier pricing, and a Wholesale workspace
 * must not be able to set Quick Commerce fields. Restricting the shared core
 * per channel was never the requirement and simply broke the product form.
 *
 * `VendorCapabilities[*].allowedProductFields` is derived from this file so
 * the three lists cannot drift apart again.
 */

/**
 * Server-managed keys. Present in request bodies for legitimate reasons
 * (concurrency token, echoed document fields) but never vendor-authored data.
 */
export const SYSTEM_PRODUCT_FIELDS = Object.freeze([
    '_id', '__v', 'id', 'vendorId', 'slug', 'createdAt', 'updatedAt',
    'expectedVersion', 'workspace',
]);

/**
 * Channel-neutral product identity. Editable from every workspace.
 *
 * Kept in sync with the Product schema and the create/update Joi validators;
 * a field that exists in both belongs here unless it is channel-owned below.
 */
export const SHARED_PRODUCT_FIELDS = Object.freeze([
    // Identity & merchandising
    'name', 'description', 'unit', 'sku', 'tags',
    'image', 'images',
    // Classification
    'categoryId', 'subcategoryId', 'brandId',
    // Commercials (base price; channel pricing lives in channel-owned data)
    'price', 'originalPrice', 'taxRate', 'taxIncluded', 'hsnCode',
    // Inventory (shared pool in V1 — see InventoryReservationService)
    'stock', 'stockQuantity', 'lowStockThreshold',
    'minimumOrderQuantity', 'totalAllowedQuantity',
    // Variants (shared axes and shared stock map)
    'variants',
    // Fulfilment policy
    'codAllowed', 'returnable', 'cancelable',
    'warrantyPeriod', 'guaranteePeriod',
    // Storefront presentation
    'isActive', 'isVisible', 'isFeatured', 'isNewArrival', 'flashSale',
    'seoTitle', 'seoDescription', 'faqs', 'relatedProducts',
]);

/**
 * Data owned by one channel. Writable only from that channel's workspace.
 * Keyed by canonical channel value (see constants/vendorChannels.js).
 */
export const CHANNEL_OWNED_PRODUCT_FIELDS = Object.freeze({
    retail: Object.freeze(['retailEnabled']),
    wholesale: Object.freeze(['wholesaleEnabled', 'wholesale']),
    quick_commerce: Object.freeze([
        'quickCommerceEnabled', 'quickCommerce', 'quickCommerceCategoryId',
    ]),
});

export const ALL_CHANNEL_OWNED_PRODUCT_FIELDS = Object.freeze(
    Object.values(CHANNEL_OWNED_PRODUCT_FIELDS).flat()
);

/** Every field a given workspace may author. */
export const allowedProductFieldsForChannel = (channel) => Object.freeze([
    ...SHARED_PRODUCT_FIELDS,
    ...(CHANNEL_OWNED_PRODUCT_FIELDS[channel] ?? []),
]);

/**
 * Classify the keys of a product payload for one workspace.
 *
 * @returns {{crossChannel: string[], unknown: string[]}}
 *   crossChannel — fields owned by a DIFFERENT channel (authorization breach)
 *   unknown      — fields belonging to no known class (schema drift / probing)
 */
export const classifyProductFields = (body = {}, channel) => {
    const owned = new Set(CHANNEL_OWNED_PRODUCT_FIELDS[channel] ?? []);
    const shared = new Set(SHARED_PRODUCT_FIELDS);
    const system = new Set(SYSTEM_PRODUCT_FIELDS);
    const foreign = new Set(
        ALL_CHANNEL_OWNED_PRODUCT_FIELDS.filter((field) => !owned.has(field))
    );

    const crossChannel = [];
    const unknown = [];
    for (const field of Object.keys(body)) {
        if (system.has(field) || owned.has(field) || shared.has(field)) continue;
        if (foreign.has(field)) crossChannel.push(field);
        else unknown.push(field);
    }
    return { crossChannel, unknown };
};
