/**
 * VendorTypes & VendorCapabilities — Frontend Mirror
 * version: 1
 *
 * Mirrors the backend constants. Keep in sync with:
 * backend/src/constants/vendorCapabilities.js
 *
 * ALL UI decisions (menus, route guards, product form sections, dashboard
 * widgets, settings tabs, product list filters) MUST come from this config.
 * Never write `vendorType === "quick_commerce"` in JSX — check the capability.
 */

export const CAPABILITIES_VERSION = 1;

export const VendorTypes = {
    QUICK_COMMERCE: 'quick_commerce',
    RETAIL: 'retail',
    WHOLESALE: 'wholesale',
};

export const VENDOR_TYPE_LABELS = {
    quick_commerce: 'Quick Commerce',
    retail: 'Retail',
    wholesale: 'Wholesale',
};

export const UNIFIED_VENDOR_MENU = [
    { title: 'Business Overview',    route: '/vendor/business-overview',  icon: 'Analytics' },
    { title: 'Dashboard',            route: '/vendor/dashboard',          icon: 'Dashboard' },
    {
        title: 'Products',
        route: '/vendor/products',
        icon: 'Products',
        children: ['Manage Products', 'Add Product'],
    },
    { title: 'Orders',               route: '/vendor/orders',            icon: 'Orders' },
    { title: 'Return Requests',      route: '/vendor/return-requests',   icon: 'Return Requests' },
    { title: 'Product Reviews',      route: '/vendor/product-reviews',   icon: 'Product Reviews' },
    { title: 'Stock Management',     route: '/vendor/stock-management',  icon: 'Stock Management' },
    { title: 'Wallet',               route: '/vendor/wallet-history',    icon: 'Wallet History' },
    { title: 'Subscriptions',        route: '/vendor/subscription',      icon: 'Subscriptions' },
    { title: 'Support Desk',         route: '/vendor/support-tickets',   icon: 'Support Tickets' },
    { title: 'Shipping Management',   route: '/vendor/shipping-management', icon: 'Shipping Management' },
    { title: 'Customers',            route: '/vendor/customers',         icon: 'Customers' },
    { title: 'Inventory Reports',      route: '/vendor/inventory-reports', icon: 'Inventory Reports' },
    { title: 'Performance Metrics',  route: '/vendor/performance-metrics', icon: 'Performance Metrics' },
    { title: 'Analytics',            route: '/vendor/analytics',         icon: 'Analytics' },
    { title: 'Earnings',             route: '/vendor/earnings',          icon: 'Earnings' },
    { title: 'Store Settings',       route: '/vendor/settings',          icon: 'Settings' },
    { title: 'Selling Channels',     route: '/vendor/channels',          icon: 'Channels' },
    { title: 'Profile',              route: '/vendor/profile',           icon: 'Profile' },
];

export const UNIFIED_VENDOR_ROUTES = [
    '/vendor/dashboard',
    '/vendor/products',
    '/vendor/products/manage-products',
    '/vendor/products/add-product',
    '/vendor/orders',
    '/vendor/orders/all-orders',
    '/vendor/orders/order-tracking',
    '/vendor/return-requests',
    '/vendor/product-reviews',
    '/vendor/stock-management',
    '/vendor/wallet-history',
    '/vendor/subscription',
    '/vendor/subscriptions',
    '/vendor/support-tickets',
    '/vendor/shipping-management',
    '/vendor/customers',
    '/vendor/inventory-reports',
    '/vendor/performance-metrics',
    '/vendor/analytics',
    '/vendor/earnings',
    '/vendor/earnings/overview',
    '/vendor/earnings/commission-history',
    '/vendor/earnings/settlement-history',
    '/vendor/settings',
    '/vendor/settings/store',
    '/vendor/settings/payment',
    '/vendor/settings/shipping',
    '/vendor/profile',
];

export const VendorCapabilities = {

    // ── Quick Commerce ────────────────────────────────────────────────────────
    [VendorTypes.QUICK_COMMERCE]: {
        version: CAPABILITIES_VERSION,
        orderFlow: 'quick_commerce',

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
            customers: true,
            promotions: false,
        },

        permissions: {
            createCoupons: false,
            bulkPricing: false,
            deliveryRadius: true,
            inventoryTracking: true,
            returns: true,
            subscriptions: true,
        },

        menu: UNIFIED_VENDOR_MENU,
        routes: UNIFIED_VENDOR_ROUTES,

        dashboardLayout: {
            left: ['liveOrders', 'preparationQueue'],
            right: ['inventoryAlerts', 'todayStats'],
        },

        settingsSections: [
            { id: 'identity',      title: 'Store Identity',   component: 'IdentitySettings' },
            { id: 'contact',       title: 'Contact Info',     component: 'ContactSettings' },
            { id: 'quickCommerce', title: 'Quick Commerce',   component: 'QuickCommerceSettings' },
            { id: 'businessType',  title: 'Business Type',    component: 'BusinessTypeInfo' },
        ],

        allowedFormSections: {
            general:          true,
            media:            true,
            pricing:          true,
            inventory:        true,
            variants:         false,
            quickCommerce:    true,
            wholesalePricing: false,
            shipping:         false,
            visibility:       true,
            tags:             true,
            faqs:             true,
        },

        productListFilters: ['stock', 'category', 'perishable'],
    },

    // ── Retail ────────────────────────────────────────────────────────────────
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

        menu: UNIFIED_VENDOR_MENU,
        routes: UNIFIED_VENDOR_ROUTES,

        dashboardLayout: {
            left: ['salesOverview', 'recentOrders'],
            right: ['topProducts', 'customerStats'],
        },

        settingsSections: [
            { id: 'identity',     title: 'Store Identity',  component: 'IdentitySettings' },
            { id: 'contact',      title: 'Contact Info',    component: 'ContactSettings' },
            { id: 'shipping',     title: 'Shipping',        component: 'ShippingSettings' },
            { id: 'returns',      title: 'Return Policy',   component: 'ReturnSettings' },
            { id: 'businessType', title: 'Business Type',   component: 'BusinessTypeInfo' },
        ],

        allowedFormSections: {
            general:          true,
            media:            true,
            pricing:          true,
            inventory:        true,
            variants:         true,
            quickCommerce:    false,
            wholesalePricing: false,
            shipping:         true,
            visibility:       true,
            tags:             true,
            faqs:             true,
        },

        productListFilters: ['stock', 'category', 'brand', 'discount'],
    },

    // ── Wholesale ─────────────────────────────────────────────────────────────
    [VendorTypes.WHOLESALE]: {
        version: CAPABILITIES_VERSION,
        orderFlow: 'wholesale',

        features: {
            inventory: true,
            reviews: true,
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

        menu: UNIFIED_VENDOR_MENU,
        routes: UNIFIED_VENDOR_ROUTES,

        dashboardLayout: {
            left: ['bulkSales', 'pendingOrders'],
            right: ['moqPerformance', 'invoicesSummary'],
        },

        settingsSections: [
            { id: 'identity',     title: 'Store Identity',  component: 'IdentitySettings' },
            { id: 'contact',      title: 'Contact Info',    component: 'ContactSettings' },
            { id: 'businessInfo', title: 'Business Info',   component: 'BusinessInfoSettings' },
            { id: 'gst',          title: 'GST',             component: 'GSTSettings' },
            { id: 'businessType', title: 'Business Type',   component: 'BusinessTypeInfo' },
        ],

        allowedFormSections: {
            general:          true,
            media:            true,
            pricing:          true,
            inventory:        true,
            variants:         true,
            quickCommerce:    false,
            wholesalePricing: true,
            shipping:         false,
            visibility:       true,
            tags:             true,
            faqs:             true,
        },

        productListFilters: ['stock', 'category', 'moq', 'bulkPrice'],
    },
};

/**
 * Get capabilities for a given vendorType.
 * Returns RETAIL as safe fallback if type is unrecognized.
 */
export const getVendorCapabilities = (vendorType) =>
    VendorCapabilities[vendorType] ?? VendorCapabilities[VendorTypes.RETAIL];
