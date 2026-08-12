/**
 * Admin rider wallet & payout endpoints.
 *
 * Every mutating handler passes `req.user.id` (the JWT payload's admin id) and
 * `req.ip` down to the service, which writes both to `AdminActivityLog`. No
 * money moves here without a named actor.
 */

import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';

import RiderWallet from '../../../models/RiderWallet.model.js';
import RiderWalletTransaction from '../../../models/RiderWalletTransaction.model.js';
import RiderWithdrawalRequest from '../../../models/RiderWithdrawalRequest.model.js';
import RiderRateCard from '../../../models/RiderRateCard.model.js';
import AdminActivityLog from '../../../models/AdminActivityLog.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';

import {
    approveWithdrawalRequest,
    rejectWithdrawalRequest,
    markWithdrawalPaid,
    markWithdrawalFailed,
    adjustRiderWallet,
    setPayoutBlock,
} from '../../../services/wallet/riderWithdrawal.service.js';
import { rebuildWallet, getWalletSummary } from '../../../services/wallet/riderWallet.service.js';
import { verifyPayoutDetails, getPayoutDetails } from '../../../services/wallet/riderPayoutDetails.service.js';
import { reverseDeliveryEarning } from '../../../services/wallet/riderEarnings.service.js';
import { calculateRiderCashInHandBulk } from '../../../services/deliveryCash.service.js';
import {
    getWalletDashboard,
    getReconciliationDrift,
} from '../../../services/wallet/walletAnalytics.service.js';
import { roundMoney } from '../../../services/PriceReconciliationService.js';

const clientIp = (req) => req.ip || req.headers['x-forwarded-for'] || '';

// ── GET /api/admin/rider-wallets ──────────────────────────────────────────────

export const listRiderWallets = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search = '', blocked, sort = 'available' } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (blocked === 'true') filter.isPayoutBlocked = true;
    if (blocked === 'false') filter.isPayoutBlocked = { $ne: true };

    const trimmedSearch = String(search || '').trim();
    if (trimmedSearch) {
        const safeRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const riders = await DeliveryBoy.find({
            $or: [{ name: safeRegex }, { email: safeRegex }, { phone: safeRegex }],
        }).select('_id').lean();
        filter.deliveryBoyId = { $in: riders.map((r) => r._id) };
    }

    const sortMap = {
        available: { availableBalance: -1 },
        pending: { pendingBalance: -1 },
        earned: { lifetimeEarned: -1 },
        recent: { lastTransactionAt: -1 },
    };

    const [wallets, total] = await Promise.all([
        RiderWallet.find(filter)
            .populate('deliveryBoyId', 'name email phone applicationStatus isActive')
            .sort(sortMap[sort] || sortMap.available)
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        RiderWallet.countDocuments(filter),
    ]);

    // COD dues resolved in one grouped aggregation, not one per row.
    const cashByRider = await calculateRiderCashInHandBulk(
        wallets.map((w) => w.deliveryBoyId?._id || w.deliveryBoyId)
    );

    const rows = wallets.map((wallet) => {
        const riderId = String(wallet.deliveryBoyId?._id || wallet.deliveryBoyId);
        return {
            ...wallet,
            totalLiability: roundMoney(
                Number(wallet.pendingBalance || 0)
                + Number(wallet.availableBalance || 0)
                + Number(wallet.lockedBalance || 0)
            ),
            codCashInHand: Math.max(0, Number(cashByRider.get(riderId) ?? 0)),
        };
    });

    return res.status(200).json(
        new ApiResponse(200, {
            wallets: rows,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit) || 1,
            },
        }, 'Rider wallets fetched.')
    );
});

// ── GET /api/admin/rider-wallets/:deliveryBoyId ───────────────────────────────

export const getRiderWalletDetail = asyncHandler(async (req, res) => {
    const { deliveryBoyId } = req.params;
    if (!mongoose.isValidObjectId(deliveryBoyId)) {
        throw new ApiError(400, 'Invalid delivery partner.');
    }

    const rider = await DeliveryBoy.findById(deliveryBoyId)
        .select('name email phone applicationStatus isActive totalDeliveries')
        .lean();
    if (!rider) throw new ApiError(404, 'Delivery partner not found.');

    const [summary, payoutDetails, recentTransactions, recentWithdrawals] = await Promise.all([
        getWalletSummary(deliveryBoyId),
        getPayoutDetails(deliveryBoyId),
        RiderWalletTransaction.find({ deliveryBoyId })
            .populate('orderId', 'orderId total')
            .sort({ createdAt: -1 })
            .limit(25)
            .lean(),
        RiderWithdrawalRequest.find({ deliveryBoyId }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    return res.status(200).json(
        new ApiResponse(200, {
            rider,
            summary,
            payoutDetails,
            recentTransactions,
            recentWithdrawals,
        }, 'Rider wallet detail fetched.')
    );
});

// ── GET /api/admin/rider-withdrawals ──────────────────────────────────────────

export const listWithdrawals = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status = 'all', search = '' } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (status && status !== 'all') filter.status = status;

    const trimmedSearch = String(search || '').trim();
    if (trimmedSearch) {
        const safeRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const riders = await DeliveryBoy.find({
            $or: [{ name: safeRegex }, { email: safeRegex }, { phone: safeRegex }],
        }).select('_id').lean();
        filter.$or = [
            { deliveryBoyId: { $in: riders.map((r) => r._id) } },
            { requestNumber: safeRegex },
        ];
    }

    const [requests, total] = await Promise.all([
        RiderWithdrawalRequest.find(filter)
            .populate('deliveryBoyId', 'name email phone')
            .populate('reviewedBy', 'name email')
            .populate('paidBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        RiderWithdrawalRequest.countDocuments(filter),
    ]);

    const riderIds = requests.map((r) => r.deliveryBoyId?._id || r.deliveryBoyId);

    // The approver must see the rider's unremitted COD cash and current wallet
    // position next to the request. Approving a payout to a rider who is holding
    // platform cash is the most expensive mistake available on this screen.
    const [cashByRider, wallets] = await Promise.all([
        calculateRiderCashInHandBulk(riderIds),
        RiderWallet.find({ deliveryBoyId: { $in: riderIds } })
            .select('deliveryBoyId availableBalance pendingBalance lockedBalance isPayoutBlocked')
            .lean(),
    ]);

    const walletByRider = new Map(wallets.map((w) => [String(w.deliveryBoyId), w]));

    const rows = requests.map((request) => {
        const riderId = String(request.deliveryBoyId?._id || request.deliveryBoyId);
        const wallet = walletByRider.get(riderId) || {};
        const ageMs = Date.now() - new Date(request.createdAt).getTime();

        return {
            ...request,
            riderCodCashInHand: Math.max(0, Number(cashByRider.get(riderId) ?? 0)),
            riderAvailableBalance: roundMoney(wallet.availableBalance || 0),
            riderPendingBalance: roundMoney(wallet.pendingBalance || 0),
            riderLockedBalance: roundMoney(wallet.lockedBalance || 0),
            riderPayoutBlocked: wallet.isPayoutBlocked === true,
            ageHours: Math.floor(ageMs / (1000 * 60 * 60)),
        };
    });

    return res.status(200).json(
        new ApiResponse(200, {
            requests: rows,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit) || 1,
            },
        }, 'Rider withdrawal requests fetched.')
    );
});

// ── Withdrawal lifecycle actions ──────────────────────────────────────────────

export const approveWithdrawal = asyncHandler(async (req, res) => {
    const request = await approveWithdrawalRequest({
        withdrawalId: req.params.id,
        adminId: req.user.id,
        notes: req.body.notes,
        ipAddress: clientIp(req),
    });
    return res.status(200).json(new ApiResponse(200, request, 'Withdrawal approved.'));
});

export const rejectWithdrawal = asyncHandler(async (req, res) => {
    const request = await rejectWithdrawalRequest({
        withdrawalId: req.params.id,
        adminId: req.user.id,
        reason: req.body.reason,
        ipAddress: clientIp(req),
    });
    return res.status(200).json(new ApiResponse(200, request, 'Withdrawal rejected and funds released.'));
});

export const markPaid = asyncHandler(async (req, res) => {
    const request = await markWithdrawalPaid({
        withdrawalId: req.params.id,
        adminId: req.user.id,
        utr: req.body.utr,
        gatewayReference: req.body.gatewayReference,
        notes: req.body.notes,
        ipAddress: clientIp(req),
    });
    return res.status(200).json(new ApiResponse(200, request, 'Payout recorded.'));
});

export const markFailed = asyncHandler(async (req, res) => {
    const request = await markWithdrawalFailed({
        withdrawalId: req.params.id,
        adminId: req.user.id,
        reason: req.body.reason,
        ipAddress: clientIp(req),
    });
    return res.status(200).json(new ApiResponse(200, request, 'Payout marked failed and funds released.'));
});

// ── Adjustments, blocks, rebuild ──────────────────────────────────────────────

export const adjustWallet = asyncHandler(async (req, res) => {
    const { transaction, wallet } = await adjustRiderWallet({
        deliveryBoyId: req.params.deliveryBoyId,
        amount: req.body.amount,
        reason: req.body.reason,
        adminId: req.user.id,
        ipAddress: clientIp(req),
    });
    return res.status(201).json(
        new ApiResponse(201, { transaction, wallet }, 'Wallet adjustment posted.')
    );
});

export const togglePayoutBlock = asyncHandler(async (req, res) => {
    const wallet = await setPayoutBlock({
        deliveryBoyId: req.params.deliveryBoyId,
        blocked: req.body.blocked === true,
        reason: req.body.reason,
        adminId: req.user.id,
        ipAddress: clientIp(req),
    });
    return res.status(200).json(
        new ApiResponse(200, wallet, req.body.blocked ? 'Payouts blocked for this rider.' : 'Payouts unblocked.')
    );
});

export const reverseEarning = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const reversal = await reverseDeliveryEarning({
        orderId,
        reason: req.body.reason,
        adminId: req.user.id,
    });
    if (!reversal) throw new ApiError(404, 'No reversible delivery earning found for this order.');

    await AdminActivityLog.create({
        performedBy: req.user.id,
        action: 'rider_wallet_adjusted',
        details: {
            kind: 'earning_reversal',
            orderId: String(orderId),
            amount: reversal.amount,
            reason: String(req.body.reason || '').trim(),
        },
        ipAddress: clientIp(req),
    }).catch(() => null);

    return res.status(201).json(new ApiResponse(201, reversal, 'Delivery earning reversed.'));
});

/**
 * Recompute a rider's cached balances from the ledger.
 * The recovery path when the projection and the ledger disagree.
 */
export const rebuildRiderWallet = asyncHandler(async (req, res) => {
    const { deliveryBoyId } = req.params;
    if (!mongoose.isValidObjectId(deliveryBoyId)) {
        throw new ApiError(400, 'Invalid delivery partner.');
    }

    const result = await rebuildWallet(deliveryBoyId);

    await AdminActivityLog.create({
        performedBy: req.user.id,
        action: 'rider_wallet_rebuilt',
        details: {
            deliveryBoyId: String(deliveryBoyId),
            drift: result.drift,
            hadDrift: result.hadDrift,
        },
        ipAddress: clientIp(req),
    }).catch(() => null);

    return res.status(200).json(
        new ApiResponse(200, result, result.hadDrift
            ? 'Wallet rebuilt from ledger. Drift was found and corrected.'
            : 'Wallet rebuilt from ledger. No drift found.')
    );
});

export const verifyRiderPayoutDetails = asyncHandler(async (req, res) => {
    const details = await verifyPayoutDetails({
        deliveryBoyId: req.params.deliveryBoyId,
        adminId: req.user.id,
        ipAddress: clientIp(req),
    });
    return res.status(200).json(new ApiResponse(200, details, 'Payout details verified.'));
});

// ── Rate cards ────────────────────────────────────────────────────────────────

export const listRateCards = asyncHandler(async (req, res) => {
    const { scope, isActive } = req.query;
    const filter = {};
    if (scope && scope !== 'all') filter.scope = scope;
    if (isActive === 'true') filter.isActive = true;
    if (isActive === 'false') filter.isActive = false;

    const cards = await RiderRateCard.find(filter)
        .populate('deliveryBoyId', 'name email')
        .populate('createdBy', 'name email')
        .sort({ scope: 1, effectiveFrom: -1 })
        .lean();

    return res.status(200).json(new ApiResponse(200, cards, 'Rate cards fetched.'));
});

/**
 * Create a rate card.
 *
 * Creating a card in a scope closes off the previous active card in that same
 * scope rather than editing it, so what a past delivery was worth can never be
 * rewritten retroactively.
 */
export const createRateCard = asyncHandler(async (req, res) => {
    const payload = { ...req.body, createdBy: req.user.id };

    const scopeFilter = { scope: payload.scope, isActive: true };
    if (payload.scope === 'city') scopeFilter.city = payload.city;
    if (payload.scope === 'experience') scopeFilter.experience = payload.experience;
    if (payload.scope === 'rider') scopeFilter.deliveryBoyId = payload.deliveryBoyId;

    const card = await RiderRateCard.create(payload);

    const superseded = await RiderRateCard.updateMany(
        { ...scopeFilter, _id: { $ne: card._id } },
        { $set: { isActive: false, effectiveTo: card.effectiveFrom, supersededBy: card._id } }
    );

    await AdminActivityLog.create({
        performedBy: req.user.id,
        action: 'rider_rate_card_created',
        details: {
            rateCardId: String(card._id),
            name: card.name,
            scope: card.scope,
            baseFarePerDelivery: card.baseFarePerDelivery,
            perKmRate: card.perKmRate,
            supersededCount: superseded.modifiedCount || 0,
        },
        ipAddress: clientIp(req),
    }).catch(() => null);

    return res.status(201).json(
        new ApiResponse(201, card, superseded.modifiedCount
            ? `Rate card created. ${superseded.modifiedCount} previous card(s) in this scope were superseded.`
            : 'Rate card created.')
    );
});

export const deactivateRateCard = asyncHandler(async (req, res) => {
    const card = await RiderRateCard.findOneAndUpdate(
        { _id: req.params.id, isActive: true },
        { $set: { isActive: false, effectiveTo: new Date() } },
        { new: true }
    );
    if (!card) throw new ApiError(404, 'Active rate card not found.');

    await AdminActivityLog.create({
        performedBy: req.user.id,
        action: 'rider_rate_card_superseded',
        details: { rateCardId: String(card._id), name: card.name, scope: card.scope },
        ipAddress: clientIp(req),
    }).catch(() => null);

    return res.status(200).json(new ApiResponse(200, card, 'Rate card deactivated.'));
});

// ── Analytics ─────────────────────────────────────────────────────────────────

export const getWalletAnalytics = asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(1, Number(req.query.days) || 30), 365);
    const dashboard = await getWalletDashboard({ days });
    return res.status(200).json(new ApiResponse(200, dashboard, 'Wallet analytics fetched.'));
});

export const getDriftReport = asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 200), 1000);
    const report = await getReconciliationDrift({ limit });
    return res.status(200).json(
        new ApiResponse(200, report, report.driftedCount > 0
            ? `${report.driftedCount} wallet(s) disagree with the ledger and should be rebuilt.`
            : 'All checked wallets reconcile with the ledger.')
    );
});

// ── Admin COD cash adjustment (closes D-03 on the COD ledger) ─────────────────

export const adjustRiderCash = asyncHandler(async (req, res) => {
    const { postCashAdjustment } = await import('../../../services/deliveryCash.service.js');

    const result = await postCashAdjustment({
        deliveryBoyId: req.params.deliveryBoyId,
        amount: req.body.amount,
        reason: req.body.reason,
        type: req.body.type,
        orderId: req.body.orderId,
        adminId: req.user.id,
    });

    await AdminActivityLog.create({
        performedBy: req.user.id,
        action: 'rider_cash_adjusted',
        details: {
            deliveryBoyId: String(req.params.deliveryBoyId),
            amount: req.body.amount,
            type: req.body.type || 'ADJUSTMENT',
            reason: String(req.body.reason || '').trim(),
            newCashInHand: result.newCashInHand,
        },
        ipAddress: clientIp(req),
    }).catch(() => null);

    return res.status(201).json(new ApiResponse(201, result, 'Cash ledger adjustment posted.'));
});
