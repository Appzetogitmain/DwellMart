import Joi from 'joi';
import { QUICK_COMMERCE_VENDOR_STATUSES } from '../../../constants/quickCommerce.js';

/** Store-side Quick Commerce transitions: accepted → preparing → ready. */
export const vendorQuickCommerceStatusSchema = Joi.object({
    status: Joi.string().valid(...QUICK_COMMERCE_VENDOR_STATUSES).required(),
});
