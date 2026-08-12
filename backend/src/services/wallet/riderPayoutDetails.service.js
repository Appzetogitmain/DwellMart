/**
 * riderPayoutDetails.service
 *
 * Where a rider's payout money goes, and the guard rails around changing it.
 *
 * Changing a payout destination is the highest-value action a compromised rider
 * account can take, so a change is treated as a security event rather than a
 * profile edit: it clears verification, starts a cooling-off clock the
 * withdrawal path refuses to pay through, notifies the rider on their existing
 * channels, and is written to the audit trail.
 */

import mongoose from 'mongoose';
import DeliveryBoy from '../../models/DeliveryBoy.model.js';
import RiderWithdrawalRequest, {
    WITHDRAWAL_OPEN_STATUSES,
} from '../../models/RiderWithdrawalRequest.model.js';
import AdminActivityLog from '../../models/AdminActivityLog.model.js';
import ApiError from '../../utils/ApiError.js';
import { createNotification } from '../notification.service.js';
import { getWithdrawalPolicy } from './riderWithdrawal.service.js';

const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,32}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_PATTERN = /^\d{6,18}$/;

/** Mask an account number for any response that leaves the server. */
export const maskAccountNumber = (accountNumber = '') => {
    const value = String(accountNumber || '');
    return value.length > 4 ? `••••${value.slice(-4)}` : value;
};

/**
 * Safe projection of a rider's payout details.
 * The full account number is never returned to any caller, rider or admin —
 * it exists to be paid to, not to be read back.
 */
export const toPublicPayoutDetails = (payoutDetails = {}) => {
    const details = payoutDetails || {};
    const coolingOffUntil = details.coolingOffUntil || null;

    return {
        method: details.method || null,
        upiId: details.upiId || '',
        accountName: details.accountName || '',
        accountNumberMasked: maskAccountNumber(details.accountNumber),
        ifscCode: details.ifscCode || '',
        bankName: details.bankName || '',
        isVerified: Boolean(details.verifiedAt),
        verifiedAt: details.verifiedAt || null,
        lastChangedAt: details.lastChangedAt || null,
        coolingOffUntil,
        isInCoolingOff: Boolean(coolingOffUntil && new Date(coolingOffUntil) > new Date()),
        isComplete: details.method === 'upi'
            ? Boolean(details.upiId)
            : details.method === 'bank_transfer'
                ? Boolean(details.accountNumber && details.ifscCode && details.accountName)
                : false,
    };
};

/** Read the raw stored details — internal callers only (withdrawal path). */
export const getRawPayoutDetails = async (deliveryBoyId) => {
    const rider = await DeliveryBoy.findById(deliveryBoyId).select('+payoutDetails payoutDetails').lean();
    return rider?.payoutDetails || {};
};

export const getPayoutDetails = async (deliveryBoyId) =>
    toPublicPayoutDetails(await getRawPayoutDetails(deliveryBoyId));

/**
 * Create or replace a rider's payout destination.
 *
 * Refused while a withdrawal is open: money already in flight must land at the
 * destination the reviewer approved, not at one substituted afterwards.
 */
export const updatePayoutDetails = async ({ deliveryBoyId, method, upiId, accountName, accountNumber, ifscCode, bankName }) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) {
        throw new ApiError(400, 'A valid delivery partner is required.');
    }

    const normalizedMethod = String(method || '').trim().toLowerCase();
    if (!['upi', 'bank_transfer'].includes(normalizedMethod)) {
        throw new ApiError(400, 'Payout method must be either UPI or bank transfer.');
    }

    const openRequest = await RiderWithdrawalRequest.findOne({
        deliveryBoyId,
        status: { $in: WITHDRAWAL_OPEN_STATUSES },
    }).select('requestNumber').lean();

    if (openRequest) {
        throw new ApiError(
            409,
            `Payout details cannot change while withdrawal ${openRequest.requestNumber} is in progress. Cancel or wait for it to complete.`
        );
    }

    const next = {
        method: normalizedMethod,
        upiId: '',
        accountName: '',
        accountNumber: '',
        ifscCode: '',
        bankName: '',
    };

    if (normalizedMethod === 'upi') {
        const trimmedUpi = String(upiId || '').trim();
        if (!UPI_PATTERN.test(trimmedUpi)) {
            throw new ApiError(400, 'Enter a valid UPI ID, for example name@bank.');
        }
        next.upiId = trimmedUpi;
        next.accountName = String(accountName || '').trim();
    } else {
        const trimmedAccount = String(accountNumber || '').replace(/\s+/g, '');
        const trimmedIfsc = String(ifscCode || '').trim().toUpperCase();
        const trimmedName = String(accountName || '').trim();

        if (!ACCOUNT_PATTERN.test(trimmedAccount)) {
            throw new ApiError(400, 'Enter a valid bank account number (6 to 18 digits).');
        }
        if (!IFSC_PATTERN.test(trimmedIfsc)) {
            throw new ApiError(400, 'Enter a valid IFSC code, for example HDFC0001234.');
        }
        if (trimmedName.length < 3) {
            throw new ApiError(400, 'Enter the account holder name as it appears on the bank account.');
        }

        next.accountNumber = trimmedAccount;
        next.ifscCode = trimmedIfsc;
        next.accountName = trimmedName;
        next.bankName = String(bankName || '').trim();
    }

    const existing = await getRawPayoutDetails(deliveryBoyId);
    const isFirstSetup = !existing?.method;

    // Detect a genuine destination change; re-saving identical details should
    // not restart the cooling-off clock and lock the rider out needlessly.
    const destinationChanged = isFirstSetup
        || existing.method !== next.method
        || (existing.upiId || '') !== next.upiId
        || (existing.accountNumber || '') !== next.accountNumber
        || (existing.ifscCode || '') !== next.ifscCode;

    const policy = await getWithdrawalPolicy();
    const now = new Date();

    const update = { ...next };
    if (destinationChanged) {
        // A change invalidates prior verification and starts the clock.
        update.verifiedAt = null;
        update.verifiedBy = null;
        update.lastChangedAt = now;
        update.coolingOffUntil = isFirstSetup
            ? null // First-time setup has nothing to protect against yet.
            : new Date(now.getTime() + policy.payoutCoolingOffHours * 60 * 60 * 1000);
    } else {
        update.verifiedAt = existing.verifiedAt || null;
        update.verifiedBy = existing.verifiedBy || null;
        update.lastChangedAt = existing.lastChangedAt || now;
        update.coolingOffUntil = existing.coolingOffUntil || null;
    }

    const rider = await DeliveryBoy.findByIdAndUpdate(
        deliveryBoyId,
        { $set: { payoutDetails: update } },
        { new: true }
    ).select('name payoutDetails');

    if (!rider) throw new ApiError(404, 'Delivery partner not found.');

    if (destinationChanged && !isFirstSetup) {
        createNotification({
            recipientId: deliveryBoyId,
            recipientType: 'delivery',
            title: 'Payout Details Changed',
            message: `Your payout destination was updated. For your security, withdrawals are paused until ${update.coolingOffUntil.toLocaleString('en-IN')}. If this was not you, contact support immediately.`,
            type: 'system',
            category: 'WARNING',
            priority: 'CRITICAL',
            actionUrl: '/delivery/wallet',
            data: { coolingOffUntil: update.coolingOffUntil.toISOString() },
        }).catch(() => null);
    }

    return toPublicPayoutDetails(rider.payoutDetails);
};

/**
 * Admin confirmation that a destination is genuine.
 *
 * Verification also clears the cooling-off window: an administrator who has
 * checked the account is a stronger signal than the elapsed-time proxy the
 * window stands in for.
 */
export const verifyPayoutDetails = async ({ deliveryBoyId, adminId, ipAddress = '' }) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) {
        throw new ApiError(400, 'A valid delivery partner is required.');
    }

    const existing = await getRawPayoutDetails(deliveryBoyId);
    if (!existing?.method) {
        throw new ApiError(400, 'This delivery partner has not added payout details yet.');
    }

    const rider = await DeliveryBoy.findByIdAndUpdate(
        deliveryBoyId,
        {
            $set: {
                'payoutDetails.verifiedAt': new Date(),
                'payoutDetails.verifiedBy': adminId || null,
                'payoutDetails.coolingOffUntil': null,
            },
        },
        { new: true }
    ).select('name payoutDetails');

    if (!rider) throw new ApiError(404, 'Delivery partner not found.');

    await AdminActivityLog.create({
        performedBy: adminId,
        action: 'rider_payout_details_verified',
        details: {
            deliveryBoyId: String(deliveryBoyId),
            riderName: rider.name,
            method: existing.method,
            destination: existing.method === 'upi'
                ? existing.upiId
                : maskAccountNumber(existing.accountNumber),
        },
        ipAddress,
    }).catch((err) => console.warn(`[RiderPayoutDetails] Audit log failed: ${err.message}`));

    createNotification({
        recipientId: deliveryBoyId,
        recipientType: 'delivery',
        title: 'Payout Details Verified',
        message: 'Your payout details have been verified. You can now request withdrawals.',
        type: 'payment',
        category: 'SUCCESS',
        actionUrl: '/delivery/wallet',
    }).catch(() => null);

    return toPublicPayoutDetails(rider.payoutDetails);
};
