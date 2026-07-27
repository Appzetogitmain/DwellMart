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
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import { uploadSingle } from '../../../middlewares/upload.js';
import { refreshTokenSchema, logoutSchema } from '../validators/auth.validator.js';
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
} from '../validators/delivery.validator.js';
import {
    vendorListQuerySchema,
    vendorIdParamSchema,
    vendorStatusUpdateSchema,
    vendorCommissionUpdateSchema,
    vendorCommissionsQuerySchema,
} from '../validators/vendor.validator.js';
import {
    marketingIdParamSchema,
    campaignListQuerySchema,
} from '../validators/marketing.validator.js';

const router = Router();
const adminAuth = [authenticate, authorize('admin', 'superadmin'), enforceAccountStatus];

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login', authLimiter, authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...adminAuth, authController.getProfile);

// ─── Analytics ────────────────────────────────────────────────────────────────
router.get('/analytics/dashboard', ...adminAuth, analyticsController.getDashboardStats);
router.get('/analytics/revenue', ...adminAuth, analyticsController.getRevenueData);
router.get('/analytics/order-status', ...adminAuth, analyticsController.getOrderStatusBreakdown);
router.get('/analytics/top-products', ...adminAuth, analyticsController.getTopProducts);
router.get('/analytics/customer-growth', ...adminAuth, analyticsController.getCustomerGrowth);
router.get('/analytics/recent-orders', ...adminAuth, analyticsController.getRecentOrders);
router.get('/analytics/sales', ...adminAuth, analyticsController.getSalesData);
router.get('/analytics/finance-summary', ...adminAuth, analyticsController.getFinancialSummary);
router.get('/analytics/inventory-stats', ...adminAuth, analyticsController.getInventoryStats);

// ─── Orders ───────────────────────────────────────────────────────────────────
router.get('/orders', ...adminAuth, orderController.getAllOrders);
router.get('/orders/:id', ...adminAuth, orderController.getOrderById);
router.patch('/orders/:id/status', ...adminAuth, orderController.updateOrderStatus);
router.patch('/orders/:id/assign-delivery', ...adminAuth, orderController.assignDeliveryBoy);
router.delete('/orders/:id', ...adminAuth, orderController.deleteOrder);

// ─── Products ─────────────────────────────────────────────────────────────────
router.get('/products', ...adminAuth, catalogController.getAllProducts);
router.get('/products/tax-pricing-rules', ...adminAuth, catalogController.getTaxPricingRules);
router.get('/products/:id', ...adminAuth, catalogController.getProductById);
router.post('/products', ...adminAuth, validate(createProductSchema), catalogController.createProduct);
router.put('/products/tax-pricing-rules', ...adminAuth, validate(taxPricingRulesSchema), catalogController.updateTaxPricingRules);

router.put('/products/:id', ...adminAuth, validate(updateProductSchema), catalogController.updateProduct);
router.delete('/products/:id', ...adminAuth, catalogController.deleteProduct);

// ─── Categories ───────────────────────────────────────────────────────────────
router.get('/categories', ...adminAuth, catalogController.getAllCategories);
router.post('/categories', ...adminAuth, validate(createCategorySchema), catalogController.createCategory);
router.post('/categories/seed', ...adminAuth, catalogController.seedMarketplaceCategories);
router.patch('/categories/reorder', ...adminAuth, validate(reorderCategoriesSchema), catalogController.reorderCategories);
router.put('/categories/:id', ...adminAuth, validate(categoryIdParamSchema, 'params'), validate(updateCategorySchema), catalogController.updateCategory);
router.delete('/categories/:id', ...adminAuth, validate(categoryIdParamSchema, 'params'), catalogController.deleteCategory);

// ─── Brands ───────────────────────────────────────────────────────────────────
router.get('/brands', ...adminAuth, catalogController.getAllBrands);
router.post('/brands', ...adminAuth, validate(createBrandSchema), catalogController.createBrand);
router.put('/brands/:id', ...adminAuth, validate(brandIdParamSchema, 'params'), validate(updateBrandSchema), catalogController.updateBrand);
router.delete('/brands/:id', ...adminAuth, validate(brandIdParamSchema, 'params'), catalogController.deleteBrand);

// ─── Vendors ──────────────────────────────────────────────────────────────────
router.get('/vendors', ...adminAuth, validate(vendorListQuerySchema, 'query'), vendorController.getAllVendors);
router.get('/vendors/pending', ...adminAuth, (req, res, next) => { req.query.status = 'pending'; next(); }, validate(vendorListQuerySchema, 'query'), vendorController.getAllVendors);
router.get('/vendors/:id', ...adminAuth, validate(vendorIdParamSchema, 'params'), vendorController.getVendorDetail);
router.get('/vendors/:id/documents', ...adminAuth, validate(vendorIdParamSchema, 'params'), vendorController.getVendorDocuments);
router.patch('/vendors/documents/:id/status', ...adminAuth, documentController.adminUpdateDocumentStatus);
router.get('/vendors/:id/commissions', ...adminAuth, validate(vendorIdParamSchema, 'params'), validate(vendorCommissionsQuerySchema, 'query'), vendorController.getVendorCommissions);
router.patch('/vendors/:id/status', ...adminAuth, validate(vendorIdParamSchema, 'params'), validate(vendorStatusUpdateSchema), vendorController.updateVendorStatus);
router.patch('/vendors/:id/commission', ...adminAuth, validate(vendorIdParamSchema, 'params'), validate(vendorCommissionUpdateSchema), vendorController.updateCommissionRate);

// ─── Customers ────────────────────────────────────────────────────────────────
router.get('/customers', ...adminAuth, validate(customerListQuerySchema, 'query'), customerController.getAllCustomers);
router.get('/customers/addresses', ...adminAuth, validate(customerAddressesQuerySchema, 'query'), customerController.getCustomerAddresses);
router.get('/customers/transactions', ...adminAuth, validate(customerTransactionsQuerySchema, 'query'), customerController.getCustomerTransactions);
router.get('/customers/:id/orders', ...adminAuth, validate(customerIdParamSchema, 'params'), validate(customerOrdersQuerySchema, 'query'), customerController.getCustomerOrders);
router.get('/customers/:id', ...adminAuth, validate(customerIdParamSchema, 'params'), customerController.getCustomerById);
router.put('/customers/:id', ...adminAuth, validate(customerIdParamSchema, 'params'), validate(customerUpdateSchema), customerController.updateCustomerDetail);
router.patch('/customers/:id/status', ...adminAuth, validate(customerIdParamSchema, 'params'), validate(customerStatusUpdateSchema), customerController.updateCustomerStatus);
router.delete('/customers/:customerId/addresses/:addressId', ...adminAuth, validate(customerAddressParamsSchema, 'params'), customerController.deleteCustomerAddress);

// ─── Delivery ─────────────────────────────────────────────────────────────────
router.get('/delivery-boys', ...adminAuth, validate(deliveryListQuerySchema, 'query'), deliveryController.getAllDeliveryBoys);
router.post('/delivery-boys', ...adminAuth, validate(createDeliveryBoySchema), deliveryController.createDeliveryBoy);
router.get('/delivery-boys/:id', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), deliveryController.getDeliveryBoyById);
router.put('/delivery-boys/:id', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryBoySchema), deliveryController.updateDeliveryBoy);
router.delete('/delivery-boys/:id', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), deliveryController.deleteDeliveryBoy);
router.patch('/delivery-boys/:id/status', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryStatusSchema), deliveryController.updateDeliveryBoyStatus);
router.patch('/delivery-boys/:id/application-status', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryApplicationStatusSchema), deliveryController.updateDeliveryBoyApplicationStatus);
router.post('/delivery-boys/:id/settle-cash', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), validate(settleCashSchema), deliveryController.settleCash);

// ─── Return Requests ──────────────────────────────────────────────────────────
router.get('/return-requests', ...adminAuth, returnController.getAllReturnRequests);
router.get('/return-requests/:id', ...adminAuth, returnController.getReturnRequestById);
router.patch('/return-requests/:id/status', ...adminAuth, returnController.updateReturnRequestStatus);

// ─── Support Tickets ──────────────────────────────────────────────────────────
router.get('/support/tickets', ...adminAuth, supportController.getAllTickets);
router.get('/support/tickets/:id', ...adminAuth, supportController.getTicketById);
router.patch('/support/tickets/:id/status', ...adminAuth, supportController.updateTicketStatus);
router.post('/support/tickets/:id/messages', ...adminAuth, supportController.addTicketMessage);
router.get('/support/ticket-types', ...adminAuth, supportController.getAllTicketTypes);
router.post('/support/ticket-types', ...adminAuth, supportController.createTicketType);
router.put('/support/ticket-types/:id', ...adminAuth, supportController.updateTicketType);
router.delete('/support/ticket-types/:id', ...adminAuth, supportController.deleteTicketType);

// ─── Product Reviews ──────────────────────────────────────────────────────────
router.get('/reviews', ...adminAuth, reviewController.getAllReviews);
router.patch('/reviews/:id/status', ...adminAuth, reviewController.updateReviewStatus);
router.delete('/reviews/:id', ...adminAuth, reviewController.deleteReview);
router.post('/uploads/image', ...adminAuth, uploadSingle('image'), uploadController.uploadImage);

// ─── Marketing & Promotions ──────────────────────────────────────────────────
// Coupons
router.get('/marketing/coupons', ...adminAuth, marketingController.getAllCoupons);
router.post('/marketing/coupons', ...adminAuth, marketingController.createCoupon);
router.put('/marketing/coupons/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.updateCoupon);
router.delete('/marketing/coupons/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.deleteCoupon);

// Banners
router.get('/marketing/banners', ...adminAuth, marketingController.getAllBanners);
router.post('/marketing/banners', ...adminAuth, marketingController.createBanner);
router.patch('/marketing/banners/reorder', ...adminAuth, marketingController.reorderBanners);
router.put('/marketing/banners/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.updateBanner);
router.delete('/marketing/banners/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.deleteBanner);

// Testimonials
router.get('/marketing/testimonials', ...adminAuth, marketingController.getAllTestimonials);
router.post('/marketing/testimonials', ...adminAuth, marketingController.createTestimonial);
router.put('/marketing/testimonials/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.updateTestimonial);
router.delete('/marketing/testimonials/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.deleteTestimonial);

// Campaigns
router.get('/marketing/campaigns', ...adminAuth, validate(campaignListQuerySchema, 'query'), marketingController.getAllCampaigns);
router.post('/marketing/campaigns', ...adminAuth, marketingController.createCampaign);
router.put('/marketing/campaigns/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.updateCampaign);
router.delete('/marketing/campaigns/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.deleteCampaign);

// ─── Reports ──────────────────────────────────────────────────────────────────
router.get('/reports/sales', ...adminAuth, reportController.getSalesReport);
router.get('/reports/inventory', ...adminAuth, reportController.getInventoryReport);

// ─── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications', ...adminAuth, notificationController.getAdminNotifications);
router.put('/notifications/:id/read', ...adminAuth, notificationController.markAsRead);
router.put('/notifications/read-all', ...adminAuth, notificationController.markAllAsRead);

// ─── Subscription Plans ───────────────────────────────────────────────────────
router.get('/subscription-plans', ...adminAuth, subscriptionPlanController.getAllPlans);
router.get('/subscription-plans/:id', ...adminAuth, subscriptionPlanController.getPlanById);
router.post('/subscription-plans', ...adminAuth, subscriptionPlanController.createPlan);
router.put('/subscription-plans/:id', ...adminAuth, subscriptionPlanController.updatePlan);
router.delete('/subscription-plans/:id', ...adminAuth, subscriptionPlanController.deletePlan);

// ─── Vendor Subscriptions ─────────────────────────────────────────────────────
router.get('/vendor-subscriptions', ...adminAuth, subscriptionPlanController.getVendorSubscriptions);

// ─── Vendor Terms & Conditions ────────────────────────────────────────────────
router.get('/settings/vendor-terms', ...adminAuth, termsController.getVendorTerms);
router.put('/settings/vendor-terms', ...adminAuth, termsController.updateVendorTerms);

// ─── Static Pages (About, Contact, Terms, Privacy, Returns, Shipping, FAQ, Partner) ──
router.get('/pages/:slug', ...adminAuth, staticPagesController.getPage);
router.put('/pages/:slug', ...adminAuth, staticPagesController.updatePage);

// ─── General Settings ────────────────────────────────────────────────────────
router.get('/settings/general', ...adminAuth, settingsController.getGeneralSettings);
router.put('/settings/general', ...adminAuth, settingsController.updateGeneralSettings);

export default router;
