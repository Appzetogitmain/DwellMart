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
import * as subscriptionController from '../controllers/subscription.controller.js';
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
import { authLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import {
    registerSchema,
    onboardingStatusSchema,
    loginSchema,
    verifyOtpSchema,
    resendOtpSchema,
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
router.post('/auth/verify-otp', validate(verifyOtpSchema), authController.verifyOTP);
router.post('/auth/resend-otp', validate(resendOtpSchema), authController.resendOTP);
router.post('/auth/request-registration-otp', validate(requestRegistrationOtpSchema), authController.requestRegistrationOTP);
router.post('/auth/verify-registration-otp', validate(verifyRegistrationOtpSchema), authController.verifyRegistrationOTP);
router.post('/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/auth/verify-reset-otp', authLimiter, validate(verifyResetOtpSchema), authController.verifyResetOTP);
router.post('/auth/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post('/auth/login', authLimiter, validate(loginSchema), authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...vendorAuth, authController.getProfile);
router.put('/auth/profile', ...vendorAuth, authController.updateProfile);
router.put('/auth/selling-channels', ...vendorAuth, validate(updateSellingChannelsSchema), authController.updateSellingChannels);
router.put('/quick-commerce/settings', ...vendorAuth, validate(updateQuickCommerceSettingsSchema), authController.updateQuickCommerceSettings);
router.put('/auth/change-password', ...vendorAuth, authController.changePassword);
router.put('/auth/bank-details', ...vendorAuth, authController.updateBankDetails);

// Subscription (uses vendorAuthOnly so vendor can access even when expired)
router.get('/subscription', ...vendorAuthOnly, subscriptionController.getCurrentSubscription);
router.get('/subscription/plans', ...vendorAuthOnly, subscriptionController.getAvailablePlans);
router.post('/subscription/change-plan', ...vendorAuthOnly, validate(changePlanSchema), subscriptionController.changePlan);

// Products
router.get('/products', ...vendorAuth, productController.getVendorProducts);
router.get('/products/tax-pricing-rules', ...vendorAuth, getTaxPricingRules);
router.get('/products/template/excel', ...vendorAuth, downloadExcelTemplate);
router.get('/products/template/csv', ...vendorAuth, downloadCsvTemplate);
router.post('/products/bulk-upload/validate', ...vendorAuth, uploadMiddleware, validateUpload);
router.post('/products/bulk-upload/process', ...vendorAuth, processUpload);
router.get('/products/bulk-upload/job/:jobId', ...vendorAuth, checkJobStatus);
router.post('/products/bulk-upload/job/:jobId/cancel', ...vendorAuth, cancelJobHandler);
router.get('/products/bulk-upload/history', ...vendorAuth, getImportHistory);
router.get('/products/export', ...vendorAuth, exportProducts);
router.get('/products/:id', ...vendorAuth, validate(productIdParamSchema, 'params'), productController.getVendorProductById);
router.post('/products', ...vendorAuth, validate(createProductSchema), productController.createProduct);
router.put('/products/:id', ...vendorAuth, validate(productIdParamSchema, 'params'), validate(updateProductSchema), productController.updateProduct);
router.delete('/products/:id', ...vendorAuth, validate(productIdParamSchema, 'params'), productController.deleteProduct);
router.patch('/stock/:productId', ...vendorAuth, productController.updateStock);

// Orders
router.get('/orders', ...vendorAuth, orderController.getVendorOrders);
router.get('/orders/:id', ...vendorAuth, orderController.getVendorOrderById);
router.patch('/orders/:id/status', ...vendorAuth, orderController.updateOrderStatus);
router.patch('/orders/:id/quick-status', ...vendorAuth, validate(vendorQuickCommerceStatusSchema), orderController.updateQuickCommerceOrderStatus);
router.post('/orders/:id/partial-fulfilment', ...vendorAuth, orderController.markPartialFulfilment);
router.post('/quick-commerce/orders/:id/acknowledge', ...vendorAuth, orderController.acknowledgeQuickCommerceOrder);
router.get('/quick-commerce/dashboard', ...vendorAuth, orderController.getQuickCommerceVendorDashboard);

// Customers
router.get('/customers', ...vendorAuth, customerController.getVendorCustomers);
router.get('/customers/:id', ...vendorAuth, customerController.getVendorCustomerById);

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
router.get('/inventory/reports', ...vendorAuth, inventoryController.getInventoryReport);

// Performance metrics
router.get('/performance/metrics', ...vendorAuth, performanceController.getPerformanceMetrics);

// Analytics
router.get('/analytics/overview', ...vendorAuth, analyticsController.getAnalyticsOverview);

// Earnings
router.get('/earnings', ...vendorAuth, orderController.getEarnings);
router.post('/earnings/request-payout', ...vendorAuth, orderController.requestPayout);

// Return requests
router.get('/return-requests', ...vendorAuth, returnController.getVendorReturnRequests);
router.get('/return-requests/:id', ...vendorAuth, returnController.getVendorReturnRequestById);
router.patch('/return-requests/:id/status', ...vendorAuth, returnController.updateVendorReturnRequestStatus);

// Product reviews
router.get('/reviews', ...vendorAuth, reviewController.getVendorReviews);
router.patch('/reviews/:id/status', ...vendorAuth, reviewController.updateVendorReviewStatus);
router.patch('/reviews/:id/response', ...vendorAuth, reviewController.addVendorReviewResponse);



// Shipping management
router.get('/shipping/zones', ...vendorAuth, shippingController.getShippingZones);
router.post('/shipping/zones', ...vendorAuth, shippingController.createShippingZone);
router.put('/shipping/zones/:id', ...vendorAuth, shippingController.updateShippingZone);
router.delete('/shipping/zones/:id', ...vendorAuth, shippingController.deleteShippingZone);
router.get('/shipping/rates', ...vendorAuth, shippingController.getShippingRates);
router.post('/shipping/rates', ...vendorAuth, shippingController.createShippingRate);
router.put('/shipping/rates/:id', ...vendorAuth, shippingController.updateShippingRate);
router.delete('/shipping/rates/:id', ...vendorAuth, shippingController.deleteShippingRate);

// Uploads (Cloudinary via temp local multer upload)
router.post('/uploads/image', ...vendorAuth, uploadSingle('image'), uploadController.uploadImage);
router.post('/uploads/images', ...vendorAuth, uploadMultiple('images', 8), uploadController.uploadImages);

export default router;
