import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as locationController from '../controllers/location.controller.js';
import * as settlementController from '../controllers/settlement.controller.js';
import * as walletController from '../controllers/wallet.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter, withdrawalLimiter } from '../../../middlewares/rateLimiter.js';
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
import {
    createWithdrawalSchema,
    walletTransactionQuerySchema,
    withdrawalQuerySchema,
    statementQuerySchema,
    updatePayoutDetailsSchema,
    withdrawalIdParamSchema,
} from '../validators/wallet.validator.js';

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
router.delete('/auth/account', ...deliveryAuth, authController.deleteAccount);

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
router.post('/orders/:id/reject', ...deliveryAuth, orderController.rejectAssignedOrder);
router.post('/orders/:id/accept-offer', ...deliveryAuth, orderController.acceptOfferHandler);
router.post('/orders/:id/reject-offer', ...deliveryAuth, orderController.rejectOfferHandler);

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

// ── Earnings wallet ───────────────────────────────────────────────────────────
// Separate from cash settlements above: that ledger is what the rider OWES the
// platform, this one is what the platform OWES the rider.
router.get('/wallet/summary', ...deliveryAuth, walletController.getWallet);
router.get('/wallet/transactions', ...deliveryAuth, validate(walletTransactionQuerySchema, 'query'), walletController.getTransactions);
router.get('/wallet/statement', ...deliveryAuth, validate(statementQuerySchema, 'query'), walletController.getStatement);
router.get('/wallet/payout-details', ...deliveryAuth, walletController.getRiderPayoutDetails);
router.put('/wallet/payout-details', ...deliveryAuth, validate(updatePayoutDetailsSchema), walletController.updateRiderPayoutDetails);
// Registered before '/wallet/withdrawals/:id/cancel' so the literal path is not
// swallowed by the param route.
router.get('/wallet/withdrawals', ...deliveryAuth, validate(withdrawalQuerySchema, 'query'), walletController.getWithdrawals);
router.post('/wallet/withdrawals', ...deliveryAuth, withdrawalLimiter, validate(createWithdrawalSchema), walletController.createWithdrawal);
router.post('/wallet/withdrawals/:id/cancel', ...deliveryAuth, validate(withdrawalIdParamSchema, 'params'), walletController.cancelWithdrawal);

export default router;
