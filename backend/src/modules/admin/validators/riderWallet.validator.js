import Joi from 'joi';
import { RATE_CARD_SCOPES } from '../../../models/RiderRateCard.model.js';
import { WITHDRAWAL_STATUSES } from '../../../models/RiderWithdrawalRequest.model.js';
import { EXPERIENCE_VALUES } from '../../../constants/experiences.js';

const objectId = Joi.string().pattern(/^[a-fA-F0-9]{24}$/);

export const withdrawalIdParamSchema = Joi.object({
    id: objectId.required().messages({ 'string.pattern.base': 'Invalid withdrawal request.' }),
});

export const riderIdParamSchema = Joi.object({
    deliveryBoyId: objectId.required().messages({ 'string.pattern.base': 'Invalid delivery partner.' }),
});

export const orderIdParamSchema = Joi.object({
    orderId: objectId.required().messages({ 'string.pattern.base': 'Invalid order.' }),
});

export const withdrawalListQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid(...WITHDRAWAL_STATUSES, 'all', '').allow('', null).default('all'),
    search: Joi.string().allow('', null).max(120).default(''),
});

export const walletListQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().allow('', null).max(120).default(''),
    blocked: Joi.string().valid('true', 'false', '').allow('', null).optional(),
    sort: Joi.string().valid('available', 'pending', 'earned', 'recent', '').allow('', null).default('available'),
});

export const approveWithdrawalSchema = Joi.object({
    notes: Joi.string().allow('').max(500).default(''),
});

/**
 * Reason fields are mandatory on every negative or corrective action. The
 * reason IS the audit record — an approval can be inferred from the outcome, a
 * rejection cannot.
 */
export const rejectWithdrawalSchema = Joi.object({
    reason: Joi.string().trim().min(5).max(500).required().messages({
        'string.min': 'Give a reason of at least 5 characters so the rider understands the decision.',
        'any.required': 'A rejection reason is required.',
    }),
});

export const markPaidSchema = Joi.object({
    utr: Joi.string().trim().min(6).max(64).required().messages({
        'string.min': 'Enter the UTR or bank reference (at least 6 characters).',
        'any.required': 'A UTR or bank reference is required to record a payout.',
    }),
    gatewayReference: Joi.string().trim().allow('').max(128).optional(),
    notes: Joi.string().allow('').max(500).default(''),
});

export const markFailedSchema = Joi.object({
    reason: Joi.string().trim().min(5).max(500).required().messages({
        'string.min': 'Give a failure reason of at least 5 characters.',
        'any.required': 'A failure reason is required.',
    }),
});

export const adjustWalletSchema = Joi.object({
    amount: Joi.number().required().invalid(0).messages({
        'any.invalid': 'An adjustment of zero has no effect.',
        'any.required': 'Enter the adjustment amount. Use a negative value to deduct.',
    }),
    reason: Joi.string().trim().min(5).max(500).required().messages({
        'string.min': 'Give a reason of at least 5 characters. This is the audit record.',
        'any.required': 'A reason is required for every wallet adjustment.',
    }),
});

export const adjustCashSchema = Joi.object({
    amount: Joi.number().required().invalid(0).messages({
        'any.invalid': 'An adjustment of zero has no effect.',
        'any.required': 'Enter the adjustment amount. Use a negative value to write cash off.',
    }),
    reason: Joi.string().trim().min(5).max(500).required(),
    type: Joi.string().valid('ADJUSTMENT', 'REVERSAL').default('ADJUSTMENT'),
    orderId: objectId.allow(null, '').optional(),
});

export const togglePayoutBlockSchema = Joi.object({
    blocked: Joi.boolean().required(),
    reason: Joi.when('blocked', {
        is: true,
        then: Joi.string().trim().min(5).max(500).required().messages({
            'any.required': 'A reason is required to block payouts.',
        }),
        otherwise: Joi.string().allow('').max(500).optional(),
    }),
});

export const reverseEarningSchema = Joi.object({
    reason: Joi.string().trim().min(5).max(500).required().messages({
        'any.required': 'A reason is required to reverse a delivery earning.',
    }),
});

export const createRateCardSchema = Joi.object({
    name: Joi.string().trim().min(3).max(120).required(),
    scope: Joi.string().valid(...RATE_CARD_SCOPES).default('global'),
    experience: Joi.when('scope', {
        is: 'experience',
        then: Joi.string().valid(...EXPERIENCE_VALUES).required(),
        otherwise: Joi.string().valid(...EXPERIENCE_VALUES).allow(null, '').optional(),
    }),
    city: Joi.when('scope', {
        is: 'city',
        then: Joi.string().trim().min(2).max(120).required(),
        otherwise: Joi.string().allow(null, '').max(120).optional(),
    }),
    deliveryBoyId: Joi.when('scope', {
        is: 'rider',
        then: objectId.required(),
        otherwise: objectId.allow(null, '').optional(),
    }),

    baseFarePerDelivery: Joi.number().min(0).required().messages({
        'any.required': 'A base fare per delivery is required.',
    }),
    perKmRate: Joi.number().min(0).default(0),
    freeDistanceKm: Joi.number().min(0).default(0),
    minimumFare: Joi.number().min(0).default(0),
    maximumFare: Joi.number().min(0).default(0),
    surgeMultiplier: Joi.number().min(1).max(10).default(1),
    peakHourBonus: Joi.number().min(0).default(0),
    peakHours: Joi.array().items(
        Joi.object({
            startHour: Joi.number().integer().min(0).max(23).required(),
            endHour: Joi.number().integer().min(0).max(23).required(),
        })
    ).default([]),
    codHandlingFee: Joi.number().min(0).default(0),

    effectiveFrom: Joi.date().iso().default(() => new Date()),
    effectiveTo: Joi.date().iso().allow(null).optional(),
    notes: Joi.string().allow('').max(500).default(''),
});

export const rateCardIdParamSchema = Joi.object({
    id: objectId.required().messages({ 'string.pattern.base': 'Invalid rate card.' }),
});

export const rateCardListQuerySchema = Joi.object({
    scope: Joi.string().valid(...RATE_CARD_SCOPES, 'all', '').allow('', null).optional(),
    isActive: Joi.string().valid('true', 'false', '').allow('', null).optional(),
});

export const walletAnalyticsQuerySchema = Joi.object({
    days: Joi.number().integer().min(1).max(365).default(30),
});

export const driftQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(1000).default(200),
});
