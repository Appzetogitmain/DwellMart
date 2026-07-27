import ApiError from '../utils/ApiError.js';
import { getCurrentVendorSubscription } from '../services/billing/subscriptionState.service.js';

const checkSubscription = async (req, res, next) => {
    try {
        const subscription = await getCurrentVendorSubscription(req.user.id);

        const isActive = Boolean(
            subscription
            && subscription.status === 'active'
            && subscription.current_period_end
            && new Date(subscription.current_period_end) > new Date()
        );

        // Allow GET (view-only) requests even if subscription is expired so vendor can view their panel
        if (!isActive && req.method !== 'GET') {
            const error = new ApiError(403, 'Your subscription is expired. Please resubscribe to make active store changes.');
            error.errorCode = 'SUBSCRIPTION_INACTIVE';
            return next(error);
        }

        req.subscription = subscription;
        return next();
    } catch (error) {
        return next(error);
    }
};

export default checkSubscription;
