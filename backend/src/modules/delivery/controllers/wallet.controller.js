/**
 * Delivery partner wallet endpoints.
 *
 * Every handler derives the rider identity from `req.user.id` and never from
 * the request body or params. A rider id supplied by the client is ignored, so
 * no endpoint here can be pointed at another rider's money.
 */

import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import RiderWalletTransaction from '../../../models/RiderWalletTransaction.model.js';
import RiderWithdrawalRequest from '../../../models/RiderWithdrawalRequest.model.js';
import { getWalletSummary } from '../../../services/wallet/riderWallet.service.js';
import {
    createWithdrawalRequest,
    cancelWithdrawalRequest,
    getWithdrawalPolicy,
} from '../../../services/wallet/riderWithdrawal.service.js';
import {
    getPayoutDetails,
    updatePayoutDetails,
} from '../../../services/wallet/riderPayoutDetails.service.js';
import { roundMoney } from '../../../services/PriceReconciliationService.js';

// ── GET /api/delivery/wallet/summary ──────────────────────────────────────────

export const getWallet = asyncHandler(async (req, res) => {
    const [summary, policy] = await Promise.all([
        getWalletSummary(req.user.id),
        getWithdrawalPolicy(),
    ]);

    // Everything the UI needs to decide whether the Withdraw button is enabled,
    // and — when it is not — exactly why. A disabled control with no stated
    // reason is the usability failure this payload exists to prevent.
    const blockers = [];
    if (summary.isPayoutBlocked) {
        blockers.push({ code: 'PAYOUT_BLOCKED', message: summary.blockReason || 'Payouts are blocked on your account.' });
    }
    if (!summary.hasPayoutDetails) {
        blockers.push({ code: 'NO_PAYOUT_DETAILS', message: 'Add your UPI ID or bank account to withdraw.' });
    }
    if (summary.payoutDetails?.isInCoolingOff) {
        blockers.push({
            code: 'COOLING_OFF',
            message: `Payout details changed recently. Withdrawals resume on ${new Date(summary.payoutDetails.coolingOffUntil).toLocaleString('en-IN')}.`,
        });
    }
    if (summary.openWithdrawal) {
        blockers.push({ code: 'OPEN_REQUEST', message: 'You already have a withdrawal in progress.' });
    }
    if (summary.availableBalance < policy.minWithdrawalAmount) {
        blockers.push({
            code: 'BELOW_MINIMUM',
            message: `You need at least ₹${policy.minWithdrawalAmount} available to withdraw.`,
        });
    }
    if (policy.codInterlockThreshold > 0 && summary.codCashInHand > policy.codInterlockThreshold) {
        blockers.push({
            code: 'COD_INTERLOCK',
            message: `Settle your pending COD cash (₹${summary.codCashInHand}) before withdrawing.`,
        });
    }

    return res.status(200).json(
        new ApiResponse(200, {
            ...summary,
            policy,
            canWithdraw: blockers.length === 0,
            blockers,
        }, 'Wallet summary fetched.')
    );
});

// ── GET /api/delivery/wallet/transactions ─────────────────────────────────────

export const getTransactions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, type, state, from, to } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { deliveryBoyId: req.user.id };
    if (type && type !== 'all') filter.type = type;
    if (state && state !== 'all') filter.state = state;
    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }

    const [transactions, total] = await Promise.all([
        RiderWalletTransaction.find(filter)
            .populate('orderId', 'orderId total createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        RiderWalletTransaction.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(200, {
            transactions,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit) || 1,
            },
        }, 'Wallet transactions fetched.')
    );
});

// ── GET /api/delivery/wallet/statement ────────────────────────────────────────

/**
 * Date-ranged statement with opening and closing balances.
 *
 * The opening balance is derived by replaying every entry before the window
 * rather than read from a cached figure, so a statement always reconciles even
 * if the projection has drifted.
 */
export const getStatement = asyncHandler(async (req, res) => {
    const { from, to, format = 'json' } = req.query;

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : new Date();

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        throw new ApiError(400, 'Provide valid from and to dates.');
    }
    if (fromDate > toDate) {
        throw new ApiError(400, 'The start date must be before the end date.');
    }

    const riderObjectId = new mongoose.Types.ObjectId(String(req.user.id));

    const [openingRows, entries] = await Promise.all([
        RiderWalletTransaction.aggregate([
            { $match: { deliveryBoyId: riderObjectId, createdAt: { $lt: fromDate } } },
            {
                $group: {
                    _id: null,
                    net: {
                        $sum: {
                            $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount', { $multiply: ['$amount', -1] }],
                        },
                    },
                },
            },
        ]),
        RiderWalletTransaction.find({
            deliveryBoyId: req.user.id,
            createdAt: { $gte: fromDate, $lte: toDate },
        })
            .populate('orderId', 'orderId')
            .sort({ createdAt: 1 })
            .lean(),
    ]);

    const openingBalance = roundMoney(openingRows?.[0]?.net || 0);

    let running = openingBalance;
    const lines = entries.map((entry) => {
        const delta = entry.direction === 'CREDIT' ? entry.amount : -entry.amount;
        running = roundMoney(running + delta);
        return {
            date: entry.createdAt,
            type: entry.type,
            state: entry.state,
            description: entry.description || '',
            orderId: entry.orderId?.orderId || null,
            credit: entry.direction === 'CREDIT' ? entry.amount : 0,
            debit: entry.direction === 'DEBIT' ? entry.amount : 0,
            balance: running,
        };
    });

    const payload = {
        from: fromDate,
        to: toDate,
        openingBalance,
        closingBalance: running,
        totalCredits: roundMoney(lines.reduce((s, l) => s + l.credit, 0)),
        totalDebits: roundMoney(lines.reduce((s, l) => s + l.debit, 0)),
        lines,
    };

    if (String(format).toLowerCase() === 'csv') {
        const header = 'Date,Type,State,Description,Order,Credit,Debit,Balance';
        const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const rows = lines.map((line) => [
            new Date(line.date).toISOString(),
            line.type,
            line.state,
            escape(line.description),
            line.orderId || '',
            line.credit,
            line.debit,
            line.balance,
        ].join(','));

        const csv = [
            `Opening Balance,,,,,,,${openingBalance}`,
            header,
            ...rows,
            `Closing Balance,,,,,,,${running}`,
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="wallet-statement-${fromDate.toISOString().slice(0, 10)}-to-${toDate.toISOString().slice(0, 10)}.csv"`
        );
        return res.status(200).send(csv);
    }

    return res.status(200).json(new ApiResponse(200, payload, 'Wallet statement generated.'));
});

// ── POST /api/delivery/wallet/withdrawals ─────────────────────────────────────

export const createWithdrawal = asyncHandler(async (req, res) => {
    const idempotencyKey = String(req.get('x-idempotency-key') || '').trim() || null;

    const { request, idempotentReplay } = await createWithdrawalRequest({
        deliveryBoyId: req.user.id,
        amount: req.body.amount,
        // Scope the key to the rider so two riders cannot collide on one value.
        idempotencyKey: idempotencyKey ? `rider:${req.user.id}:${idempotencyKey}` : null,
    });

    return res.status(idempotentReplay ? 200 : 201).json(
        new ApiResponse(
            idempotentReplay ? 200 : 201,
            { request, ...(idempotentReplay ? { idempotentReplay: true } : {}) },
            idempotentReplay
                ? 'Duplicate withdrawal request ignored. Returning the existing request.'
                : 'Withdrawal request submitted for review.'
        )
    );
});

// ── GET /api/delivery/wallet/withdrawals ──────────────────────────────────────

export const getWithdrawals = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { deliveryBoyId: req.user.id };
    if (status && status !== 'all') filter.status = status;

    const [requests, total] = await Promise.all([
        RiderWithdrawalRequest.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        RiderWithdrawalRequest.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(200, {
            requests,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit) || 1,
            },
        }, 'Withdrawal history fetched.')
    );
});

// ── POST /api/delivery/wallet/withdrawals/:id/cancel ──────────────────────────

export const cancelWithdrawal = asyncHandler(async (req, res) => {
    const request = await cancelWithdrawalRequest({
        withdrawalId: req.params.id,
        deliveryBoyId: req.user.id,
    });

    return res.status(200).json(
        new ApiResponse(200, request, 'Withdrawal request cancelled and funds returned to your available balance.')
    );
});

// ── GET / PUT /api/delivery/wallet/payout-details ─────────────────────────────

export const getRiderPayoutDetails = asyncHandler(async (req, res) => {
    const details = await getPayoutDetails(req.user.id);
    return res.status(200).json(new ApiResponse(200, details, 'Payout details fetched.'));
});

export const updateRiderPayoutDetails = asyncHandler(async (req, res) => {
    const details = await updatePayoutDetails({
        deliveryBoyId: req.user.id,
        ...req.body,
    });
    return res.status(200).json(new ApiResponse(200, details, 'Payout details updated.'));
});
