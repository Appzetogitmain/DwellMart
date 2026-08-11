import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as locationController from '../controllers/location.controller.js';
import * as settlementController from '../controllers/settlement.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import { uploadDeliveryDocuments } from '../../../middlewares/upload.js';
import {
    loginSchema,
    registerSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    refreshTokenSchema,
    logoutSchema,
} from '../validators/auth.validator.js';
import {
    riderLocationSchema,
    quickCommerceStatusSchema,
} from '../validators/delivery.validator.js';

const router = Router();
const deliveryAuth = [authenticate, authorize('delivery'), enforceAccountStatus];
const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

// Auth
router.post(
    '/auth/register',
    authLimiter,
    uploadDeliveryDocuments([
        { name: 'drivingLicense', maxCount: 1 },
        { name: 'aadharCard', maxCount: 1 },
    ]),
    validate(registerSchema),
    authController.register
);
router.post('/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/auth/verify-reset-otp', authLimiter, validate(verifyResetOtpSchema), authController.verifyResetOTP);
router.post('/auth/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post('/auth/login', authLimiter, validate(loginSchema), authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...deliveryAuth, authController.getProfile);
router.put('/auth/profile', ...deliveryAuth, authController.updateProfile);

// Orders
router.get('/orders', ...deliveryAuth, orderController.getAssignedOrders);
router.get('/orders/dashboard-summary', ...deliveryAuth, orderController.getDashboardSummary);
router.get('/orders/profile-summary', ...deliveryAuth, orderController.getProfileSummary);
router.get('/orders/analytics', ...deliveryAuth, orderController.getRiderAnalyticsHandler);
router.get('/orders/:id', ...deliveryAuth, orderController.getOrderDetail);
if (!IS_PRODUCTION) {
    router.get('/orders/:id/debug-otp', ...deliveryAuth, orderController.getDeliveryOtpForDebug);
}
router.patch('/orders/:id/status', ...deliveryAuth, orderController.updateDeliveryStatus);
router.patch(
    '/orders/:id/quick-status',
    ...deliveryAuth,
    validate(quickCommerceStatusSchema),
    orderController.updateQuickCommerceStatus
);
router.post('/orders/:id/resend-delivery-otp', ...deliveryAuth, orderController.resendDeliveryOtp);
router.post('/orders/:id/customer-unreachable', ...deliveryAuth, orderController.markCustomerUnreachable);
router.post('/orders/:id/schedule-retry', ...deliveryAuth, orderController.scheduleDeliveryRetry);
router.post('/orders/:id/return-to-store', ...deliveryAuth, orderController.returnToStore);

// Live tracking — the rider reports position, the customer's order room receives it.
router.patch(
    '/location',
    ...deliveryAuth,
    validate(riderLocationSchema),
    locationController.updateRiderLocation
);
router.get('/active-order', ...deliveryAuth, locationController.getActiveOrder);

// Notifications
router.get('/notifications', ...deliveryAuth, notificationController.getDeliveryNotifications);
router.put('/notifications/:id/read', ...deliveryAuth, notificationController.markDeliveryNotificationAsRead);
router.put('/notifications/read-all', ...deliveryAuth, notificationController.markAllDeliveryNotificationsAsRead);
router.delete('/notifications/:id', ...deliveryAuth, notificationController.deleteDeliveryNotification);

// Cash Settlements
router.get('/cash-settlements/summary', ...deliveryAuth, settlementController.getCashSettlementSummary);
router.post('/cash-settlements/request', ...deliveryAuth, settlementController.createCashSettlementRequest);
router.get('/cash-settlements/history', ...deliveryAuth, settlementController.getCashSettlementHistory);

export default router;
