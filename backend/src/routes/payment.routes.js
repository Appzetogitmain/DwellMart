import express from 'express';
import {
    createPaymentSession,
    handleWebhook,
    verifyPayment,
} from '../modules/payment/controllers/cashfree.controller.js';

const paymentRouter = express.Router();

paymentRouter.post('/cashfree/session', createPaymentSession);
paymentRouter.post('/cashfree/verify', verifyPayment);
paymentRouter.post('/cashfree/webhook', handleWebhook);

export default paymentRouter;
