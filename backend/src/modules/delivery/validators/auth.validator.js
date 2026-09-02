import Joi from 'joi';

/**
 * Delivery-partner authentication is passwordless.
 *
 * Identity is the mobile number and the only credential is a WhatsApp OTP, so
 * there is no login password, no confirm-password, and no reset flow to
 * validate. The schemas that covered those were removed with the endpoints.
 */

const phone = Joi.string().trim().required().messages({
    'string.empty': 'Mobile number is required.',
    'any.required': 'Mobile number is required.',
});

/** Step one of login: request a code. */
export const requestOtpSchema = Joi.object({
    phone,
});

/** Step two of login: exchange the code for a session. */
export const verifyLoginOtpSchema = Joi.object({
    phone,
    otp: Joi.string().pattern(/^\d{6}$/).required().messages({
        'string.pattern.base': 'Enter the 6-digit code.',
    }),
});

export const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(80).required(),
    email: Joi.string().email().lowercase().allow('', null).optional(),
    phone,
    address: Joi.string().trim().allow('').optional(),
    latitude: Joi.number().allow(null).optional(),
    longitude: Joi.number().allow(null).optional(),
    vehicleType: Joi.string().trim().allow('').optional(),
    vehicleNumber: Joi.string().trim().allow('').optional(),
});

export const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().required(),
});

export const logoutSchema = Joi.object({
    refreshToken: Joi.string().allow('').optional(),
});
