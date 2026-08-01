/**
 * Master Permission Configuration & Definitions for DwellMart Admin Panel
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

  // Delivery
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

  // Support
  SUPPORT_VIEW: 'support.view',
  SUPPORT_REPLY: 'support.reply',
  SUPPORT_UPDATE_STATUS: 'support.update_status',

  // Finance & Wallet
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
  WHOLESALE_VENDORS_MANAGE: 'wholesale.vendors.manage',
  WHOLESALE_PRODUCTS_MANAGE: 'wholesale.products.manage',
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
  SUBADMIN_VIEW: 'subadmin.view',
  SUBADMIN_CREATE: 'subadmin.create',
  SUBADMIN_EDIT: 'subadmin.edit',
  SUBADMIN_DELETE: 'subadmin.delete',
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

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
  'wholesale.vendors.manage': 'vendors.view',
  'wholesale.products.manage': 'products.view',
  'wholesale.analytics.view': 'dashboard.view',
  'quickcommerce.vendors.manage': 'vendors.view',
  'quickcommerce.orders.manage': 'orders.view',
  'quickcommerce.analytics.view': 'dashboard.view',
  'quickcommerce.settings.manage': 'settings.view',
};

export const PRESET_ROLES = {
  full_access: {
    id: 'full_access',
    name: 'Full Access',
    description: 'Grants complete access to all system modules (excluding Sub Admin Management).',
    permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith('subadmin.')),
  },
  order_manager: {
    id: 'order_manager',
    name: 'Order Manager',
    description: 'Manage orders, tracking, status updates, and support chats.',
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
    id: 'vendor_manager',
    name: 'Vendor Manager',
    description: 'Approve vendors, view documents, manage subscriptions & commissions.',
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
    id: 'support_executive',
    name: 'Support Executive',
    description: 'Reply to support tickets and manage ticket statuses across all portals.',
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
    id: 'finance',
    name: 'Finance & Wallet',
    description: 'Manage revenue overview, settlements, refunds, and financial reports.',
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
    id: 'marketing',
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
  custom: {
    id: 'custom',
    name: 'Custom',
    description: 'Manually select individual module permissions.',
    permissions: [],
  },
};

export const PERMISSION_GROUPS = [
  {
    id: 'dashboard',
    name: 'Dashboard & Analytics',
    description: 'Overview statistics and analytics data',
    permissions: [
      { key: PERMISSIONS.DASHBOARD_VIEW, label: 'View Dashboard' },
    ],
  },
  {
    id: 'orders',
    name: 'Orders & Returns',
    description: 'Manage customer orders, returns, and delivery assignment',
    permissions: [
      { key: PERMISSIONS.ORDERS_VIEW, label: 'View Orders' },
      { key: PERMISSIONS.ORDERS_UPDATE, label: 'Update Order Status & Delivery' },
      { key: PERMISSIONS.ORDERS_CANCEL, label: 'Cancel / Delete Orders' },
    ],
  },
  {
    id: 'products',
    name: 'Products Management',
    description: 'Catalog products, pricing rules, and tax settings',
    permissions: [
      { key: PERMISSIONS.PRODUCTS_VIEW, label: 'View Products' },
      { key: PERMISSIONS.PRODUCTS_ADD, label: 'Add Products' },
      { key: PERMISSIONS.PRODUCTS_EDIT, label: 'Edit Products & Pricing' },
      { key: PERMISSIONS.PRODUCTS_DELETE, label: 'Delete Products' },
    ],
  },
  {
    id: 'categories',
    name: 'Categories & Brands',
    description: 'Marketplace taxonomy and brand registry',
    permissions: [
      { key: PERMISSIONS.CATEGORIES_VIEW, label: 'View Categories & Brands' },
      { key: PERMISSIONS.CATEGORIES_ADD, label: 'Add Categories & Brands' },
      { key: PERMISSIONS.CATEGORIES_EDIT, label: 'Edit & Reorder Categories' },
      { key: PERMISSIONS.CATEGORIES_DELETE, label: 'Delete Categories & Brands' },
    ],
  },
  {
    id: 'vendors',
    name: 'Vendors Management',
    description: 'Store approvals, documents, and commissions',
    permissions: [
      { key: PERMISSIONS.VENDORS_VIEW, label: 'View Vendors' },
      { key: PERMISSIONS.VENDORS_APPROVE, label: 'Approve / Reject Vendors' },
      { key: PERMISSIONS.VENDORS_EDIT, label: 'Edit Commissions & Details' },
      { key: PERMISSIONS.VENDORS_DELETE, label: 'Delete Vendors' },
    ],
  },
  {
    id: 'users',
    name: 'Customers Management',
    description: 'Customer profiles, addresses, and status',
    permissions: [
      { key: PERMISSIONS.USERS_VIEW, label: 'View Customers' },
      { key: PERMISSIONS.USERS_EDIT, label: 'Edit Customer Details' },
      { key: PERMISSIONS.USERS_DELETE, label: 'Delete Customers' },
    ],
  },
  {
    id: 'delivery',
    name: 'Delivery Partners',
    description: 'Rider onboardings, cash collection, and status',
    permissions: [
      { key: PERMISSIONS.DELIVERY_VIEW, label: 'View Delivery Partners' },
      { key: PERMISSIONS.DELIVERY_APPROVE, label: 'Approve Applications' },
      { key: PERMISSIONS.DELIVERY_EDIT, label: 'Edit Partners & Settle Cash' },
    ],
  },
  {
    id: 'support',
    name: 'Support Desk',
    description: 'Customer, vendor, and delivery support conversations',
    permissions: [
      { key: PERMISSIONS.SUPPORT_VIEW, label: 'View Support Tickets' },
      { key: PERMISSIONS.SUPPORT_REPLY, label: 'Reply to Conversations' },
      { key: PERMISSIONS.SUPPORT_UPDATE_STATUS, label: 'Update Ticket Status & Types' },
    ],
  },
  {
    id: 'finance',
    name: 'Wallet & Finance',
    description: 'Revenue, settlements, refunds, and financial summary',
    permissions: [
      { key: PERMISSIONS.WALLET_VIEW, label: 'View Financial Summaries' },
      { key: PERMISSIONS.WALLET_EDIT, label: 'Edit Wallet Balances' },
      { key: PERMISSIONS.SETTLEMENTS_VIEW, label: 'View Settlements' },
      { key: PERMISSIONS.REFUNDS_VIEW, label: 'View Refunds' },
    ],
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    description: 'Sales and inventory analytical reports',
    permissions: [
      { key: PERMISSIONS.REPORTS_VIEW, label: 'View Reports' },
      { key: PERMISSIONS.REPORTS_EXPORT, label: 'Export Data (CSV/PDF)' },
    ],
  },
  {
    id: 'marketing',
    name: 'Offers & Marketing',
    description: 'Sliders, banners, campaigns, and promo codes',
    permissions: [
      { key: PERMISSIONS.OFFERS_VIEW, label: 'View Offers & Sliders' },
      { key: PERMISSIONS.OFFERS_EDIT, label: 'Edit Offers & Sliders' },
      { key: PERMISSIONS.BANNERS_VIEW, label: 'View Banners' },
      { key: PERMISSIONS.BANNERS_EDIT, label: 'Edit Banners' },
      { key: PERMISSIONS.PROMOCODES_VIEW, label: 'View Promo Codes' },
      { key: PERMISSIONS.PROMOCODES_EDIT, label: 'Edit Promo Codes' },
    ],
  },
  {
    id: 'wholesale',
    name: 'Wholesale Marketplace',
    description: 'Wholesale vendors, bulk pricing products, and wholesale analytics',
    permissions: [
      { key: PERMISSIONS.WHOLESALE_VENDORS_MANAGE, label: 'Manage Wholesale Vendors' },
      { key: PERMISSIONS.WHOLESALE_PRODUCTS_MANAGE, label: 'Manage Bulk Pricing Products' },
      { key: PERMISSIONS.WHOLESALE_ANALYTICS_VIEW, label: 'View Wholesale Analytics' },
    ],
  },
  {
    id: 'quickcommerce',
    name: 'Quick Commerce',
    description: 'Quick Commerce vendors, orders, analytics, and configuration',
    permissions: [
      { key: PERMISSIONS.QUICKCOMMERCE_VENDORS_MANAGE, label: 'Manage Quick Commerce Vendors' },
      { key: PERMISSIONS.QUICKCOMMERCE_ORDERS_MANAGE, label: 'Manage Quick Commerce Orders' },
      { key: PERMISSIONS.QUICKCOMMERCE_ANALYTICS_VIEW, label: 'View Quick Commerce Analytics' },
      { key: PERMISSIONS.QUICKCOMMERCE_SETTINGS_MANAGE, label: 'Manage Quick Commerce Settings' },
    ],
  },
  {
    id: 'settings',
    name: 'Settings & Content',
    description: 'General configuration, terms, and static pages',
    permissions: [
      { key: PERMISSIONS.SETTINGS_VIEW, label: 'View Settings & Content' },
      { key: PERMISSIONS.SETTINGS_EDIT, label: 'Edit Settings & Content' },
    ],
  },
];
