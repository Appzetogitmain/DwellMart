/**
 * walletAnalytics.service
 *
 * Every figure here is derived from the ledger or the withdrawal collection by
 * aggregation. Nothing is estimated, sampled, or defaulted — a financial
 * dashboard that quietly substitutes a placeholder is worse than one that shows
 * an empty state, because the reader cannot tell the difference.
 */

import mongoose from 'mongoose';
import RiderWallet from '../../models/RiderWallet.model.js';
import RiderWalletTransaction from '../../models/RiderWalletTransaction.model.js';
import RiderWithdrawalRequest from '../../models/RiderWithdrawalRequest.model.js';
import DeliveryBoy from '../../models/DeliveryBoy.model.js';
import { roundMoney } from '../PriceReconciliationService.js';

/**
 * Outstanding liability — what the platform owes delivery partners right now.
 *
 * Read from the projection because this is a fleet-wide sum queried often; the
 * reconciliation check below is what keeps that trustworthy.
 */
export const getOutstandingLiability = async () => {
    const rows = await RiderWallet.aggregate([
        {
            $group: {
                _id: null,
                pendingLiability: { $sum: '$pendingBalance' },
                availableLiability: { $sum: '$availableBalance' },
                lockedLiability: { $sum: '$lockedBalance' },
                lifetimeEarned: { $sum: '$lifetimeEarned' },
                lifetimeWithdrawn: { $sum: '$lifetimeWithdrawn' },
                walletCount: { $sum: 1 },
                blockedCount: { $sum: { $cond: ['$isPayoutBlocked', 1, 0] } },
            },
        },
    ]);

    const row = rows?.[0] || {};
    const pending = roundMoney(row.pendingLiability || 0);
    const available = roundMoney(row.availableLiability || 0);
    const locked = roundMoney(row.lockedLiability || 0);

    return {
        pendingLiability: pending,
        availableLiability: available,
        lockedLiability: locked,
        totalOutstandingLiability: roundMoney(pending + available + locked),
        lifetimeEarned: roundMoney(row.lifetimeEarned || 0),
        lifetimeWithdrawn: roundMoney(row.lifetimeWithdrawn || 0),
        walletCount: Number(row.walletCount || 0),
        blockedWalletCount: Number(row.blockedCount || 0),
    };
};

/** Payouts actually sent, by period. */
export const getPayoutTotals = async ({ from = null, to = null } = {}) => {
    const match = { status: 'paid' };
    if (from || to) {
        match.paidAt = {};
        if (from) match.paidAt.$gte = new Date(from);
        if (to) match.paidAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }

    const [totals, byMethod] = await Promise.all([
        RiderWithdrawalRequest.aggregate([
            { $match: match },
            { $group: { _id: null, totalPaid: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        RiderWithdrawalRequest.aggregate([
            { $match: match },
            { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
    ]);

    return {
        totalPaidOut: roundMoney(totals?.[0]?.totalPaid || 0),
        payoutCount: Number(totals?.[0]?.count || 0),
        byMethod: byMethod.map((row) => ({
            method: row._id,
            total: roundMoney(row.total),
            count: row.count,
        })),
    };
};

/**
 * Aging of open withdrawal requests.
 *
 * Buckets are wait-time, not amount: a small request sitting for four days is a
 * worse operational signal than a large one raised this morning.
 */
export const getWithdrawalAging = async () => {
    const now = Date.now();
    const open = await RiderWithdrawalRequest.find({
        status: { $in: ['pending', 'approved', 'processing'] },
    }).select('amount createdAt status').lean();

    const buckets = {
        under24h: { count: 0, amount: 0 },
        h24to48: { count: 0, amount: 0 },
        h48to72: { count: 0, amount: 0 },
        over72h: { count: 0, amount: 0 },
    };

    open.forEach((request) => {
        const hours = (now - new Date(request.createdAt).getTime()) / (1000 * 60 * 60);
        const key = hours < 24 ? 'under24h'
            : hours < 48 ? 'h24to48'
                : hours < 72 ? 'h48to72'
                    : 'over72h';
        buckets[key].count += 1;
        buckets[key].amount = roundMoney(buckets[key].amount + Number(request.amount || 0));
    });

    return {
        openCount: open.length,
        openAmount: roundMoney(open.reduce((sum, r) => sum + Number(r.amount || 0), 0)),
        buckets,
        oldestHours: open.length
            ? Math.floor(Math.max(...open.map((r) => (now - new Date(r.createdAt).getTime()) / (1000 * 60 * 60))))
            : 0,
    };
};

/** Median and mean hours from request to payout. */
export const getPayoutLatency = async ({ days = 30 } = {}) => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const paid = await RiderWithdrawalRequest.find({
        status: 'paid',
        paidAt: { $gte: since, $ne: null },
    }).select('createdAt paidAt').lean();

    if (paid.length === 0) {
        return { sampleSize: 0, averageHours: 0, medianHours: 0, p90Hours: 0 };
    }

    const latencies = paid
        .map((r) => (new Date(r.paidAt).getTime() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60))
        .filter((h) => Number.isFinite(h) && h >= 0)
        .sort((a, b) => a - b);

    const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))];

    return {
        sampleSize: latencies.length,
        averageHours: roundMoney(latencies.reduce((s, h) => s + h, 0) / latencies.length),
        medianHours: roundMoney(percentile(0.5)),
        p90Hours: roundMoney(percentile(0.9)),
    };
};

/** Highest-earning riders over a window, from the ledger. */
export const getTopEarners = async ({ days = 30, limit = 10 } = {}) => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await RiderWalletTransaction.aggregate([
        {
            $match: {
                createdAt: { $gte: since },
                type: { $in: ['DELIVERY_EARNING', 'INCENTIVE', 'SURGE', 'TIP'] },
            },
        },
        {
            $group: {
                _id: '$deliveryBoyId',
                totalEarned: { $sum: '$amount' },
                deliveryCount: { $sum: { $cond: [{ $eq: ['$type', 'DELIVERY_EARNING'] }, 1, 0] } },
            },
        },
        { $sort: { totalEarned: -1 } },
        { $limit: Math.min(Math.max(1, Number(limit) || 10), 50) },
    ]);

    if (rows.length === 0) return [];

    const riders = await DeliveryBoy.find({ _id: { $in: rows.map((r) => r._id) } })
        .select('name email phone')
        .lean();
    const riderById = new Map(riders.map((r) => [String(r._id), r]));

    return rows.map((row) => {
        const rider = riderById.get(String(row._id)) || {};
        return {
            deliveryBoyId: row._id,
            name: rider.name || 'Unknown',
            email: rider.email || '',
            phone: rider.phone || '',
            totalEarned: roundMoney(row.totalEarned),
            deliveryCount: row.deliveryCount,
            averagePerDelivery: row.deliveryCount > 0
                ? roundMoney(row.totalEarned / row.deliveryCount)
                : 0,
        };
    });
};

/**
 * Adjustment and reversal rate.
 *
 * A rising rate is the leading indicator that something upstream is wrong —
 * a misconfigured rate card, a distance source returning nonsense, a delivery
 * status flapping. Worth alerting on before the disputes arrive.
 */
export const getCorrectionRates = async ({ days = 30 } = {}) => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await RiderWalletTransaction.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
            $group: {
                _id: null,
                earnings: { $sum: { $cond: [{ $eq: ['$type', 'DELIVERY_EARNING'] }, 1, 0] } },
                earningsAmount: { $sum: { $cond: [{ $eq: ['$type', 'DELIVERY_EARNING'] }, '$amount', 0] } },
                reversals: { $sum: { $cond: [{ $eq: ['$type', 'REVERSAL'] }, 1, 0] } },
                reversalsAmount: { $sum: { $cond: [{ $eq: ['$type', 'REVERSAL'] }, '$amount', 0] } },
                adjustments: { $sum: { $cond: [{ $in: ['$type', ['ADJUSTMENT', 'PENALTY']] }, 1, 0] } },
                adjustmentsAmount: { $sum: { $cond: [{ $in: ['$type', ['ADJUSTMENT', 'PENALTY']] }, '$amount', 0] } },
            },
        },
    ]);

    const row = rows?.[0] || {};
    const earnings = Number(row.earnings || 0);

    return {
        windowDays: days,
        earningCount: earnings,
        earningAmount: roundMoney(row.earningsAmount || 0),
        reversalCount: Number(row.reversals || 0),
        reversalAmount: roundMoney(row.reversalsAmount || 0),
        reversalRatePercent: earnings > 0 ? roundMoney((Number(row.reversals || 0) / earnings) * 100) : 0,
        adjustmentCount: Number(row.adjustments || 0),
        adjustmentAmount: roundMoney(row.adjustmentsAmount || 0),
        adjustmentRatePercent: earnings > 0 ? roundMoney((Number(row.adjustments || 0) / earnings) * 100) : 0,
    };
};

/**
 * Reconciliation drift — cached projections versus ledger-derived truth.
 *
 * The single most important integrity check in the wallet. A non-zero result
 * means a projection writer failed partway and the affected wallets should be
 * rebuilt. Bounded by `limit` because it walks the ledger per wallet.
 */
export const getReconciliationDrift = async ({ limit = 200 } = {}) => {
    const wallets = await RiderWallet.find({})
        .select('deliveryBoyId pendingBalance availableBalance lockedBalance')
        .sort({ lastTransactionAt: -1 })
        .limit(Math.min(Math.max(1, Number(limit) || 200), 1000))
        .lean();

    if (wallets.length === 0) {
        return { checked: 0, driftedCount: 0, totalAbsoluteDrift: 0, drifted: [] };
    }

    const riderIds = wallets.map((w) => new mongoose.Types.ObjectId(String(w.deliveryBoyId)));

    // One aggregation for every wallet in the sample, grouped by rider+state.
    const ledgerRows = await RiderWalletTransaction.aggregate([
        { $match: { deliveryBoyId: { $in: riderIds } } },
        {
            $group: {
                _id: { rider: '$deliveryBoyId', state: '$state' },
                net: {
                    $sum: {
                        $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount', { $multiply: ['$amount', -1] }],
                    },
                },
            },
        },
    ]);

    const derived = new Map();
    ledgerRows.forEach((row) => {
        const key = String(row._id.rider);
        if (!derived.has(key)) derived.set(key, { PENDING: 0, AVAILABLE: 0, LOCKED: 0 });
        const bucket = derived.get(key);
        if (row._id.state in bucket) bucket[row._id.state] = roundMoney(row.net);
    });

    const drifted = [];
    let totalAbsoluteDrift = 0;

    wallets.forEach((wallet) => {
        const key = String(wallet.deliveryBoyId);
        const truth = derived.get(key) || { PENDING: 0, AVAILABLE: 0, LOCKED: 0 };

        const delta = {
            pending: roundMoney(truth.PENDING - Number(wallet.pendingBalance || 0)),
            available: roundMoney(truth.AVAILABLE - Number(wallet.availableBalance || 0)),
            locked: roundMoney(truth.LOCKED - Number(wallet.lockedBalance || 0)),
        };

        const absolute = Math.abs(delta.pending) + Math.abs(delta.available) + Math.abs(delta.locked);
        // A hundredth of a rupee is rounding noise, not drift.
        if (absolute > 0.009) {
            totalAbsoluteDrift = roundMoney(totalAbsoluteDrift + absolute);
            drifted.push({
                deliveryBoyId: wallet.deliveryBoyId,
                cached: {
                    pending: roundMoney(wallet.pendingBalance || 0),
                    available: roundMoney(wallet.availableBalance || 0),
                    locked: roundMoney(wallet.lockedBalance || 0),
                },
                ledger: { pending: truth.PENDING, available: truth.AVAILABLE, locked: truth.LOCKED },
                delta,
            });
        }
    });

    return {
        checked: wallets.length,
        driftedCount: drifted.length,
        totalAbsoluteDrift,
        drifted: drifted.slice(0, 50),
    };
};

/** Everything the admin wallet dashboard needs, in one round trip. */
export const getWalletDashboard = async ({ days = 30 } = {}) => {
    const [liability, payouts, aging, latency, topEarners, corrections] = await Promise.all([
        getOutstandingLiability(),
        getPayoutTotals(),
        getWithdrawalAging(),
        getPayoutLatency({ days }),
        getTopEarners({ days, limit: 10 }),
        getCorrectionRates({ days }),
    ]);

    return { liability, payouts, aging, latency, topEarners, corrections, windowDays: days };
};
