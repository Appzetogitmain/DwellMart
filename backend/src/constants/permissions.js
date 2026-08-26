/**
 * DwellMart Master Permission Constants & Presets
 */

export const PERMISSIONS = {
    // Dashboard
    DASHBOARD_VIEW: 'dashboard.view',

    // Users (Customers)
    USERS_VIEW: 'users.view',
    USERS_EDIT: 'users.edit',
    USERS_DELETE: 'users.delete',

    // Vendors
    VENDORS_VIEW: 'vendors.view',
    VENDORS_APPROVE: 'vendors.approve',
    VENDORS_EDIT: 'vendors.edit',
    VENDORS_DELETE: 'vendors.delete',

    // Delivery Partners
    DELIVERY_VIEW: 'delivery.view',
    DELIVERY_APPROVE: 'delivery.approve',
    DELIVERY_EDIT: 'delivery.edit',

    // Products
    PRODUCTS_VIEW: 'products.view',
    PRODUCTS_ADD: 'products.add',
    PRODUCTS_EDIT: 'products.edit',
    PRODUCTS_DELETE: 'products.delete',

    // Categories
    CATEGORIES_VIEW: 'categories.view',
    CATEGORIES_ADD: 'categories.add',
    CATEGORIES_EDIT: 'categories.edit',
    CATEGORIES_DELETE: 'categories.delete',

    // Orders
    ORDERS_VIEW: 'orders.view',
    ORDERS_UPDATE: 'orders.update',
    ORDERS_CANCEL: 'orders.cancel',

    // Support Desk
    SUPPORT_VIEW: 'support.view',
    SUPPORT_REPLY: 'support.reply',
    SUPPORT_UPDATE_STATUS: 'support.update_status',

    // Wallet & Finance
    WALLET_VIEW: 'wallet.view',
    WALLET_EDIT: 'wallet.edit',
    SETTLEMENTS_VIEW: 'settlements.view',
    REFUNDS_VIEW: 'refunds.view',

    // Reports
    REPORTS_VIEW: 'reports.view',
    REPORTS_EXPORT: 'reports.export',

    // Marketing
    OFFERS_VIEW: 'offers.view',
    OFFERS_EDIT: 'offers.edit',
    BANNERS_VIEW: 'banners.view',
    BANNERS_EDIT: 'banners.edit',
    SLIDERS_VIEW: 'sliders.view',
    SLIDERS_EDIT: 'sliders.edit',
    PROMOCODES_VIEW: 'promocodes.view',
    PROMOCODES_EDIT: 'promocodes.edit',

    // Wholesale Marketplace
    //
    // `wholesale.vendors.manage` and `wholesale.products.manage` were REMOVED.
    // No wholesale-specific admin route exists or is planned: wholesale is a
    // flag on the ordinary product and vendor records, managed through the
    // ordinary product and vendor routes. Keeping the tokens advertised a
    // boundary the system could not enforce — an operator granting them
    // believed they had restricted wholesale management, and had not.
    WHOLESALE_ANALYTICS_VIEW: 'wholesale.analytics.view',

    // Quick Commerce
    QUICKCOMMERCE_VENDORS_MANAGE: 'quickcommerce.vendors.manage',
    QUICKCOMMERCE_ORDERS_MANAGE: 'quickcommerce.orders.manage',
    QUICKCOMMERCE_ANALYTICS_VIEW: 'quickcommerce.analytics.view',
    QUICKCOMMERCE_SETTINGS_MANAGE: 'quickcommerce.settings.manage',

    // Settings
    SETTINGS_VIEW: 'settings.view',
    SETTINGS_EDIT: 'settings.edit',

    // Admin Management
    //
    // `subadmin.view/create/edit/delete` were REMOVED. Sub-admin management is
    // guarded by `requireSuperAdmin`, which is a stronger and deliberately
    // non-delegable control — a sub-admin able to grant sub-admin permissions
    // is a privilege-escalation path. The tokens were assignable and honoured
    // by nothing, which made the restriction look delegable when it is not.
    //
    // `vendors.delete` was also REMOVED: no vendor deletion route exists. If
    // one is added, the token is added in the same change as the route that
    // enforces it.
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/**
 * Tokens that were removed, retained so historical Admin records can be
 * cleaned up and so a stale UI grant is recognised rather than silently kept.
 */
export const RETIRED_PERMISSIONS = [
    'wholesale.vendors.manage',
    'wholesale.products.manage',
    'subadmin.view',
    'subadmin.create',
    'subadmin.edit',
    'subadmin.delete',
];

/**
 * Permission Dependencies
 * If an action permission is assigned, its view permission is automatically required.
 */
export const PERMISSION_DEPENDENCIES = {
    'users.edit': 'users.view',
    'users.delete': 'users.view',
    'vendors.approve': 'vendors.view',
    'vendors.edit': 'vendors.view',
    'vendors.delete': 'vendors.view',
    'delivery.approve': 'delivery.view',
    'delivery.edit': 'delivery.view',
    'products.add': 'products.view',
    'products.edit': 'products.view',
    'products.delete': 'products.view',
    'categories.add': 'categories.view',
    'categories.edit': 'categories.view',
    'categories.delete': 'categories.view',
    'orders.update': 'orders.view',
    'orders.cancel': 'orders.view',
    'support.reply': 'support.view',
    'support.update_status': 'support.view',
    'wallet.edit': 'wallet.view',
    'reports.export': 'reports.view',
    'offers.edit': 'offers.view',
    'banners.edit': 'banners.view',
    'sliders.edit': 'sliders.view',
    'promocodes.edit': 'promocodes.view',
    'settings.edit': 'settings.view',
    'wholesale.analytics.view': 'dashboard.view',
    'quickcommerce.vendors.manage': 'vendors.view',
    'quickcommerce.orders.manage': 'orders.view',
    'quickcommerce.analytics.view': 'dashboard.view',
    'quickcommerce.settings.manage': 'settings.view',
};

/**
 * Quick Role Presets
 */
export const PRESET_ROLES = {
    full_access: {
        name: 'Full Access',
        description: 'Grants access to all system modules except Sub Admin management.',
        permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith('subadmin.')),
    },
    order_manager: {
        name: 'Order Manager',
        description: 'Manage orders, tracking, status updates, and customer communications.',
        permissions: [
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.ORDERS_VIEW,
            PERMISSIONS.ORDERS_UPDATE,
            PERMISSIONS.ORDERS_CANCEL,
            PERMISSIONS.DELIVERY_VIEW,
            PERMISSIONS.SUPPORT_VIEW,
        ],
    },
    vendor_manager: {
        name: 'Vendor Manager',
        description: 'Approve vendors, view vendor analytics, manage commissions and documents.',
        permissions: [
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.VENDORS_VIEW,
            PERMISSIONS.VENDORS_APPROVE,
            PERMISSIONS.VENDORS_EDIT,
            PERMISSIONS.PRODUCTS_VIEW,
            PERMISSIONS.CATEGORIES_VIEW,
        ],
    },
    support_executive: {
        name: 'Support Executive',
        description: 'Respond to customer, vendor, and delivery partner support tickets.',
        permissions: [
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.SUPPORT_VIEW,
            PERMISSIONS.SUPPORT_REPLY,
            PERMISSIONS.SUPPORT_UPDATE_STATUS,
            PERMISSIONS.USERS_VIEW,
            PERMISSIONS.ORDERS_VIEW,
        ],
    },
    finance: {
        name: 'Finance & Wallet',
        description: 'View sales reports, revenue overview, settlements, refunds, and wallet status.',
        permissions: [
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.WALLET_VIEW,
            PERMISSIONS.WALLET_EDIT,
            PERMISSIONS.SETTLEMENTS_VIEW,
            PERMISSIONS.REFUNDS_VIEW,
            PERMISSIONS.REPORTS_VIEW,
            PERMISSIONS.REPORTS_EXPORT,
        ],
    },
    marketing: {
        name: 'Marketing Executive',
        description: 'Manage home sliders, festival offers, banners, and promotional codes.',
        permissions: [
            PERMISSIONS.DASHBOARD_VIEW,
            PERMISSIONS.OFFERS_VIEW,
            PERMISSIONS.OFFERS_EDIT,
            PERMISSIONS.BANNERS_VIEW,
            PERMISSIONS.BANNERS_EDIT,
            PERMISSIONS.SLIDERS_VIEW,
            PERMISSIONS.SLIDERS_EDIT,
            PERMISSIONS.PROMOCODES_VIEW,
            PERMISSIONS.PROMOCODES_EDIT,
        ],
    },
};

/**
 * Maps permission strings to sidebar module keys
 */
export const MODULE_TO_PERMISSION_MAP = {
    dashboard: PERMISSIONS.DASHBOARD_VIEW,
    orders: PERMISSIONS.ORDERS_VIEW,
    returns: PERMISSIONS.ORDERS_VIEW,
    products: PERMISSIONS.PRODUCTS_VIEW,
    categories: PERMISSIONS.CATEGORIES_VIEW,
    brands: PERMISSIONS.CATEGORIES_VIEW,
    customers: PERMISSIONS.USERS_VIEW,
    delivery: PERMISSIONS.DELIVERY_VIEW,
    vendors: PERMISSIONS.VENDORS_VIEW,
    sell_on_dwellmart: PERMISSIONS.VENDORS_VIEW,
    offers: PERMISSIONS.OFFERS_VIEW,
    banners: PERMISSIONS.BANNERS_VIEW,
    testimonials: PERMISSIONS.OFFERS_VIEW,
    promocodes: PERMISSIONS.PROMOCODES_VIEW,
    notifications: PERMISSIONS.DASHBOARD_VIEW,
    support: PERMISSIONS.SUPPORT_VIEW,
    reports: PERMISSIONS.REPORTS_VIEW,
    finance: PERMISSIONS.WALLET_VIEW,
    settings: PERMISSIONS.SETTINGS_VIEW,
    policies: PERMISSIONS.SETTINGS_VIEW,
    // subadmins deliberately absent: guarded by requireSuperAdmin, not a token.
};

/**
 * Calculates active sidebar modules array from assigned permissions
 */
export const calculateSidebarModules = (role, permissions = []) => {
    if (role === 'superadmin') {
        return Object.keys(MODULE_TO_PERMISSION_MAP);
    }
    const permSet = new Set(permissions);
    const modules = [];

    for (const [moduleKey, requiredPerm] of Object.entries(MODULE_TO_PERMISSION_MAP)) {
        if (moduleKey === 'subadmins') continue; // Subadmin management superadmin only
        if (permSet.has(requiredPerm)) {
            modules.push(moduleKey);
        }
    }
    return modules;
};
