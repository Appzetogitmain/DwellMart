import Joi from 'joi';
import { INDIAN_PINCODE_PATTERN, PINCODE_ERROR_MESSAGE } from '../../../constants/pincode.js';

export const placeOrderSchema = Joi.object({
    items: Joi.array().items(
        Joi.object({
            productId: Joi.string().required(),
            quantity: Joi.number().integer().min(1).required(),
            price: Joi.number().optional(),
            variant: Joi.object().pattern(Joi.string(), Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean())).optional(),
        })
    ).min(1).required(),
    shippingAddress: Joi.object({
        name: Joi.string().required(),
        email: Joi.string().email().required(),
        phone: Joi.string().required(),
        address: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        // Was a bare `Joi.string().required()` — weaker even than the address
        // schema, so an order could carry a pincode an address never could.
        zipCode: Joi.string().trim().pattern(INDIAN_PINCODE_PATTERN).required()
            .messages({ 'string.pattern.base': PINCODE_ERROR_MESSAGE }),
        country: Joi.string().required(),
    }).required(),
    paymentMethod: Joi.string().valid('card', 'cash', 'cod', 'bank', 'wallet', 'upi').required(),
    couponCode: Joi.string().optional().allow(''),
    shippingOption: Joi.string().valid('standard', 'express').default('standard'),
    customerLocation: Joi.object({
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
        address: Joi.string().allow('', null).optional(),
        pincode: Joi.string().allow('', null).optional(),
    }).optional(),
});

export const createReturnRequestSchema = Joi.object({
    reason: Joi.string().trim().min(5).max(500).required(),
    vendorId: Joi.string().optional(),
    items: Joi.array()
        .items(
            Joi.object({
                productId: Joi.string().required(),
                quantity: Joi.number().integer().min(1).required(),
                reason: Joi.string().trim().max(300).allow('').optional(),
            })
        )
        .min(1)
        .optional(),
    images: Joi.array().items(Joi.string().uri()).max(6).optional(),
});
