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

import { allowedProductFieldsForChannel } from './productFieldOwnership.js';

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
         * allowedProductFields — shared product core plus the fields this
         * channel owns. Derived from constants/productFieldOwnership.js so the
         * three channel lists cannot drift out of sync with the Product schema
         * or with each other. `productCapabilityGuard` classifies against the
         * same model.
         */
        allowedProductFields: allowedProductFieldsForChannel('quick_commerce'),

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

        allowedProductFields: allowedProductFieldsForChannel('retail'),

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

        allowedProductFields: allowedProductFieldsForChannel('wholesale'),

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
