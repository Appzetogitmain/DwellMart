import Joi from 'joi';
import {
    LATITUDE_BOUNDS,
    LONGITUDE_BOUNDS,
    QUICK_COMMERCE_RIDER_STATUSES,
} from '../../../constants/quickCommerce.js';

/** Rider position ping. Bounds are checked here and again in the controller. */
export const riderLocationSchema = Joi.object({
    latitude: Joi.number().min(LATITUDE_BOUNDS.min).max(LATITUDE_BOUNDS.max).required(),
    longitude: Joi.number().min(LONGITUDE_BOUNDS.min).max(LONGITUDE_BOUNDS.max).required(),
});

/**
 * Rider-side Quick Commerce transitions. The OTP is only meaningful on
 * `delivered`; the controller enforces that, this just shapes the payload.
 */
export const quickCommerceStatusSchema = Joi.object({
    status: Joi.string().valid(...QUICK_COMMERCE_RIDER_STATUSES).required(),
    otp: Joi.string().pattern(/^\d{6}$/).optional(),
});
