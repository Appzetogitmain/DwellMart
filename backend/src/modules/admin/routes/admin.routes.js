import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as vendorController from '../controllers/vendor.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as catalogController from '../controllers/catalog.controller.js';
import * as customerController from '../controllers/customer.controller.js';
import * as deliveryController from '../controllers/delivery.controller.js';
import * as returnController from '../controllers/return.controller.js';
import * as supportController from '../controllers/support.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import * as analyticsController from '../controllers/analytics.controller.js';
import * as reportController from '../controllers/report.controller.js';
import * as marketingController from '../controllers/marketing.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as uploadController from '../controllers/upload.controller.js';
import * as documentController from '../../vendor/controllers/document.controller.js';
import * as subscriptionPlanController from '../controllers/subscriptionPlan.controller.js';
import * as termsController from '../controllers/termsAndConditions.controller.js';
import * as staticPagesController from '../controllers/staticPages.controller.js';
import * as settingsController from '../controllers/settings.controller.js';
import * as subadminController from '../controllers/subadmin.controller.js';
import * as settlementController from '../controllers/settlement.controller.js';
import * as feedbackController from '../controllers/feedback.controller.js';
import {
    downloadExcelTemplate,
    downloadCsvTemplate,
    uploadMiddleware,
    validateUpload,
    processUpload,
    checkJobStatus,
    cancelJobHandler,
    getImportHistory,
    exportProducts,
} from '../../../controllers/bulkUpload.controller.js';

import { authenticate } from '../../../middlewares/authenticate.js';
import { enforceAccountStatus } from '../../../middlewares/authorize.js';
import { requireAdmin, requireSuperAdmin, checkPermission, checkAnyPermission } from '../../../middlewares/permission.middleware.js';
import { authLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import { uploadSingle } from '../../../middlewares/upload.js';
import { refreshTokenSchema, logoutSchema } from '../validators/auth.validator.js';
import { PERMISSIONS } from '../../../constants/permissions.js';
import {
    createSubAdminSchema,
    updateSubAdminSchema,
    updateStatusSchema,
    resetPasswordSchema,
} from '../validators/subadmin.validator.js';
import {
    createProductSchema,
    updateProductSchema,
    taxPricingRulesSchema,
    categoryIdParamSchema,
    createCategorySchema,
    updateCategorySchema,
    reorderCategoriesSchema,
    brandIdParamSchema,
    createBrandSchema,
    updateBrandSchema,
} from '../validators/catalog.validator.js';
import {
    customerListQuerySchema,
    customerIdParamSchema,
    customerUpdateSchema,
    customerStatusUpdateSchema,
    customerAddressParamsSchema,
    customerOrdersQuerySchema,
    customerTransactionsQuerySchema,
    customerAddressesQuerySchema,
} from '../validators/customer.validator.js';
import {
    deliveryListQuerySchema,
    deliveryBoyIdParamSchema,
    createDeliveryBoySchema,
    updateDeliveryBoySchema,
    updateDeliveryStatusSchema,
    updateDeliveryApplicationStatusSchema,
    settleCashSchema,
    updateDeliveryBoyExperiencesSchema,
    bulkUpdateDeliveryBoyExperiencesSchema,
} from '../validators/delivery.validator.js';
import {
    vendorListQuerySchema,
    vendorIdParamSchema,
    vendorStatusUpdateSchema,
    vendorCommissionUpdateSchema,
    vendorQuickCommerceUpdateSchema,
    vendorCommissionsQuerySchema,
} from '../validators/vendor.validator.js';
import {
    marketingIdParamSchema,
    campaignListQuerySchema,
} from '../validators/marketing.validator.js';

const router = Router();
const adminAuth = [authenticate, requireAdmin, enforceAccountStatus];

// Helper to bundle adminAuth with permission check
const perm = (permissionToken) => [...adminAuth, checkPermission(permissionToken)];
const permAny = (...tokens) => [...adminAuth, checkAnyPermission(...tokens)];

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login', authLimiter, authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...adminAuth, authController.getProfile);

// ─── Sub Admin Management (Super Admin Only) ──────────────────────────────────
router.get('/subadmins', ...adminAuth, requireSuperAdmin, subadminController.getAllSubAdmins);
router.get('/subadmins/logs', ...adminAuth, requireSuperAdmin, subadminController.getActivityLogs);
router.get('/subadmins/:id', ...adminAuth, requireSuperAdmin, subadminController.getSubAdminById);
router.post('/subadmins', ...adminAuth, requireSuperAdmin, validate(createSubAdminSchema), subadminController.createSubAdmin);
router.put('/subadmins/:id', ...adminAuth, requireSuperAdmin, validate(updateSubAdminSchema), subadminController.updateSubAdmin);
router.patch('/subadmins/:id/status', ...adminAuth, requireSuperAdmin, validate(updateStatusSchema), subadminController.toggleSubAdminStatus);
router.post('/subadmins/:id/reset-password', ...adminAuth, requireSuperAdmin, validate(resetPasswordSchema), subadminController.resetSubAdminPassword);
router.delete('/subadmins/:id', ...adminAuth, requireSuperAdmin, subadminController.deleteSubAdmin);

// ─── Analytics & Dashboard ───────────────────────────────────────────────────
router.get('/analytics/dashboard', ...perm(PERMISSIONS.DASHBOARD_VIEW), analyticsController.getDashboardStats);
router.get('/analytics/revenue', ...perm(PERMISSIONS.DASHBOARD_VIEW), analyticsController.getRevenueData);
router.get('/analytics/order-status', ...perm(PERMISSIONS.DASHBOARD_VIEW), analyticsController.getOrderStatusBreakdown);
router.get('/analytics/top-products', ...perm(PERMISSIONS.DASHBOARD_VIEW), analyticsController.getTopProducts);
router.get('/analytics/customer-growth', ...perm(PERMISSIONS.DASHBOARD_VIEW), analyticsController.getCustomerGrowth);
router.get('/analytics/recent-orders', ...perm(PERMISSIONS.DASHBOARD_VIEW), analyticsController.getRecentOrders);
router.get('/analytics/sales', ...perm(PERMISSIONS.DASHBOARD_VIEW), analyticsController.getSalesData);
router.get('/analytics/finance-summary', ...permAny(PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.WALLET_VIEW), analyticsController.getFinancialSummary);
router.get('/analytics/inventory-stats', ...permAny(PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.PRODUCTS_VIEW), analyticsController.getInventoryStats);
router.get('/analytics/wholesale', ...permAny(PERMISSIONS.WHOLESALE_ANALYTICS_VIEW, PERMISSIONS.DASHBOARD_VIEW), analyticsController.getWholesaleStats);
router.get('/analytics/quick-commerce', ...permAny(PERMISSIONS.QUICKCOMMERCE_ANALYTICS_VIEW, PERMISSIONS.DASHBOARD_VIEW), analyticsController.getQuickCommerceStats);
router.get('/analytics/global-experience', ...perm(PERMISSIONS.DASHBOARD_VIEW), analyticsController.getGlobalExperienceAnalytics);
router.get('/analytics/export', ...perm(PERMISSIONS.DASHBOARD_VIEW), analyticsController.exportAnalyticsData);

// ─── Orders ───────────────────────────────────────────────────────────────────
router.get('/orders', ...perm(PERMISSIONS.ORDERS_VIEW), orderController.getAllOrders);
// Registered before '/orders/:id' — otherwise the param route swallows the path.
router.get('/orders/quick-commerce/unassigned', ...perm(PERMISSIONS.ORDERS_VIEW), orderController.getUnassignedQuickCommerceOrders);
router.get('/orders/:id', ...perm(PERMISSIONS.ORDERS_VIEW), orderController.getOrderById);
router.patch('/orders/:id/status', ...perm(PERMISSIONS.ORDERS_UPDATE), orderController.updateOrderStatus);
router.patch('/orders/:id/assign-delivery', ...perm(PERMISSIONS.ORDERS_UPDATE), orderController.assignDeliveryBoy);
router.post('/orders/:id/retry-assignment', ...perm(PERMISSIONS.ORDERS_UPDATE), orderController.retryQuickCommerceAssignment);
router.post('/orders/:id/delivery-override', ...perm(PERMISSIONS.ORDERS_UPDATE), orderController.deliveryOverride);
router.delete('/orders/:id', ...perm(PERMISSIONS.ORDERS_CANCEL), orderController.deleteOrder);

// ─── Products ─────────────────────────────────────────────────────────────────
router.get('/products', ...perm(PERMISSIONS.PRODUCTS_VIEW), catalogController.getAllProducts);
router.get('/products/template/excel', ...perm(PERMISSIONS.PRODUCTS_VIEW), downloadExcelTemplate);
router.get('/products/template/csv', ...perm(PERMISSIONS.PRODUCTS_VIEW), downloadCsvTemplate);
router.post('/products/bulk-upload/validate', ...perm(PERMISSIONS.PRODUCTS_ADD), uploadMiddleware, validateUpload);
router.post('/products/bulk-upload/process', ...perm(PERMISSIONS.PRODUCTS_ADD), processUpload);
router.get('/products/bulk-upload/job/:jobId', ...perm(PERMISSIONS.PRODUCTS_VIEW), checkJobStatus);
router.post('/products/bulk-upload/job/:jobId/cancel', ...perm(PERMISSIONS.PRODUCTS_ADD), cancelJobHandler);
router.get('/products/bulk-upload/history', ...perm(PERMISSIONS.PRODUCTS_VIEW), getImportHistory);
router.get('/products/export', ...perm(PERMISSIONS.PRODUCTS_VIEW), exportProducts);
router.get('/products/tax-pricing-rules', ...perm(PERMISSIONS.PRODUCTS_VIEW), catalogController.getTaxPricingRules);
router.get('/products/:id', ...perm(PERMISSIONS.PRODUCTS_VIEW), catalogController.getProductById);
router.post('/products', ...perm(PERMISSIONS.PRODUCTS_ADD), validate(createProductSchema), catalogController.createProduct);
router.put('/products/tax-pricing-rules', ...perm(PERMISSIONS.PRODUCTS_EDIT), validate(taxPricingRulesSchema), catalogController.updateTaxPricingRules);
router.put('/products/:id', ...perm(PERMISSIONS.PRODUCTS_EDIT), validate(updateProductSchema), catalogController.updateProduct);
router.delete('/products/:id', ...perm(PERMISSIONS.PRODUCTS_DELETE), catalogController.deleteProduct);

// ─── Categories ───────────────────────────────────────────────────────────────
router.get('/categories', ...perm(PERMISSIONS.CATEGORIES_VIEW), catalogController.getAllCategories);
router.post('/categories', ...perm(PERMISSIONS.CATEGORIES_ADD), validate(createCategorySchema), catalogController.createCategory);
router.post('/categories/seed', ...perm(PERMISSIONS.CATEGORIES_ADD), catalogController.seedMarketplaceCategories);
router.patch('/categories/reorder', ...perm(PERMISSIONS.CATEGORIES_EDIT), validate(reorderCategoriesSchema), catalogController.reorderCategories);
router.put('/categories/:id', ...perm(PERMISSIONS.CATEGORIES_EDIT), validate(categoryIdParamSchema, 'params'), validate(updateCategorySchema), catalogController.updateCategory);
router.delete('/categories/:id', ...perm(PERMISSIONS.CATEGORIES_DELETE), validate(categoryIdParamSchema, 'params'), catalogController.deleteCategory);

// ─── Brands ───────────────────────────────────────────────────────────────────
router.get('/brands', ...perm(PERMISSIONS.CATEGORIES_VIEW), catalogController.getAllBrands);
router.post('/brands', ...perm(PERMISSIONS.CATEGORIES_ADD), validate(createBrandSchema), catalogController.createBrand);
router.put('/brands/:id', ...perm(PERMISSIONS.CATEGORIES_EDIT), validate(brandIdParamSchema, 'params'), validate(updateBrandSchema), catalogController.updateBrand);
router.delete('/brands/:id', ...perm(PERMISSIONS.CATEGORIES_DELETE), validate(brandIdParamSchema, 'params'), catalogController.deleteBrand);

// ─── Vendors ──────────────────────────────────────────────────────────────────
router.get('/vendors', ...perm(PERMISSIONS.VENDORS_VIEW), validate(vendorListQuerySchema, 'query'), vendorController.getAllVendors);
router.get('/vendors/pending', ...perm(PERMISSIONS.VENDORS_VIEW), (req, res, next) => { req.query.status = 'pending'; next(); }, validate(vendorListQuerySchema, 'query'), vendorController.getAllVendors);
router.get('/vendors/:id', ...perm(PERMISSIONS.VENDORS_VIEW), validate(vendorIdParamSchema, 'params'), vendorController.getVendorDetail);
router.get('/vendors/:id/documents', ...perm(PERMISSIONS.VENDORS_VIEW), validate(vendorIdParamSchema, 'params'), vendorController.getVendorDocuments);
router.patch('/vendors/documents/:id/status', ...perm(PERMISSIONS.VENDORS_APPROVE), documentController.adminUpdateDocumentStatus);
router.get('/vendors/:id/commissions', ...perm(PERMISSIONS.VENDORS_VIEW), validate(vendorIdParamSchema, 'params'), validate(vendorCommissionsQuerySchema, 'query'), vendorController.getVendorCommissions);
router.patch('/vendors/:id/status', ...perm(PERMISSIONS.VENDORS_APPROVE), validate(vendorIdParamSchema, 'params'), validate(vendorStatusUpdateSchema), vendorController.updateVendorStatus);
router.patch('/vendors/:id/commission', ...perm(PERMISSIONS.VENDORS_EDIT), validate(vendorIdParamSchema, 'params'), validate(vendorCommissionUpdateSchema), vendorController.updateCommissionRate);
router.patch('/vendors/:id/quick-commerce', ...permAny(PERMISSIONS.QUICKCOMMERCE_VENDORS_MANAGE, PERMISSIONS.VENDORS_APPROVE), validate(vendorIdParamSchema, 'params'), validate(vendorQuickCommerceUpdateSchema), vendorController.updateVendorQuickCommerce);

// ─── Customers ────────────────────────────────────────────────────────────────
router.get('/customers', ...perm(PERMISSIONS.USERS_VIEW), validate(customerListQuerySchema, 'query'), customerController.getAllCustomers);
router.get('/customers/addresses', ...perm(PERMISSIONS.USERS_VIEW), validate(customerAddressesQuerySchema, 'query'), customerController.getCustomerAddresses);
router.get('/customers/transactions', ...perm(PERMISSIONS.USERS_VIEW), validate(customerTransactionsQuerySchema, 'query'), customerController.getCustomerTransactions);
router.get('/customers/:id/orders', ...perm(PERMISSIONS.USERS_VIEW), validate(customerIdParamSchema, 'params'), validate(customerOrdersQuerySchema, 'query'), customerController.getCustomerOrders);
router.get('/customers/:id', ...perm(PERMISSIONS.USERS_VIEW), validate(customerIdParamSchema, 'params'), customerController.getCustomerById);
router.put('/customers/:id', ...perm(PERMISSIONS.USERS_EDIT), validate(customerIdParamSchema, 'params'), validate(customerUpdateSchema), customerController.updateCustomerDetail);
router.patch('/customers/:id/status', ...perm(PERMISSIONS.USERS_EDIT), validate(customerIdParamSchema, 'params'), validate(customerStatusUpdateSchema), customerController.updateCustomerStatus);
router.delete('/customers/:customerId/addresses/:addressId', ...perm(PERMISSIONS.USERS_DELETE), validate(customerAddressParamsSchema, 'params'), customerController.deleteCustomerAddress);

// ─── Delivery ─────────────────────────────────────────────────────────────────
router.get('/delivery-boys', ...perm(PERMISSIONS.DELIVERY_VIEW), validate(deliveryListQuerySchema, 'query'), deliveryController.getAllDeliveryBoys);
router.post('/delivery-boys', ...perm(PERMISSIONS.DELIVERY_EDIT), validate(createDeliveryBoySchema), deliveryController.createDeliveryBoy);
router.get('/delivery-boys/:id', ...perm(PERMISSIONS.DELIVERY_VIEW), validate(deliveryBoyIdParamSchema, 'params'), deliveryController.getDeliveryBoyById);
router.put('/delivery-boys/:id', ...perm(PERMISSIONS.DELIVERY_EDIT), validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryBoySchema), deliveryController.updateDeliveryBoy);
router.delete('/delivery-boys/:id', ...perm(PERMISSIONS.DELIVERY_EDIT), validate(deliveryBoyIdParamSchema, 'params'), deliveryController.deleteDeliveryBoy);
router.patch('/delivery-boys/:id/status', ...perm(PERMISSIONS.DELIVERY_EDIT), validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryStatusSchema), deliveryController.updateDeliveryBoyStatus);
router.patch('/delivery-boys/:id/application-status', ...perm(PERMISSIONS.DELIVERY_APPROVE), validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryApplicationStatusSchema), deliveryController.updateDeliveryBoyApplicationStatus);
router.post('/delivery-boys/:id/settle-cash', ...perm(PERMISSIONS.DELIVERY_EDIT), validate(deliveryBoyIdParamSchema, 'params'), validate(settleCashSchema), deliveryController.settleCash);
router.put('/delivery-boys/bulk-experiences', ...perm(PERMISSIONS.DELIVERY_EDIT), validate(bulkUpdateDeliveryBoyExperiencesSchema), deliveryController.bulkUpdateDeliveryBoyExperiences);
router.put('/delivery-boys/:id/experiences', ...perm(PERMISSIONS.DELIVERY_EDIT), validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryBoyExperiencesSchema), deliveryController.updateDeliveryBoyExperiences);

// ─── Return Requests ──────────────────────────────────────────────────────────
router.get('/return-requests', ...perm(PERMISSIONS.ORDERS_VIEW), returnController.getAllReturnRequests);
router.get('/return-requests/:id', ...perm(PERMISSIONS.ORDERS_VIEW), returnController.getReturnRequestById);
router.patch('/return-requests/:id/status', ...perm(PERMISSIONS.ORDERS_UPDATE), returnController.updateReturnRequestStatus);

// ─── Support Tickets ──────────────────────────────────────────────────────────
router.get('/support/tickets', ...perm(PERMISSIONS.SUPPORT_VIEW), supportController.getAllTickets);
router.get('/support/tickets/:id', ...perm(PERMISSIONS.SUPPORT_VIEW), supportController.getTicketById);
router.patch('/support/tickets/:id/status', ...perm(PERMISSIONS.SUPPORT_UPDATE_STATUS), supportController.updateTicketStatus);
router.post('/support/tickets/:id/messages', ...perm(PERMISSIONS.SUPPORT_REPLY), supportController.addTicketMessage);
router.get('/support/ticket-types', ...perm(PERMISSIONS.SUPPORT_VIEW), supportController.getAllTicketTypes);
router.post('/support/ticket-types', ...perm(PERMISSIONS.SUPPORT_UPDATE_STATUS), supportController.createTicketType);
router.put('/support/ticket-types/:id', ...perm(PERMISSIONS.SUPPORT_UPDATE_STATUS), supportController.updateTicketType);
router.delete('/support/ticket-types/:id', ...perm(PERMISSIONS.SUPPORT_UPDATE_STATUS), supportController.deleteTicketType);

// ─── Feedback ───────────────────────────────────────────────────────────────
router.get('/feedbacks', ...perm(PERMISSIONS.SUPPORT_VIEW), feedbackController.getAllFeedbacks);
router.patch('/feedbacks/:id/status', ...perm(PERMISSIONS.SUPPORT_UPDATE_STATUS), feedbackController.updateFeedbackStatus);

// ─── Product Reviews ──────────────────────────────────────────────────────────
router.get('/reviews', ...perm(PERMISSIONS.PRODUCTS_VIEW), reviewController.getAllReviews);
router.patch('/reviews/:id/status', ...perm(PERMISSIONS.PRODUCTS_EDIT), reviewController.updateReviewStatus);
router.delete('/reviews/:id', ...perm(PERMISSIONS.PRODUCTS_DELETE), reviewController.deleteReview);
router.post('/uploads/image', ...adminAuth, uploadSingle('image'), uploadController.uploadImage);

// ─── Marketing & Promotions ──────────────────────────────────────────────────
router.get('/marketing/coupons', ...perm(PERMISSIONS.PROMOCODES_VIEW), marketingController.getAllCoupons);
router.post('/marketing/coupons', ...perm(PERMISSIONS.PROMOCODES_EDIT), marketingController.createCoupon);
router.put('/marketing/coupons/:id', ...perm(PERMISSIONS.PROMOCODES_EDIT), validate(marketingIdParamSchema, 'params'), marketingController.updateCoupon);
router.delete('/marketing/coupons/:id', ...perm(PERMISSIONS.PROMOCODES_EDIT), validate(marketingIdParamSchema, 'params'), marketingController.deleteCoupon);

router.get('/marketing/banners', ...perm(PERMISSIONS.BANNERS_VIEW), marketingController.getAllBanners);
router.post('/marketing/banners', ...perm(PERMISSIONS.BANNERS_EDIT), marketingController.createBanner);
router.patch('/marketing/banners/reorder', ...perm(PERMISSIONS.BANNERS_EDIT), marketingController.reorderBanners);
router.put('/marketing/banners/:id', ...perm(PERMISSIONS.BANNERS_EDIT), validate(marketingIdParamSchema, 'params'), marketingController.updateBanner);
router.delete('/marketing/banners/:id', ...perm(PERMISSIONS.BANNERS_EDIT), validate(marketingIdParamSchema, 'params'), marketingController.deleteBanner);

router.get('/marketing/testimonials', ...perm(PERMISSIONS.OFFERS_VIEW), marketingController.getAllTestimonials);
router.post('/marketing/testimonials', ...perm(PERMISSIONS.OFFERS_EDIT), marketingController.createTestimonial);
router.put('/marketing/testimonials/:id', ...perm(PERMISSIONS.OFFERS_EDIT), validate(marketingIdParamSchema, 'params'), marketingController.updateTestimonial);
router.delete('/marketing/testimonials/:id', ...perm(PERMISSIONS.OFFERS_EDIT), validate(marketingIdParamSchema, 'params'), marketingController.deleteTestimonial);

router.get('/marketing/campaigns', ...perm(PERMISSIONS.OFFERS_VIEW), validate(campaignListQuerySchema, 'query'), marketingController.getAllCampaigns);
router.post('/marketing/campaigns', ...perm(PERMISSIONS.OFFERS_EDIT), marketingController.createCampaign);
router.put('/marketing/campaigns/:id', ...perm(PERMISSIONS.OFFERS_EDIT), validate(marketingIdParamSchema, 'params'), marketingController.updateCampaign);
router.delete('/marketing/campaigns/:id', ...perm(PERMISSIONS.OFFERS_EDIT), validate(marketingIdParamSchema, 'params'), marketingController.deleteCampaign);

// ─── Reports ──────────────────────────────────────────────────────────────────
router.get('/reports/sales', ...perm(PERMISSIONS.REPORTS_VIEW), reportController.getSalesReport);
router.get('/reports/inventory', ...perm(PERMISSIONS.REPORTS_VIEW), reportController.getInventoryReport);

// ─── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications', ...perm(PERMISSIONS.DASHBOARD_VIEW), notificationController.getAdminNotifications);
router.put('/notifications/:id/read', ...perm(PERMISSIONS.DASHBOARD_VIEW), notificationController.markAsRead);
router.put('/notifications/read-all', ...perm(PERMISSIONS.DASHBOARD_VIEW), notificationController.markAllAsRead);

// ─── Subscription Plans & Vendor Subscriptions ───────────────────────────────
router.get('/subscription-plans', ...perm(PERMISSIONS.VENDORS_VIEW), subscriptionPlanController.getAllPlans);
router.get('/subscription-plans/:id', ...perm(PERMISSIONS.VENDORS_VIEW), subscriptionPlanController.getPlanById);
router.post('/subscription-plans', ...perm(PERMISSIONS.VENDORS_EDIT), subscriptionPlanController.createPlan);
router.put('/subscription-plans/:id', ...perm(PERMISSIONS.VENDORS_EDIT), subscriptionPlanController.updatePlan);
router.delete('/subscription-plans/:id', ...perm(PERMISSIONS.VENDORS_EDIT), subscriptionPlanController.deletePlan);
router.get('/vendor-subscriptions', ...perm(PERMISSIONS.VENDORS_VIEW), subscriptionPlanController.getVendorSubscriptions);

// ─── Settings & Policies ──────────────────────────────────────────────────────
router.get('/settings/vendor-terms', ...perm(PERMISSIONS.SETTINGS_VIEW), termsController.getVendorTerms);
router.put('/settings/vendor-terms', ...perm(PERMISSIONS.SETTINGS_EDIT), termsController.updateVendorTerms);
router.get('/pages/:slug', ...perm(PERMISSIONS.SETTINGS_VIEW), staticPagesController.getPage);
router.put('/pages/:slug', ...perm(PERMISSIONS.SETTINGS_EDIT), staticPagesController.updatePage);
router.get('/settings/general', ...perm(PERMISSIONS.SETTINGS_VIEW), settingsController.getGeneralSettings);
router.put('/settings/general', ...perm(PERMISSIONS.SETTINGS_EDIT), settingsController.updateGeneralSettings);

// ─── Dynamic Category Settings ───────────────────────────────────────────────
// Permission-gated, matching '/settings/general' above. These were bound to
// adminAuth alone, which let any authenticated subadmin read and rewrite every
// settings category — including feature flags and payment configuration.
router.get('/settings/:category', ...perm(PERMISSIONS.SETTINGS_VIEW), settingsController.getSettingsByCategory);
router.put('/settings/:category', ...perm(PERMISSIONS.SETTINGS_EDIT), settingsController.updateSettingsByCategory);

// ─── Settlements ──────────────────────────────────────────────────────────────
router.get('/settlements', ...perm(PERMISSIONS.WALLET_VIEW), settlementController.getSettlements);
router.put('/settlements/:id/approve', ...perm(PERMISSIONS.WALLET_VIEW), settlementController.approveSettlement);

export default router;
