import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as productController from '../controllers/product.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as customerController from '../controllers/customer.controller.js';
import * as inventoryController from '../controllers/inventory.controller.js';
import * as performanceController from '../controllers/performance.controller.js';
import * as analyticsController from '../controllers/analytics.controller.js';
import * as chatController from '../controllers/chat.controller.js';
import * as documentController from '../controllers/document.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as returnController from '../controllers/return.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import * as shippingController from '../controllers/shipping.controller.js';
import * as uploadController from '../controllers/upload.controller.js';
import * as pickupLocationController from '../controllers/pickupLocation.controller.js';
import * as subscriptionController from '../controllers/subscription.controller.js';
import * as shipmentController from '../controllers/shipment.controller.js';
import * as businessOverviewController from '../controllers/businessOverview.controller.js';
import { getTaxPricingRules } from '../../admin/controllers/catalog.controller.js';
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
import checkSubscription from '../../../middlewares/checkSubscription.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter, otpPerAccountLimiter, otpLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import {
    registerSchema,
    onboardingStatusSchema,
    loginSchema,
    refreshTokenSchema,
    logoutSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    requestRegistrationOtpSchema,
    verifyRegistrationOtpSchema,
    updateSellingChannelsSchema,
    updateQuickCommerceSettingsSchema
} from '../validators/auth.validator.js';
import { changePlanSchema } from '../validators/subscription.validator.js';
import { vendorQuickCommerceStatusSchema } from '../validators/order.validator.js';
import {
    createProductSchema,
    updateProductSchema,
    productIdParamSchema,
} from '../validators/product.validator.js';
import { uploadSingle, uploadMultiple, uploadDocumentSingle } from '../../../middlewares/upload.js';
import { productCapabilityGuard } from '../middleware/productCapabilityGuard.js';
import { requireReadableChannel, requireWritableChannel, requireSpecificChannel } from '../../../middlewares/vendorChannel.js';

const router = Router();
const vendorAuth = [authenticate, authorize('vendor'), enforceAccountStatus, checkSubscription];
const vendorAuthOnly = [authenticate, authorize('vendor'), enforceAccountStatus];

const parseJsonFields = (req, res, next) => {
    try {
        if (typeof req.body.address === 'string') {
            req.body.address = JSON.parse(req.body.address);
        }
        if (typeof req.body.sellingChannels === 'string') {
            req.body.sellingChannels = JSON.parse(req.body.sellingChannels);
        }
        if (typeof req.body.wholesaleProfile === 'string') {
            req.body.wholesaleProfile = JSON.parse(req.body.wholesaleProfile);
        }
        if (req.body.agreedToTerms === 'true') req.body.agreedToTerms = true;
        if (req.body.agreedToTerms === 'false') req.body.agreedToTerms = false;
    } catch (e) {
        // Will be naturally caught by the validator later
    }
    next();
};

// Public Routes (No Auth)
router.get('/plans/public', subscriptionController.getAvailablePlans);

// Auth
router.post(
    '/auth/register',
    authLimiter,
    uploadDocumentSingle('document'),
    parseJsonFields,
    validate(registerSchema),
    authController.register
);
router.post('/auth/onboarding-status', validate(onboardingStatusSchema), authController.getOnboardingStatus);
router.post('/auth/request-registration-otp', otpLimiter, otpPerAccountLimiter, validate(requestRegistrationOtpSchema), authController.requestRegistrationOTP);
router.post('/auth/verify-registration-otp', validate(verifyRegistrationOtpSchema), authController.verifyRegistrationOTP);
router.post('/auth/forgot-password', authLimiter, otpPerAccountLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/auth/verify-reset-otp', authLimiter, validate(verifyResetOtpSchema), authController.verifyResetOTP);
router.post('/auth/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post('/auth/login', authLimiter, validate(loginSchema), authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...vendorAuth, authController.getProfile);
router.put('/auth/profile', ...vendorAuth, authController.updateProfile);
router.put('/auth/selling-channels', ...vendorAuth, validate(updateSellingChannelsSchema), authController.updateSellingChannels);
router.get('/auth/channels', ...vendorAuthOnly, authController.getChannels);
router.post('/auth/channels/:channel/apply', ...vendorAuth, authController.applyForChannel);
router.delete('/auth/channels/:channel/request', ...vendorAuth, authController.withdrawChannelRequest);
router.put('/quick-commerce/settings', ...vendorAuth, ...requireSpecificChannel('quick_commerce', { write: true }), validate(updateQuickCommerceSettingsSchema), authController.updateQuickCommerceSettings);
router.put('/auth/change-password', ...vendorAuth, authController.changePassword);
router.put('/auth/bank-details', ...vendorAuth, authController.updateBankDetails);
router.delete('/auth/account', ...vendorAuthOnly, authController.deleteAccount);

// Subscription (uses vendorAuthOnly so vendor can access even when expired)
router.get('/subscription', ...vendorAuthOnly, subscriptionController.getCurrentSubscription);
router.get('/subscription/plans', ...vendorAuthOnly, subscriptionController.getAvailablePlans);
router.post('/subscription/change-plan', ...vendorAuthOnly, validate(changePlanSchema), subscriptionController.changePlan);
router.get('/business-overview', ...vendorAuth, businessOverviewController.getBusinessOverview);

// Products
router.get('/products', ...vendorAuth, ...requireReadableChannel, productController.getVendorProducts);
router.get('/products/tax-pricing-rules', ...vendorAuth, ...requireReadableChannel, getTaxPricingRules);
router.get('/products/template/excel', ...vendorAuth, ...requireReadableChannel, downloadExcelTemplate);
router.get('/products/template/csv', ...vendorAuth, ...requireReadableChannel, downloadCsvTemplate);
router.post('/products/bulk-upload/validate', ...vendorAuth, ...requireWritableChannel, uploadMiddleware, validateUpload);
router.post('/products/bulk-upload/process', ...vendorAuth, ...requireWritableChannel, productCapabilityGuard, processUpload);
router.get('/products/bulk-upload/job/:jobId', ...vendorAuth, ...requireReadableChannel, checkJobStatus);
router.post('/products/bulk-upload/job/:jobId/cancel', ...vendorAuth, ...requireReadableChannel, cancelJobHandler);
router.get('/products/bulk-upload/history', ...vendorAuth, ...requireReadableChannel, getImportHistory);
router.get('/products/export', ...vendorAuth, ...requireReadableChannel, exportProducts);
router.get('/products/:id', ...vendorAuth, ...requireReadableChannel, validate(productIdParamSchema, 'params'), productController.getVendorProductById);
router.post('/products', ...vendorAuth, ...requireWritableChannel, productCapabilityGuard, validate(createProductSchema), productController.createProduct);
router.put('/products/:id', ...vendorAuth, ...requireWritableChannel, validate(productIdParamSchema, 'params'), productCapabilityGuard, validate(updateProductSchema), productController.updateProduct);
router.patch('/products/:id/channels/:channel', ...vendorAuth, ...requireWritableChannel, productController.updateProductChannel);
router.delete('/products/:id', ...vendorAuth, ...requireWritableChannel, validate(productIdParamSchema, 'params'), productController.deleteProduct);
router.patch('/stock/:productId', ...vendorAuth, ...requireWritableChannel, productController.updateStock);

// Orders
router.get('/orders', ...vendorAuth, ...requireReadableChannel, orderController.getVendorOrders);
// Literal path MUST precede '/orders/:id' — Express matches in declaration
// order, and the parameterised route would otherwise capture this request with
// id = 'awaiting-shipment'.
router.get('/orders/awaiting-shipment', ...vendorAuth, ...requireReadableChannel, shipmentController.vendorListAwaitingShipment);
router.get('/orders/:id', ...vendorAuth, ...requireReadableChannel, orderController.getVendorOrderById);
// Paused channels cannot accept new orders or publish products, but may finish
// already accepted work. These transitions therefore require readable access.
router.patch('/orders/:id/status', ...vendorAuth, ...requireReadableChannel, orderController.updateOrderStatus);
router.patch('/orders/:id/quick-status', ...vendorAuth, ...requireSpecificChannel('quick_commerce'), validate(vendorQuickCommerceStatusSchema), orderController.updateQuickCommerceOrderStatus);
router.post('/orders/:id/partial-fulfilment', ...vendorAuth, ...requireSpecificChannel('quick_commerce'), orderController.markPartialFulfilment);
router.post('/quick-commerce/orders/:id/acknowledge', ...vendorAuth, ...requireSpecificChannel('quick_commerce'), orderController.acknowledgeQuickCommerceOrder);
router.get('/quick-commerce/dashboard', ...vendorAuth, ...requireSpecificChannel('quick_commerce'), orderController.getQuickCommerceVendorDashboard);
router.get('/quick-commerce/unacknowledged-alerts', ...vendorAuth, ...requireSpecificChannel('quick_commerce'), orderController.getUnacknowledgedVendorAlerts);

// ─── DTDC Shipments (Retail / Wholesale only) ─────────────────────────────────
router.post('/orders/:id/book-dtdc', ...vendorAuth, ...requireReadableChannel, shipmentController.vendorBookDtdcShipment);
router.get('/orders/:id/shipping-label', ...vendorAuth, ...requireReadableChannel, shipmentController.vendorGetShippingLabel);
router.get('/orders/:id/shipment', ...vendorAuth, ...requireReadableChannel, shipmentController.vendorGetShipment);
router.get('/orders/:id/package-preview', ...vendorAuth, ...requireReadableChannel, shipmentController.vendorGetPackagePreview);
router.post('/orders/:id/sync-tracking', ...vendorAuth, ...requireReadableChannel, shipmentController.vendorSyncTracking);
router.get('/check-serviceability', ...vendorAuth, shipmentController.vendorCheckServiceability);

// Customers
router.get('/customers', ...vendorAuth, ...requireReadableChannel, customerController.getVendorCustomers);
router.get('/customers/:id', ...vendorAuth, ...requireReadableChannel, customerController.getVendorCustomerById);

// Chat
router.get('/chat/threads', ...vendorAuth, chatController.getVendorChatThreads);
router.get('/chat/threads/:id/messages', ...vendorAuth, chatController.getVendorChatMessages);
router.post('/chat/threads/:id/messages', ...vendorAuth, chatController.sendVendorChatMessage);
router.patch('/chat/threads/:id/read', ...vendorAuth, chatController.markVendorChatRead);
router.patch('/chat/threads/:id/status', ...vendorAuth, chatController.updateVendorChatStatus);

// Documents
router.get('/documents', ...vendorAuth, documentController.getVendorDocuments);
router.post('/documents', ...vendorAuth, uploadDocumentSingle('file'), documentController.createVendorDocument);
router.delete('/documents/:id', ...vendorAuth, documentController.deleteVendorDocument);

// Notifications
router.get('/notifications', ...vendorAuth, notificationController.getVendorNotifications);
router.put('/notifications/:id/read', ...vendorAuth, notificationController.markVendorNotificationAsRead);
router.put('/notifications/read-all', ...vendorAuth, notificationController.markAllVendorNotificationsAsRead);
router.delete('/notifications/:id', ...vendorAuth, notificationController.deleteVendorNotification);

// Inventory reports
router.get('/inventory/reports', ...vendorAuth, ...requireReadableChannel, inventoryController.getInventoryReport);

// Performance metrics — channel-scoped: metrics aggregate per-channel data and
// should be scoped to the active workspace for accuracy.
router.get('/performance/metrics', ...vendorAuth, ...requireReadableChannel, performanceController.getPerformanceMetrics);

// Analytics
router.get('/analytics/overview', ...vendorAuth, ...requireReadableChannel, analyticsController.getAnalyticsOverview);

// Earnings — account-wide (spans all channels; no workspace scope needed)
router.get('/earnings', ...vendorAuth, orderController.getEarnings);
router.post('/earnings/request-payout', ...vendorAuth, orderController.requestPayout);

// Return requests — channel-scoped: returns are tied to the fulfillment channel.
// A retail return should not be visible in a wholesale workspace and vice versa.
router.get('/return-requests', ...vendorAuth, ...requireReadableChannel, returnController.getVendorReturnRequests);
router.get('/return-requests/:id', ...vendorAuth, ...requireReadableChannel, returnController.getVendorReturnRequestById);
router.patch('/return-requests/:id/status', ...vendorAuth, ...requireReadableChannel, returnController.updateVendorReturnRequestStatus);

// Product reviews — channel-scoped: reviews are product-level and belong to
// the channel through which the product was purchased.
router.get('/reviews', ...vendorAuth, ...requireReadableChannel, reviewController.getVendorReviews);
router.patch('/reviews/:id/status', ...vendorAuth, ...requireReadableChannel, reviewController.updateVendorReviewStatus);
router.patch('/reviews/:id/response', ...vendorAuth, ...requireReadableChannel, reviewController.addVendorReviewResponse);



// Shipping management — channel-scoped: shipping zones and rates are specific
// to a fulfillment channel. A retail shipping zone should not be visible or
// editable from a wholesale workspace context.
router.get('/shipping/zones', ...vendorAuth, ...requireReadableChannel, shippingController.getShippingZones);
router.post('/shipping/zones', ...vendorAuth, ...requireWritableChannel, shippingController.createShippingZone);
router.put('/shipping/zones/:id', ...vendorAuth, ...requireWritableChannel, shippingController.updateShippingZone);
router.delete('/shipping/zones/:id', ...vendorAuth, ...requireWritableChannel, shippingController.deleteShippingZone);
router.get('/shipping/rates', ...vendorAuth, ...requireReadableChannel, shippingController.getShippingRates);
router.post('/shipping/rates', ...vendorAuth, ...requireWritableChannel, shippingController.createShippingRate);
router.put('/shipping/rates/:id', ...vendorAuth, ...requireWritableChannel, shippingController.updateShippingRate);
router.delete('/shipping/rates/:id', ...vendorAuth, ...requireWritableChannel, shippingController.deleteShippingRate);

// Pickup locations
// Uses vendorAuthOnly for reads so an expired-subscription vendor can still see
// where they fulfil from; writes go through vendorAuth, matching every other
// store-configuration surface.
router.get('/pickup-locations', ...vendorAuthOnly, pickupLocationController.listPickupLocations);
router.post('/pickup-locations', ...vendorAuth, pickupLocationController.createPickupLocation);
router.post('/pickup-locations/import', ...vendorAuth, pickupLocationController.importPickupLocations);
router.put('/pickup-locations/:id', ...vendorAuth, pickupLocationController.updatePickupLocation);
router.patch('/pickup-locations/:id/default', ...vendorAuth, pickupLocationController.setDefaultPickupLocation);
router.delete('/pickup-locations/:id', ...vendorAuth, pickupLocationController.deletePickupLocation);

// Uploads (Cloudinary via temp local multer upload)
router.post('/uploads/image', ...vendorAuth, uploadSingle('image'), uploadController.uploadImage);
router.post('/uploads/images', ...vendorAuth, uploadMultiple('images', 8), uploadController.uploadImages);

export default router;
