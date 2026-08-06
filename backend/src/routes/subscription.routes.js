import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import * as billingController from '../modules/vendor/controllers/billing.controller.js';
import {
    initiateOnboardingSubscriptionSchema,
    confirmOnboardingPaymentSchema,
} from '../modules/vendor/validators/auth.validator.js';
import {
    selectPlanSchema,
} from '../modules/vendor/validators/subscription.validator.js';

const subscriptionRouter = Router();

subscriptionRouter.get('/plans', billingController.getSubscriptionPlans);
subscriptionRouter.post('/select-plan', validate(selectPlanSchema), billingController.selectPlan);
subscriptionRouter.post('/initiate', validate(initiateOnboardingSubscriptionSchema), billingController.initiateOnboardingSubscription);
subscriptionRouter.post('/confirm', validate(confirmOnboardingPaymentSchema), billingController.confirmOnboardingPayment);

export {
    subscriptionRouter,
};
