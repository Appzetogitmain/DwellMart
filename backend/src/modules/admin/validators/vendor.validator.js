import Joi from 'joi';
import { MAX_SERVICE_RADIUS_KM } from '../../../constants/quickCommerce.js';

const objectId = Joi.string().trim().hex().length(24);

export const vendorListQuerySchema = Joi.object({
    status: Joi.string().valid('all', 'pending', 'approved', 'suspended', 'rejected').optional(),
    search: Joi.string().trim().allow('').optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(500).optional(),
});

export const vendorIdParamSchema = Joi.object({
    id: objectId.required(),
});

export const vendorStatusUpdateSchema = Joi.object({
    status: Joi.string().valid('approved', 'suspended', 'rejected').required(),
    reason: Joi.string().trim().allow('').max(500).optional(),
    vendorType: Joi.string().valid('quick_commerce', 'retail', 'wholesale').optional(),
});

export const vendorCommissionUpdateSchema = Joi.object({
    commissionRate: Joi.number().min(0).max(100).required(),
});

/**
 * Admin control over a vendor's Quick Commerce capability.
 * `enabled` grants/revokes the channel; the optional overrides let an admin
 * correct an unrealistic radius or preparation time without the vendor.
 */
export const vendorQuickCommerceUpdateSchema = Joi.object({
    enabled: Joi.boolean().required(),
    serviceRadiusKm: Joi.number().min(0.5).max(MAX_SERVICE_RADIUS_KM).optional(),
    preparationTimeMins: Joi.number().integer().min(0).max(240).optional(),
});

export const vendorCommissionsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(200).optional(),
    status: Joi.string().valid('all', 'pending', 'paid', 'cancelled').optional(),
});

