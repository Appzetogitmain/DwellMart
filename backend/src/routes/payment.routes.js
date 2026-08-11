import express from 'express';
import {
    createPaymentSession,
    handleWebhook,
    verifyPayment,
} from '../modules/payment/controllers/cashfree.controller.js';
import { optionalAuth } from '../middlewares/authenticate.js';

const paymentRouter = express.Router();

paymentRouter.post('/cashfree/session', optionalAuth, createPaymentSession);
paymentRouter.post('/cashfree/verify', optionalAuth, verifyPayment);
paymentRouter.post('/cashfree/webhook', handleWebhook);

export default paymentRouter;
