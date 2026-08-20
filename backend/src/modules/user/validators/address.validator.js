import Joi from 'joi';
import { INDIAN_PINCODE_PATTERN, PINCODE_ERROR_MESSAGE } from '../../../constants/pincode.js';

const phoneSchema = Joi.string().pattern(/^[0-9]{10}$/).required();

/**
 * Six digits, first digit 1-9.
 *
 * Replaces `Joi.string().min(3).max(12)`, which accepted `HELLO`, `ABC` and
 * `<script>` into a field that is printed on a courier label and sent to DTDC.
 * Format only — whether the pincode EXISTS is a question for the carrier, and
 * is answered by the serviceability check at checkout.
 */
const zipSchema = Joi.string().trim().pattern(INDIAN_PINCODE_PATTERN).required()
    .messages({ 'string.pattern.base': PINCODE_ERROR_MESSAGE });
const locationFields = {
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
};

export const createAddressSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    fullName: Joi.string().trim().min(2).max(80).required(),
    phone: phoneSchema,
    address: Joi.string().trim().min(5).max(200).required(),
    city: Joi.string().trim().min(2).max(80).required(),
    state: Joi.string().trim().min(2).max(80).required(),
    zipCode: zipSchema,
    country: Joi.string().trim().min(2).max(80).required(),
    isDefault: Joi.boolean().optional(),
    ...locationFields,
}).and('latitude', 'longitude');

export const updateAddressSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).optional(),
    fullName: Joi.string().trim().min(2).max(80).optional(),
    phone: Joi.string().pattern(/^[0-9]{10}$/).optional(),
    address: Joi.string().trim().min(5).max(200).optional(),
    city: Joi.string().trim().min(2).max(80).optional(),
    state: Joi.string().trim().min(2).max(80).optional(),
    zipCode: Joi.string().trim().pattern(INDIAN_PINCODE_PATTERN).optional()
        .messages({ 'string.pattern.base': PINCODE_ERROR_MESSAGE }),
    country: Joi.string().trim().min(2).max(80).optional(),
    isDefault: Joi.boolean().optional(),
    ...locationFields,
}).and('latitude', 'longitude').min(1);
