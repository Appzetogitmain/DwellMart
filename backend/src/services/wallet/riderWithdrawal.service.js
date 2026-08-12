/**
 * riderWithdrawal.service
 *
 * The payout workflow: request → review → payout, with the money held in the
 * ledger at every step.
 *
 * Duplicate-payout defence is layered three deep, deliberately, because each
 * layer fails differently:
 *   1. `unique_open_withdrawal_per_rider` — a partial unique index. Two
 *      simultaneous submissions cannot both create an open request.
 *   2. Compare-and-set status transitions. Two admins approving the same
 *      request: one wins, the other gets a 409.
 *   3. `unique_withdrawal_gateway_reference` — one payout per UTR, so a
 *      re-submitted payout cannot be recorded twice even by a correct actor.
 *
 * Funds are locked at request time, not at approval. A rider cannot spend the
 * same balance twice while an approver deliberates.
 */

import mongoose from 'mongoose';
import RiderWithdrawalRequest, {
    WITHDRAWAL_OPEN_STATUSES,
} from '../../models/RiderWithdrawalRequest.model.js';
import RiderWallet from '../../models/RiderWallet.model.js';
import RiderWalletTransaction from '../../models/RiderWalletTransaction.model.js';
import AdminActivityLog from '../../models/AdminActivityLog.model.js';
import DeliveryBoy from '../../models/DeliveryBoy.model.js';
import Settings from '../../models/Settings.model.js';
import ApiError from '../../utils/ApiError.js';
import { postTransaction, getOrCreateWallet, transitionTransactions } from './riderWallet.service.js';
import { calculateRiderSettleableCash } from '../deliveryCash.service.js';
import { createNotification, notifyAdmins } from '../notification.service.js';
import { roundMoney } from '../PriceReconciliationService.js';

// ── Configurable policy ───────────────────────────────────────────────────────

export const DEFAULT_WITHDRAWAL_POLICY = {
    minWithdrawalAmount: 100,
    maxWithdrawalAmount: 25000,
    maxOpenRequestsPerDay: 3,
    payoutCoolingOffHours: 24,
    /** Block payout while unremitted COD cash exceeds this. 0 disables. */
    codInterlockThreshold: 2000,
};

/**
 * Read wallet policy from the `delivery` settings category, which already holds
 * `maxCodCashLimit`. Kept in one category so delivery-partner financial policy
 * is configured in one place rather than scattered.
 */
export const getWithdrawalPolicy = async () => {
    try {
        const doc = await Settings.findOne({ key: 'delivery' }).lean();
        const value = doc?.value || {};
        const pick = (key) => {
            const n = Number(value[key]);
            return Number.isFinite(n) && n >= 0 ? n : DEFAULT_WITHDRAWAL_POLICY[key];
        };
        return {
            minWithdrawalAmount: pick('minWithdrawalAmount'),
            maxWithdrawalAmount: pick('maxWithdrawalAmount'),
            maxOpenRequestsPerDay: pick('maxOpenRequestsPerDay'),
            payoutCoolingOffHours: pick('payoutCoolingOffHours'),
            codInterlockThreshold: pick('codInterlockThreshold'),
        };
    } catch (err) {
        console.warn(`[RiderWithdrawal] Failed to read delivery settings: ${err.message}`);
        return { ...DEFAULT_WITHDRAWAL_POLICY };
    }
};

const generateRequestNumber = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `RWD-${dateStr}-${rand}`;
};

const maskAccount = (accountNumber = '') => {
    const value = String(accountNumber || '');
    return value.length > 4 ? `••••${value.slice(-4)}` : value;
};

/** Freeze the payout destination as it stands right now. */
const buildPayoutSnapshot = (payoutDetails = {}) => ({
    method: payoutDetails.method,
    upiId: payoutDetails.upiId || '',
    accountNumberMasked: maskAccount(payoutDetails.accountNumber),
    ifsc: payoutDetails.ifscCode || '',
    accountName: payoutDetails.accountName || '',
    bankName: payoutDetails.bankName || '',
});

// ── Rider: create a withdrawal request ────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.deliveryBoyId
 * @param {number} params.amount
 * @param {string} [params.idempotencyKey]
 */
export const createWithdrawalRequest = async ({ deliveryBoyId, amount, idempotencyKey = null }) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) {
        throw new ApiError(400, 'A valid delivery partner is required.');
    }

    const requestedAmount = roundMoney(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        throw new ApiError(400, 'Withdrawal amount must be a positive number.');
    }

    // Replay guard before any state is touched.
    if (idempotencyKey) {
        const replay = await RiderWithdrawalRequest.findOne({ idempotencyKey }).lean();
        if (replay) return { request: replay, idempotentReplay: true };
    }

    const policy = await getWithdrawalPolicy();
    const wallet = await getOrCreateWallet(deliveryBoyId);

    if (wallet.isPayoutBlocked) {
        throw new ApiError(403, wallet.blockReason || 'Payouts are currently blocked on your account. Please contact support.');
    }

    const { getRawPayoutDetails } = await import('./riderPayoutDetails.service.js');
    const payout = await getRawPayoutDetails(deliveryBoyId);
    const hasDestination = payout.method === 'upi'
        ? Boolean(payout.upiId)
        : payout.method === 'bank_transfer'
            ? Boolean(payout.accountNumber && payout.ifscCode)
            : false;

    if (!hasDestination) {
        throw new ApiError(400, 'Add your UPI ID or bank account before requesting a withdrawal.');
    }

    if (payout.coolingOffUntil && new Date(payout.coolingOffUntil) > new Date()) {
        const until = new Date(payout.coolingOffUntil);
        throw new ApiError(
            403,
            `Your payout details changed recently. For your security, withdrawals resume after ${until.toLocaleString('en-IN')}.`
        );
    }

    if (requestedAmount < policy.minWithdrawalAmount) {
        throw new ApiError(400, `The minimum withdrawal amount is ₹${policy.minWithdrawalAmount}.`);
    }
    if (requestedAmount > policy.maxWithdrawalAmount) {
        throw new ApiError(400, `The maximum withdrawal amount is ₹${policy.maxWithdrawalAmount} per request.`);
    }

    const available = roundMoney(wallet.availableBalance);
    if (requestedAmount > available) {
        throw new ApiError(400, `Withdrawal amount (₹${requestedAmount}) exceeds your available balance (₹${available}).`);
    }

    // Velocity limit — bounds damage from a compromised rider account.
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const todayCount = await RiderWithdrawalRequest.countDocuments({
        deliveryBoyId,
        createdAt: { $gte: dayStart },
    });
    if (todayCount >= policy.maxOpenRequestsPerDay) {
        throw new ApiError(429, `You have reached the daily limit of ${policy.maxOpenRequestsPerDay} withdrawal requests.`);
    }

    // COD interlock — never pay a rider who is holding unremitted platform cash.
    const codCashInHand = await calculateRiderSettleableCash(deliveryBoyId);
    if (policy.codInterlockThreshold > 0 && codCashInHand > policy.codInterlockThreshold) {
        throw new ApiError(
            403,
            `Settle your pending COD cash (₹${codCashInHand}) before requesting a withdrawal. `
            + `The limit is ₹${policy.codInterlockThreshold}.`
        );
    }

    const session = await mongoose.startSession();
    try {
        let created = null;
        await session.withTransaction(async () => {
            const [request] = await RiderWithdrawalRequest.create([{
                requestNumber: generateRequestNumber(),
                deliveryBoyId,
                amount: requestedAmount,
                method: payout.method,
                payoutSnapshot: buildPayoutSnapshot(payout),
                status: 'pending',
                availableBalanceAtRequest: available,
                codCashInHandAtRequest: codCashInHand,
                idempotencyKey: idempotencyKey || undefined,
                requestedAt: new Date(),
            }], { session });

            // Lock the funds now: AVAILABLE is debited, LOCKED is credited by
            // the paired hold entry, so the same balance cannot be requested
            // twice while an approver deliberates.
            const { transaction: holdDebit } = await postTransaction({
                deliveryBoyId,
                amount: requestedAmount,
                type: 'WITHDRAWAL_HOLD',
                state: 'AVAILABLE',
                withdrawalId: request._id,
                description: `Funds held for withdrawal ${request.requestNumber}`,
                createdBy: deliveryBoyId,
                createdByType: 'delivery',
                session,
            });

            await postTransaction({
                deliveryBoyId,
                amount: requestedAmount,
                type: 'WITHDRAWAL_LOCK',
                state: 'LOCKED',
                withdrawalId: request._id,
                description: `Locked against withdrawal ${request.requestNumber}`,
                createdBy: deliveryBoyId,
                createdByType: 'delivery',
                session,
            });

            await RiderWithdrawalRequest.updateOne(
                { _id: request._id },
                { $set: { holdTransactionId: holdDebit._id } },
                { session }
            );

            created = request;
        });

        const rider = await DeliveryBoy.findById(deliveryBoyId).select('name').lean();
        notifyAdmins({
            anchorId: created._id,
            title: 'Rider Withdrawal Requested',
            message: `${rider?.name || 'A delivery partner'} requested a payout of ₹${requestedAmount} (${created.requestNumber}).`,
            type: 'payment',
            category: 'PAYMENT',
            priority: 'HIGH',
            actionUrl: '/admin/delivery/rider-payouts',
            data: {
                withdrawalId: String(created._id),
                requestNumber: created.requestNumber,
                amount: String(requestedAmount),
            },
        }).catch(() => null);

        return { request: created, idempotentReplay: false };
    } catch (err) {
        if (err?.code === 11000) {
            throw new ApiError(409, 'You already have a withdrawal request in progress. Please wait for it to be reviewed.');
        }
        throw err;
    } finally {
        await session.endSession();
    }
};

/**
 * Release a hold back to AVAILABLE. Shared by cancel, reject, and payout
 * failure so the three paths cannot drift apart.
 */
const releaseHold = async ({ request, reason, session }) => {
    const locked = await RiderWalletTransaction.find({
        withdrawalId: request._id,
        state: 'LOCKED',
    }).session(session).lean();

    if (locked.length > 0) {
        await transitionTransactions({
            deliveryBoyId: request.deliveryBoyId,
            transactionIds: locked.map((t) => t._id),
            fromState: 'LOCKED',
            toState: 'REVERSED',
            session,
        });
    }

    const { transaction } = await postTransaction({
        deliveryBoyId: request.deliveryBoyId,
        amount: request.amount,
        type: 'WITHDRAWAL_REVERSAL',
        state: 'AVAILABLE',
        withdrawalId: request._id,
        description: `Hold released for withdrawal ${request.requestNumber}`,
        notes: String(reason || '').trim(),
        session,
    });

    return transaction;
};

// ── Rider: cancel own request ─────────────────────────────────────────────────

export const cancelWithdrawalRequest = async ({ withdrawalId, deliveryBoyId }) => {
    if (!mongoose.isValidObjectId(withdrawalId)) {
        throw new ApiError(400, 'Invalid withdrawal request.');
    }

    const session = await mongoose.startSession();
    try {
        let updated = null;
        await session.withTransaction(async () => {
            // Ownership is part of the filter, not a separate check — a rider
            // cannot cancel someone else's request even by guessing an id.
            // Only 'pending' is cancellable: once an admin has approved it the
            // payout may already be in flight.
            const request = await RiderWithdrawalRequest.findOneAndUpdate(
                { _id: withdrawalId, deliveryBoyId, status: 'pending' },
                {
                    $set: {
                        status: 'cancelled',
                        rejectionReason: 'Cancelled by the delivery partner.',
                        reviewedAt: new Date(),
                    },
                },
                { new: true, session }
            );

            if (!request) {
                throw new ApiError(409, 'This request can no longer be cancelled. It may already have been reviewed.');
            }

            const reversal = await releaseHold({
                request,
                reason: 'Withdrawal cancelled by rider.',
                session,
            });

            await RiderWithdrawalRequest.updateOne(
                { _id: request._id },
                { $set: { reversalTransactionId: reversal._id } },
                { session }
            );

            updated = request;
        });
        return updated;
    } finally {
        await session.endSession();
    }
};

// ── Admin: approve ────────────────────────────────────────────────────────────

export const approveWithdrawalRequest = async ({ withdrawalId, adminId, notes = '', ipAddress = '' }) => {
    if (!mongoose.isValidObjectId(withdrawalId)) {
        throw new ApiError(400, 'Invalid withdrawal request.');
    }

    // Compare-and-set: a second admin approving concurrently loses and is told.
    const request = await RiderWithdrawalRequest.findOneAndUpdate(
        { _id: withdrawalId, status: 'pending' },
        {
            $set: {
                status: 'approved',
                reviewedBy: adminId || null,
                reviewedAt: new Date(),
                adminNotes: String(notes || '').trim(),
            },
        },
        { new: true }
    );

    if (!request) {
        throw new ApiError(409, 'This request was already processed by another administrator.');
    }

    await AdminActivityLog.create({
        performedBy: adminId,
        action: 'rider_withdrawal_approved',
        details: {
            withdrawalId: String(request._id),
            requestNumber: request.requestNumber,
            deliveryBoyId: String(request.deliveryBoyId),
            amount: request.amount,
            notes: String(notes || '').trim(),
        },
        ipAddress,
    }).catch((err) => console.warn(`[RiderWithdrawal] Audit log failed: ${err.message}`));

    createNotification({
        recipientId: request.deliveryBoyId,
        recipientType: 'delivery',
        title: 'Withdrawal Approved',
        message: `Your withdrawal of ₹${request.amount} (${request.requestNumber}) was approved and is being processed.`,
        type: 'payment',
        category: 'PAYMENT',
        priority: 'HIGH',
        actionUrl: '/delivery/wallet',
        data: { withdrawalId: String(request._id), requestNumber: request.requestNumber },
    }).catch(() => null);

    return request;
};

// ── Admin: reject ─────────────────────────────────────────────────────────────

export const rejectWithdrawalRequest = async ({ withdrawalId, adminId, reason, ipAddress = '' }) => {
    if (!mongoose.isValidObjectId(withdrawalId)) {
        throw new ApiError(400, 'Invalid withdrawal request.');
    }

    const trimmedReason = String(reason || '').trim();
    if (trimmedReason.length < 5) {
        throw new ApiError(400, 'A rejection reason of at least 5 characters is required.');
    }

    const session = await mongoose.startSession();
    try {
        let updated = null;
        await session.withTransaction(async () => {
            const request = await RiderWithdrawalRequest.findOneAndUpdate(
                { _id: withdrawalId, status: { $in: ['pending', 'approved'] } },
                {
                    $set: {
                        status: 'rejected',
                        rejectionReason: trimmedReason,
                        reviewedBy: adminId || null,
                        reviewedAt: new Date(),
                    },
                },
                { new: true, session }
            );

            if (!request) {
                throw new ApiError(409, 'This request was already processed by another administrator.');
            }

            const reversal = await releaseHold({ request, reason: trimmedReason, session });
            await RiderWithdrawalRequest.updateOne(
                { _id: request._id },
                { $set: { reversalTransactionId: reversal._id } },
                { session }
            );

            updated = request;
        });

        await AdminActivityLog.create({
            performedBy: adminId,
            action: 'rider_withdrawal_rejected',
            details: {
                withdrawalId: String(updated._id),
                requestNumber: updated.requestNumber,
                deliveryBoyId: String(updated.deliveryBoyId),
                amount: updated.amount,
                reason: trimmedReason,
            },
            ipAddress,
        }).catch((err) => console.warn(`[RiderWithdrawal] Audit log failed: ${err.message}`));

        createNotification({
            recipientId: updated.deliveryBoyId,
            recipientType: 'delivery',
            title: 'Withdrawal Rejected',
            message: `Your withdrawal of ₹${updated.amount} (${updated.requestNumber}) was rejected and the funds returned to your available balance. Reason: ${trimmedReason}`,
            type: 'payment',
            category: 'PAYMENT',
            priority: 'HIGH',
            actionUrl: '/delivery/wallet',
            data: { withdrawalId: String(updated._id), reason: trimmedReason },
        }).catch(() => null);

        return updated;
    } finally {
        await session.endSession();
    }
};

// ── Admin: mark paid ──────────────────────────────────────────────────────────

/**
 * Record that money actually left the platform.
 *
 * The UTR is mandatory and uniquely indexed: a payout cannot be recorded twice
 * even if an administrator submits the form twice, and every payout is tied to a
 * bank reference that can be reconciled against a statement.
 */
export const markWithdrawalPaid = async ({
    withdrawalId,
    adminId,
    utr,
    gatewayReference = null,
    notes = '',
    ipAddress = '',
}) => {
    if (!mongoose.isValidObjectId(withdrawalId)) {
        throw new ApiError(400, 'Invalid withdrawal request.');
    }

    const trimmedUtr = String(utr || '').trim();
    if (trimmedUtr.length < 6) {
        throw new ApiError(400, 'A valid UTR / bank reference (at least 6 characters) is required to record a payout.');
    }

    const session = await mongoose.startSession();
    try {
        let updated = null;
        await session.withTransaction(async () => {
            const request = await RiderWithdrawalRequest.findOneAndUpdate(
                { _id: withdrawalId, status: { $in: ['approved', 'processing'] } },
                {
                    $set: {
                        status: 'paid',
                        utr: trimmedUtr,
                        gatewayReference: gatewayReference || trimmedUtr,
                        paidBy: adminId || null,
                        paidAt: new Date(),
                        ...(notes ? { adminNotes: String(notes).trim() } : {}),
                    },
                },
                { new: true, session }
            );

            if (!request) {
                throw new ApiError(409, 'This request is not awaiting payout, or was already paid by another administrator.');
            }

            // Retire the locked rows, then post the settlement debit.
            const locked = await RiderWalletTransaction.find({
                withdrawalId: request._id,
                state: 'LOCKED',
            }).session(session).lean();

            if (locked.length > 0) {
                await transitionTransactions({
                    deliveryBoyId: request.deliveryBoyId,
                    transactionIds: locked.map((t) => t._id),
                    fromState: 'LOCKED',
                    toState: 'SETTLED',
                    session,
                });
            }

            const { transaction: payoutTx } = await postTransaction({
                deliveryBoyId: request.deliveryBoyId,
                amount: request.amount,
                type: 'WITHDRAWAL_PAID',
                state: 'SETTLED',
                withdrawalId: request._id,
                description: `Payout for withdrawal ${request.requestNumber} (UTR ${trimmedUtr})`,
                createdBy: adminId,
                createdByType: 'admin',
                session,
            });

            await RiderWithdrawalRequest.updateOne(
                { _id: request._id },
                { $set: { payoutTransactionId: payoutTx._id } },
                { session }
            );

            updated = request;
        });

        await AdminActivityLog.create({
            performedBy: adminId,
            action: 'rider_withdrawal_paid',
            details: {
                withdrawalId: String(updated._id),
                requestNumber: updated.requestNumber,
                deliveryBoyId: String(updated.deliveryBoyId),
                amount: updated.amount,
                utr: trimmedUtr,
            },
            ipAddress,
        }).catch((err) => console.warn(`[RiderWithdrawal] Audit log failed: ${err.message}`));

        createNotification({
            recipientId: updated.deliveryBoyId,
            recipientType: 'delivery',
            title: 'Payout Sent',
            message: `₹${updated.amount} has been paid to your ${updated.method === 'upi' ? 'UPI ID' : 'bank account'}. Reference: ${trimmedUtr}`,
            type: 'payment',
            category: 'PAYMENT',
            priority: 'HIGH',
            actionUrl: '/delivery/wallet',
            data: {
                withdrawalId: String(updated._id),
                requestNumber: updated.requestNumber,
                amount: String(updated.amount),
                utr: trimmedUtr,
            },
        }).catch(() => null);

        return updated;
    } catch (err) {
        if (err?.code === 11000) {
            throw new ApiError(409, 'This bank reference has already been recorded against another payout.');
        }
        throw err;
    } finally {
        await session.endSession();
    }
};

// ── Admin: mark failed ────────────────────────────────────────────────────────

export const markWithdrawalFailed = async ({ withdrawalId, adminId, reason, ipAddress = '' }) => {
    if (!mongoose.isValidObjectId(withdrawalId)) {
        throw new ApiError(400, 'Invalid withdrawal request.');
    }

    const trimmedReason = String(reason || '').trim();
    if (trimmedReason.length < 5) {
        throw new ApiError(400, 'A failure reason of at least 5 characters is required.');
    }

    const session = await mongoose.startSession();
    try {
        let updated = null;
        await session.withTransaction(async () => {
            const request = await RiderWithdrawalRequest.findOneAndUpdate(
                { _id: withdrawalId, status: { $in: ['approved', 'processing'] } },
                {
                    $set: {
                        status: 'failed',
                        failureReason: trimmedReason,
                        reviewedBy: adminId || null,
                        reviewedAt: new Date(),
                    },
                },
                { new: true, session }
            );

            if (!request) {
                throw new ApiError(409, 'This request is not in a state that can be marked failed.');
            }

            const reversal = await releaseHold({ request, reason: trimmedReason, session });
            await RiderWithdrawalRequest.updateOne(
                { _id: request._id },
                { $set: { reversalTransactionId: reversal._id } },
                { session }
            );

            updated = request;
        });

        await AdminActivityLog.create({
            performedBy: adminId,
            action: 'rider_withdrawal_failed',
            details: {
                withdrawalId: String(updated._id),
                requestNumber: updated.requestNumber,
                amount: updated.amount,
                reason: trimmedReason,
            },
            ipAddress,
        }).catch(() => null);

        createNotification({
            recipientId: updated.deliveryBoyId,
            recipientType: 'delivery',
            title: 'Payout Failed',
            message: `The payout of ₹${updated.amount} could not be completed and the funds are back in your available balance. Reason: ${trimmedReason}`,
            type: 'payment',
            category: 'PAYMENT',
            priority: 'HIGH',
            actionUrl: '/delivery/wallet',
            data: { withdrawalId: String(updated._id), reason: trimmedReason },
        }).catch(() => null);

        return updated;
    } finally {
        await session.endSession();
    }
};

// ── Admin: manual adjustment ──────────────────────────────────────────────────

/**
 * Post a signed correction against a rider's wallet.
 *
 * The counterpart to `postCashAdjustment` on the COD ledger. Positive credits
 * the rider (a missed incentive, a goodwill payment); negative debits them (a
 * penalty, an over-payment recovery).
 */
export const adjustRiderWallet = async ({
    deliveryBoyId,
    amount,
    reason,
    adminId,
    ipAddress = '',
}) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) {
        throw new ApiError(400, 'A valid delivery partner is required.');
    }

    const signed = Number(amount);
    if (!Number.isFinite(signed) || signed === 0) {
        throw new ApiError(400, 'Adjustment amount must be a non-zero number.');
    }

    const trimmedReason = String(reason || '').trim();
    if (trimmedReason.length < 5) {
        throw new ApiError(400, 'A reason of at least 5 characters is required for every wallet adjustment.');
    }

    const rider = await DeliveryBoy.findById(deliveryBoyId).select('name').lean();
    if (!rider) throw new ApiError(404, 'Delivery partner not found.');

    const { transaction, wallet } = await postTransaction({
        deliveryBoyId,
        amount: Math.abs(signed),
        type: signed > 0 ? 'ADJUSTMENT' : 'PENALTY',
        state: 'AVAILABLE',
        description: signed > 0 ? 'Manual credit adjustment' : 'Manual debit adjustment',
        notes: trimmedReason,
        createdBy: adminId,
        createdByType: 'admin',
    });

    await AdminActivityLog.create({
        performedBy: adminId,
        action: 'rider_wallet_adjusted',
        details: {
            deliveryBoyId: String(deliveryBoyId),
            riderName: rider.name,
            amount: signed,
            reason: trimmedReason,
            transactionId: String(transaction._id),
            newAvailableBalance: wallet.availableBalance,
        },
        ipAddress,
    }).catch((err) => console.warn(`[RiderWithdrawal] Audit log failed: ${err.message}`));

    createNotification({
        recipientId: deliveryBoyId,
        recipientType: 'delivery',
        title: signed > 0 ? 'Wallet Credit Applied' : 'Wallet Deduction Applied',
        message: `₹${Math.abs(signed).toFixed(2)} was ${signed > 0 ? 'credited to' : 'deducted from'} your wallet. Reason: ${trimmedReason}`,
        type: 'payment',
        category: 'PAYMENT',
        priority: 'HIGH',
        actionUrl: '/delivery/wallet',
        data: { amount: String(signed), reason: trimmedReason },
    }).catch(() => null);

    return { transaction, wallet };
};

/** Block or unblock payouts for a rider during an investigation. */
export const setPayoutBlock = async ({ deliveryBoyId, blocked, reason, adminId, ipAddress = '' }) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) {
        throw new ApiError(400, 'A valid delivery partner is required.');
    }
    const trimmedReason = String(reason || '').trim();
    if (blocked && trimmedReason.length < 5) {
        throw new ApiError(400, 'A reason of at least 5 characters is required to block payouts.');
    }

    const wallet = await RiderWallet.findOneAndUpdate(
        { deliveryBoyId },
        {
            $set: {
                isPayoutBlocked: Boolean(blocked),
                blockReason: blocked ? trimmedReason : '',
                blockedBy: blocked ? adminId : null,
                blockedAt: blocked ? new Date() : null,
            },
            $inc: { version: 1 },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await AdminActivityLog.create({
        performedBy: adminId,
        action: blocked ? 'rider_payout_blocked' : 'rider_payout_unblocked',
        details: { deliveryBoyId: String(deliveryBoyId), reason: trimmedReason },
        ipAddress,
    }).catch(() => null);

    return wallet;
};

export { WITHDRAWAL_OPEN_STATUSES };
