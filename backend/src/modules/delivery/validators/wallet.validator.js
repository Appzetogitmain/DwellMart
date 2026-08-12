import Joi from 'joi';
import {
    TRANSACTION_TYPES,
    TRANSACTION_STATES,
} from '../../../models/RiderWalletTransaction.model.js';
import { WITHDRAWAL_STATUSES } from '../../../models/RiderWithdrawalRequest.model.js';

/**
 * Amount bounds are validated again in the service against live policy and the
 * rider's actual balance. This layer only rejects shapes that could never be
 * valid, so a malformed request never reaches business logic.
 */
export const createWithdrawalSchema = Joi.object({
    amount: Joi.number().positive().precision(2).required().messages({
        'number.base': 'Enter the amount you want to withdraw.',
        'number.positive': 'The withdrawal amount must be greater than zero.',
        'any.required': 'Enter the amount you want to withdraw.',
    }),
});

export const walletTransactionQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    type: Joi.string().valid(...TRANSACTION_TYPES, 'all').optional(),
    state: Joi.string().valid(...TRANSACTION_STATES, 'all').optional(),
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
});

export const withdrawalQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid(...WITHDRAWAL_STATUSES, 'all').optional(),
});

export const statementQuerySchema = Joi.object({
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
    format: Joi.string().valid('json', 'csv').default('json'),
});

/**
 * Conditional by method: UPI needs a VPA, bank transfer needs the full triple.
 * Enforcing it here means the service never has to guess which fields matter.
 */
export const updatePayoutDetailsSchema = Joi.object({
    method: Joi.string().valid('upi', 'bank_transfer').required().messages({
        'any.only': 'Choose either UPI or bank transfer.',
        'any.required': 'Choose a payout method.',
    }),
    upiId: Joi.when('method', {
        is: 'upi',
        then: Joi.string()
            .pattern(/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,32}$/)
            .required()
            .messages({
                'string.pattern.base': 'Enter a valid UPI ID, for example name@bank.',
                'any.required': 'Enter your UPI ID.',
            }),
        otherwise: Joi.string().allow('').optional(),
    }),
    accountNumber: Joi.when('method', {
        is: 'bank_transfer',
        then: Joi.string().pattern(/^\d{6,18}$/).required().messages({
            'string.pattern.base': 'Enter a valid bank account number (6 to 18 digits).',
            'any.required': 'Enter your bank account number.',
        }),
        otherwise: Joi.string().allow('').optional(),
    }),
    ifscCode: Joi.when('method', {
        is: 'bank_transfer',
        then: Joi.string().uppercase().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).required().messages({
            'string.pattern.base': 'Enter a valid IFSC code, for example HDFC0001234.',
            'any.required': 'Enter your bank IFSC code.',
        }),
        otherwise: Joi.string().allow('').optional(),
    }),
    accountName: Joi.when('method', {
        is: 'bank_transfer',
        then: Joi.string().min(3).max(120).required().messages({
            'string.min': 'Enter the account holder name as it appears on the bank account.',
            'any.required': 'Enter the account holder name.',
        }),
        otherwise: Joi.string().allow('').max(120).optional(),
    }),
    bankName: Joi.string().allow('').max(120).optional(),
});

export const withdrawalIdParamSchema = Joi.object({
    id: Joi.string().pattern(/^[a-fA-F0-9]{24}$/).required().messages({
        'string.pattern.base': 'Invalid withdrawal request.',
    }),
});
