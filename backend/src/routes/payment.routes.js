import express from 'express';
import {
    createPaymentSession as createCashfreePaymentSession,
    handleWebhook as handleCashfreeWebhook,
    verifyPayment as verifyCashfreePayment,
} from '../modules/payment/controllers/cashfree.controller.js';
import {
    createPaymentSession as createRazorpayPaymentSession,
    handleWebhook as handleRazorpayWebhook,
    verifyPayment as verifyRazorpayPayment,
} from '../modules/payment/controllers/razorpay.controller.js';
import { optionalAuth } from '../middlewares/authenticate.js';

const paymentRouter = express.Router();

// ── Cashfree Routes ──────────────────────────────────────────────────────────
paymentRouter.post('/cashfree/session', optionalAuth, createCashfreePaymentSession);
paymentRouter.post('/cashfree/verify', optionalAuth, verifyCashfreePayment);
paymentRouter.post('/cashfree/webhook', handleCashfreeWebhook);

// ── Razorpay Routes ──────────────────────────────────────────────────────────
paymentRouter.post('/razorpay/session', optionalAuth, createRazorpayPaymentSession);
paymentRouter.post('/razorpay/verify', optionalAuth, verifyRazorpayPayment);
paymentRouter.post('/razorpay/webhook', handleRazorpayWebhook);

export default paymentRouter;
