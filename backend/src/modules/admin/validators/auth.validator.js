import Joi from 'joi';

export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

export const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().required(),
});

export const logoutSchema = Joi.object({
    refreshToken: Joi.string().allow('').optional(),
});

export const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required().messages({
        'string.empty': 'Current password is required.',
        'any.required': 'Current password is required.',
    }),
    newPassword: Joi.string().min(6).max(128).required().messages({
        'string.empty': 'New password is required.',
        'string.min': 'New password must be at least 6 characters long.',
        'any.required': 'New password is required.',
    }),
});
