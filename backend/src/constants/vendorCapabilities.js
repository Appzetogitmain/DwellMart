/**
 * VendorTypes & VendorCapabilities
 * version: 1
 *
 * Single source of truth for the entire vendor experience.
 * All backend validation, order workflows, and permission checks
 * are driven by this file.
 *
 * Adding a new vendor type (e.g. "pharmacy", "restaurant") requires
 * only adding a new entry here — no other code changes needed.
 */

export const CAPABILITIES_VERSION = 1;

export const VendorTypes = {
    QUICK_COMMERCE: 'quick_commerce',
    RETAIL: 'retail',
    WHOLESALE: 'wholesale',
};

export const VENDOR_TYPE_VALUES = Object.values(VendorTypes);

export const VendorCapabilities = {

    [VendorTypes.QUICK_COMMERCE]: {
        version: CAPABILITIES_VERSION,

        /**
         * Order strategy — matched against order.orderType, NOT vendor.vendorType.
         * This keeps orders decoupled from vendor identity.
         */
        orderFlow: 'quick_commerce',

        /** Feature flags — backend enforces these for API protection */
        features: {
            inventory: true,
            reviews: true,
            coupons: false,
            analytics: true,
            returns: true,
            subscriptions: true,
            liveTracking: true,
            quickOrders: true,
            bulkPricing: false,
            moq: false,
            customers: false,
            promotions: false,
        },

        /** Fine-grained permissions */
        permissions: {
            createCoupons: false,
            bulkPricing: false,
            deliveryRadius: true,
            inventoryTracking: true,
            returns: true,
            subscriptions: true,
        },

        /**
         * allowedProductFields — backend middleware reads this to reject
         * or sanitize fields not permitted for this vendor type.
         * Frontend uses allowedFormSections (mirror in vendorCapabilities.js).
         */
        allowedProductFields: [
            'name', 'unit', 'categoryId', 'quickCommerceCategoryId',
            'price', 'originalPrice', 'stockQuantity', 'stock', 'lowStockThreshold',
            'image', 'images', 'description', 'tags',
            'flashSale', 'isNewArrival', 'isFeatured', 'isVisible',
            'codAllowed', 'returnable', 'cancelable',
            'taxRate', 'taxIncluded', 'isActive',
            'quickCommerceEnabled', 'quickCommerce',
            'faqs', 'seoTitle', 'seoDescription',
        ],

        requiredFields: ['name', 'price', 'stockQuantity', 'categoryId'],

        /** Internal sellingChannels auto-sync — vendor never touches these */
        internalChannels: { retail: false, wholesale: false, quickCommerce: true },
    },

    // ─────────────────────────────────────────────────────────────────────────
    [VendorTypes.RETAIL]: {
        version: CAPABILITIES_VERSION,
        orderFlow: 'retail',

        features: {
            inventory: true,
            reviews: true,
            coupons: true,
            analytics: true,
            returns: true,
            subscriptions: true,
            liveTracking: false,
            quickOrders: false,
            bulkPricing: false,
            moq: false,
            customers: true,
            promotions: true,
        },

        permissions: {
            createCoupons: true,
            bulkPricing: false,
            deliveryRadius: false,
            inventoryTracking: true,
            returns: true,
            subscriptions: true,
        },

        allowedProductFields: [
            'name', 'unit', 'categoryId', 'subcategoryId', 'brandId',
            'price', 'originalPrice', 'stockQuantity', 'stock', 'lowStockThreshold',
            'minimumOrderQuantity', 'totalAllowedQuantity',
            'image', 'images', 'description', 'tags',
            'warrantyPeriod', 'guaranteePeriod', 'hsnCode',
            'returnable', 'cancelable', 'codAllowed',
            'taxRate', 'taxIncluded',
            'flashSale', 'isNewArrival', 'isFeatured', 'isVisible',
            'variants', 'faqs', 'relatedProducts',
            'seoTitle', 'seoDescription', 'isActive',
        ],

        requiredFields: ['name', 'price', 'stockQuantity', 'categoryId'],

        internalChannels: { retail: true, wholesale: false, quickCommerce: false },
    },

    // ─────────────────────────────────────────────────────────────────────────
    [VendorTypes.WHOLESALE]: {
        version: CAPABILITIES_VERSION,
        orderFlow: 'wholesale',

        features: {
            inventory: true,
            reviews: false,
            coupons: false,
            analytics: true,
            returns: true,
            subscriptions: true,
            liveTracking: false,
            quickOrders: false,
            bulkPricing: true,
            moq: true,
            customers: true,
            promotions: false,
        },

        permissions: {
            createCoupons: false,
            bulkPricing: true,
            deliveryRadius: false,
            inventoryTracking: true,
            returns: true,
            subscriptions: true,
        },

        allowedProductFields: [
            'name', 'unit', 'categoryId', 'subcategoryId', 'brandId',
            'price', 'stockQuantity', 'stock', 'lowStockThreshold',
            'minimumOrderQuantity',
            'image', 'images', 'description', 'tags',
            'hsnCode', 'taxRate', 'taxIncluded',
            'flashSale', 'isFeatured', 'isVisible', 'isActive',
            'wholesale', 'wholesaleEnabled',
            'variants', 'faqs',
            'seoTitle', 'seoDescription',
        ],

        requiredFields: ['name', 'price', 'stockQuantity', 'categoryId'],

        internalChannels: { retail: false, wholesale: true, quickCommerce: false },
    },
};

/**
 * Get capabilities for a given vendorType.
 * Returns RETAIL as safe fallback if type is unrecognized.
 */
export const getVendorCapabilities = (vendorType) =>
    VendorCapabilities[vendorType] ?? VendorCapabilities[VendorTypes.RETAIL];
