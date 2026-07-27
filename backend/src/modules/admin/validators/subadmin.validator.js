import Joi from 'joi';

export const createSubAdminSchema = Joi.object({
    name: Joi.string().required().trim().min(2).max(50).messages({
        'string.empty': 'Name is required.',
        'string.min': 'Name must be at least 2 characters.',
    }),
    email: Joi.string().required().email().lowercase().trim().messages({
        'string.empty': 'Email is required.',
        'string.email': 'Please enter a valid email address.',
    }),
    phone: Joi.string().allow('', null).trim(),
    password: Joi.string().required().min(6).messages({
        'string.empty': 'Password is required.',
        'string.min': 'Password must be at least 6 characters.',
    }),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Passwords do not match.',
        'string.empty': 'Confirm Password is required.',
    }),
    role: Joi.string().valid('subadmin', 'superadmin').default('subadmin'),
    status: Joi.string().valid('active', 'inactive').default('active'),
    permissions: Joi.array().items(Joi.string()).default([]),
});

export const updateSubAdminSchema = Joi.object({
    name: Joi.string().required().trim().min(2).max(50),
    phone: Joi.string().allow('', null).trim(),
    status: Joi.string().valid('active', 'inactive').default('active'),
    permissions: Joi.array().items(Joi.string()).default([]),
});

export const updateStatusSchema = Joi.object({
    status: Joi.string().valid('active', 'inactive').required(),
});

export const resetPasswordSchema = Joi.object({
    password: Joi.string().required().min(6).messages({
        'string.empty': 'New password is required.',
        'string.min': 'Password must be at least 6 characters.',
    }),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Passwords do not match.',
        'string.empty': 'Confirm password is required.',
    }),
});
