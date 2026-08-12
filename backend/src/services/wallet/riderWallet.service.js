/**
 * riderWallet.service
 *
 * The ledger engine. Every rupee the platform owes a delivery partner enters,
 * moves, or leaves the system through `postTransaction` in this file.
 *
 * Three rules hold everywhere below:
 *
 *   1. The ledger is append-only. Amounts are never edited and rows are never
 *      deleted. A mistake is corrected by posting an offsetting entry.
 *   2. A ledger write and the projection update it implies land in ONE MongoDB
 *      transaction. A balance that disagrees with its ledger is the failure mode
 *      this service exists to make impossible.
 *   3. `RiderWallet` is a cache. `rebuildWallet` recomputes it from the ledger
 *      alone, and the reconciliation analytic asserts they agree.
 */

import mongoose from 'mongoose';
import RiderWallet from '../../models/RiderWallet.model.js';
import RiderWalletTransaction, {
    CREDIT_TYPES,
    DEBIT_TYPES,
} from '../../models/RiderWalletTransaction.model.js';
import DeliveryBoy from '../../models/DeliveryBoy.model.js';
import ApiError from '../../utils/ApiError.js';
import { roundMoney } from '../PriceReconciliationService.js';

/**
 * How many times a write retries when it loses the optimistic-lock race.
 * Contention here is between a rider's own actions and a background sweep, so
 * it is low; three attempts covers it without masking a genuine stuck wallet.
 */
const MAX_VERSION_CONFLICT_RETRIES = 3;

/**
 * Which projection bucket a transaction moves, given its state.
 * Returns null for states that hold no balance (SETTLED, REVERSED).
 */
const bucketForState = (state) => {
    switch (state) {
        case 'PENDING':   return 'pendingBalance';
        case 'AVAILABLE': return 'availableBalance';
        case 'LOCKED':    return 'lockedBalance';
        default:          return null;
    }
};

/** Signed contribution of a transaction to its bucket. */
const signedAmount = (direction, amount) =>
    (direction === 'CREDIT' ? 1 : -1) * roundMoney(amount);

/**
 * Fetch or create the wallet row for a rider.
 *
 * Uses an upsert rather than find-then-create so two concurrent first-earnings
 * for the same rider cannot both insert. The unique index on `deliveryBoyId`
 * makes the loser retry into the existing document.
 */
export const getOrCreateWallet = async (deliveryBoyId, session = null) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) {
        throw new ApiError(400, 'A valid delivery partner is required.');
    }

    const options = { new: true, upsert: true, setDefaultsOnInsert: true };
    if (session) options.session = session;

    return RiderWallet.findOneAndUpdate(
        { deliveryBoyId },
        { $setOnInsert: { deliveryBoyId, currency: 'INR' } },
        options
    );
};

/**
 * Post one ledger entry and apply its effect to the projection, atomically.
 *
 * @param {object}  params
 * @param {string}  params.deliveryBoyId
 * @param {number}  params.amount            Positive magnitude.
 * @param {string}  params.type              A RiderWalletTransaction type.
 * @param {string}  [params.state]           Defaults per type (see below).
 * @param {string}  [params.orderId]
 * @param {string}  [params.withdrawalId]
 * @param {string}  [params.reversalOf]
 * @param {object}  [params.earningBreakdown]
 * @param {Date}    [params.maturesAt]
 * @param {string}  [params.idempotencyKey]
 * @param {string}  [params.description]
 * @param {string}  [params.createdBy]
 * @param {string}  [params.createdByType]
 * @param {object}  [params.session]         Existing Mongo session to join.
 * @returns {Promise<{transaction: object, wallet: object}>}
 */
export const postTransaction = async ({
    deliveryBoyId,
    amount,
    type,
    state,
    orderId = null,
    withdrawalId = null,
    reversalOf = null,
    earningBreakdown = undefined,
    maturesAt = null,
    idempotencyKey = null,
    description = '',
    notes = '',
    createdBy = null,
    createdByType = 'system',
    session: externalSession = null,
} = {}) => {
    const magnitude = roundMoney(Math.abs(Number(amount)));
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
        throw new ApiError(400, 'Transaction amount must be a positive number.');
    }

    const isCredit = CREDIT_TYPES.includes(type);
    const isDebit = DEBIT_TYPES.includes(type);
    if (!isCredit && !isDebit) {
        throw new ApiError(400, `Unknown wallet transaction type "${type}".`);
    }
    const direction = isCredit ? 'CREDIT' : 'DEBIT';

    // Default state by type: earnings accrue PENDING and must mature; every
    // other type takes effect immediately.
    const resolvedState = state || (type === 'DELIVERY_EARNING' ? 'PENDING' : 'AVAILABLE');

    const run = async (session) => {
        const wallet = await getOrCreateWallet(deliveryBoyId, session);

        const bucket = bucketForState(resolvedState);
        const delta = signedAmount(direction, magnitude);

        const nextBucketValue = bucket
            ? roundMoney(Number(wallet[bucket] || 0) + delta)
            : null;

        const [transaction] = await RiderWalletTransaction.create([{
            deliveryBoyId,
            amount: magnitude,
            direction,
            type,
            state: resolvedState,
            orderId,
            withdrawalId,
            reversalOf,
            earningBreakdown,
            maturesAt,
            idempotencyKey: idempotencyKey || undefined,
            description,
            notes,
            createdBy,
            createdByType,
            balanceAfter: nextBucketValue,
            ...(resolvedState === 'SETTLED' ? { settledAt: new Date() } : {}),
        }], { session });

        // Projection update, guarded on the version we read. A concurrent writer
        // that already moved the wallet forward invalidates this filter, and the
        // transaction retries against fresh state instead of overwriting it.
        const inc = {};
        if (bucket) inc[bucket] = delta;
        if (type === 'DELIVERY_EARNING' || type === 'INCENTIVE' || type === 'SURGE' || type === 'TIP') {
            inc.lifetimeEarned = magnitude;
        }
        if (type === 'WITHDRAWAL_PAID') {
            inc.lifetimeWithdrawn = magnitude;
        }
        inc.version = 1;

        const updated = await RiderWallet.findOneAndUpdate(
            { _id: wallet._id, version: wallet.version },
            {
                $inc: inc,
                $set: { lastTransactionAt: new Date() },
            },
            { new: true, session }
        );

        if (!updated) {
            // Surfaced as a retryable conflict; withTransaction re-runs the body.
            const conflict = new Error('WALLET_VERSION_CONFLICT');
            conflict.code = 'WALLET_VERSION_CONFLICT';
            throw conflict;
        }

        return { transaction, wallet: updated };
    };

    // Join an existing transaction when the caller owns one, so a withdrawal
    // that posts a hold and updates its request document stays atomic. The
    // caller owns retry in that case, because retrying here would replay only
    // part of their transaction.
    if (externalSession) return run(externalSession);

    // `withTransaction` retries only errors Mongo labels TransientTransactionError.
    // A version conflict is ours, not Mongo's, so it needs its own bounded retry:
    // two riders' concurrent writes are a normal race, not a failure to report.
    let lastError = null;
    for (let attempt = 0; attempt < MAX_VERSION_CONFLICT_RETRIES; attempt += 1) {
        const session = await mongoose.startSession();
        try {
            let result = null;
            await session.withTransaction(async () => {
                result = await run(session);
            });
            return result;
        } catch (err) {
            lastError = err;
            if (err?.code !== 'WALLET_VERSION_CONFLICT') throw err;
            // Brief jittered backoff so two contending writers do not lock-step.
            await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1) + Math.random() * 20));
        } finally {
            await session.endSession();
        }
    }

    console.error(
        `[RiderWallet] Version conflict persisted for rider ${deliveryBoyId} after `
        + `${MAX_VERSION_CONFLICT_RETRIES} attempts (type=${type}).`
    );
    throw new ApiError(
        409,
        'Your wallet was being updated by another action. Please try again in a moment.'
    );
};

/**
 * Move a set of transactions from one state to another and reflect the move in
 * the projection. Used by maturity (PENDING→AVAILABLE) and by withdrawal
 * settlement (LOCKED→SETTLED).
 *
 * @param {object} params
 * @param {string} params.deliveryBoyId
 * @param {Array}  params.transactionIds
 * @param {string} params.fromState
 * @param {string} params.toState
 * @param {object} params.session  REQUIRED — callers own the transaction.
 */
export const transitionTransactions = async ({
    deliveryBoyId,
    transactionIds,
    fromState,
    toState,
    session,
}) => {
    if (!session) throw new Error('transitionTransactions must run inside a transaction.');
    if (!transactionIds?.length) return { moved: 0, amount: 0 };

    const rows = await RiderWalletTransaction.find({
        _id: { $in: transactionIds },
        deliveryBoyId,
        state: fromState,
    }).session(session).lean();

    if (rows.length === 0) return { moved: 0, amount: 0 };

    const net = rows.reduce((sum, row) => sum + signedAmount(row.direction, row.amount), 0);
    const roundedNet = roundMoney(net);

    const now = new Date();
    await RiderWalletTransaction.updateMany(
        { _id: { $in: rows.map((r) => r._id) }, state: fromState },
        {
            $set: {
                state: toState,
                ...(toState === 'AVAILABLE' ? { maturedAt: now } : {}),
                ...(toState === 'SETTLED' ? { settledAt: now } : {}),
            },
        },
        { session }
    );

    const fromBucket = bucketForState(fromState);
    const toBucket = bucketForState(toState);

    const inc = { version: 1 };
    if (fromBucket) inc[fromBucket] = -roundedNet;
    if (toBucket) inc[toBucket] = roundedNet;

    const wallet = await getOrCreateWallet(deliveryBoyId, session);
    const updated = await RiderWallet.findOneAndUpdate(
        { _id: wallet._id, version: wallet.version },
        { $inc: inc, $set: { lastTransactionAt: now } },
        { new: true, session }
    );

    if (!updated) {
        const conflict = new Error('WALLET_VERSION_CONFLICT');
        conflict.code = 'WALLET_VERSION_CONFLICT';
        throw conflict;
    }

    return { moved: rows.length, amount: roundedNet, wallet: updated };
};

/**
 * Derive balances straight from the ledger, ignoring the projection entirely.
 * This is the definition of a rider's balance; everything else is a cache of it.
 */
export const deriveBalancesFromLedger = async (deliveryBoyId, session = null) => {
    const pipeline = [
        { $match: { deliveryBoyId: new mongoose.Types.ObjectId(String(deliveryBoyId)) } },
        {
            $group: {
                _id: '$state',
                net: {
                    $sum: {
                        $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount', { $multiply: ['$amount', -1] }],
                    },
                },
            },
        },
    ];

    const query = RiderWalletTransaction.aggregate(pipeline);
    if (session) query.session(session);
    const rows = await query;

    const byState = new Map(rows.map((row) => [row._id, roundMoney(row.net)]));

    return {
        pendingBalance: byState.get('PENDING') || 0,
        availableBalance: byState.get('AVAILABLE') || 0,
        lockedBalance: byState.get('LOCKED') || 0,
    };
};

/**
 * Recompute lifetime counters from the ledger. Kept separate from
 * `deriveBalancesFromLedger` because these scan every row regardless of state.
 */
export const deriveLifetimeFromLedger = async (deliveryBoyId) => {
    const rows = await RiderWalletTransaction.aggregate([
        { $match: { deliveryBoyId: new mongoose.Types.ObjectId(String(deliveryBoyId)) } },
        {
            $group: {
                _id: null,
                lifetimeEarned: {
                    $sum: {
                        $cond: [
                            { $in: ['$type', ['DELIVERY_EARNING', 'INCENTIVE', 'SURGE', 'TIP']] },
                            '$amount',
                            0,
                        ],
                    },
                },
                lifetimeWithdrawn: {
                    $sum: { $cond: [{ $eq: ['$type', 'WITHDRAWAL_PAID'] }, '$amount', 0] },
                },
            },
        },
    ]);

    return {
        lifetimeEarned: roundMoney(rows?.[0]?.lifetimeEarned || 0),
        lifetimeWithdrawn: roundMoney(rows?.[0]?.lifetimeWithdrawn || 0),
    };
};

/**
 * Rebuild a rider's projection from the ledger.
 *
 * The recovery path for any drift, and the proof that the projection is
 * disposable. Returns the delta it corrected so a caller can alert on non-zero.
 */
export const rebuildWallet = async (deliveryBoyId) => {
    const session = await mongoose.startSession();
    try {
        let result = null;
        await session.withTransaction(async () => {
            const wallet = await getOrCreateWallet(deliveryBoyId, session);
            const balances = await deriveBalancesFromLedger(deliveryBoyId, session);
            const lifetime = await deriveLifetimeFromLedger(deliveryBoyId);

            const drift = {
                pendingBalance: roundMoney(balances.pendingBalance - Number(wallet.pendingBalance || 0)),
                availableBalance: roundMoney(balances.availableBalance - Number(wallet.availableBalance || 0)),
                lockedBalance: roundMoney(balances.lockedBalance - Number(wallet.lockedBalance || 0)),
            };

            const updated = await RiderWallet.findByIdAndUpdate(
                wallet._id,
                {
                    $set: {
                        ...balances,
                        ...lifetime,
                        lastRebuiltAt: new Date(),
                    },
                    $inc: { version: 1 },
                },
                { new: true, session }
            );

            result = { wallet: updated, drift, hadDrift: Object.values(drift).some((d) => Math.abs(d) > 0.009) };
        });
        return result;
    } finally {
        await session.endSession();
    }
};

/**
 * Read a rider's wallet for display, with the COD liability alongside.
 *
 * Both figures travel together on purpose: a rider's financial position is not
 * their wallet balance alone, and an approver deciding on a payout must see the
 * unremitted cash in the same view.
 */
export const getWalletSummary = async (deliveryBoyId) => {
    const { calculateRiderSettleableCash } = await import('../deliveryCash.service.js');

    const [wallet, codCashInHand, rider] = await Promise.all([
        getOrCreateWallet(deliveryBoyId),
        calculateRiderSettleableCash(deliveryBoyId),
        DeliveryBoy.findById(deliveryBoyId).select('name totalDeliveries').lean(),
    ]);

    const { RiderWithdrawalRequest } = await import('../../models/RiderWithdrawalRequest.model.js');
    const { WITHDRAWAL_OPEN_STATUSES } = await import('../../models/RiderWithdrawalRequest.model.js');

    const openWithdrawal = await RiderWithdrawalRequest.findOne({
        deliveryBoyId,
        status: { $in: WITHDRAWAL_OPEN_STATUSES },
    }).lean();

    // Earliest maturing pending earning — answers "when can I withdraw?".
    const nextMaturing = await RiderWalletTransaction.findOne({
        deliveryBoyId,
        state: 'PENDING',
        maturesAt: { $ne: null },
    })
        .sort({ maturesAt: 1 })
        .select('maturesAt amount')
        .lean();

    const { getPayoutDetails } = await import('./riderPayoutDetails.service.js');
    const payoutDetails = await getPayoutDetails(deliveryBoyId);

    return {
        pendingBalance: roundMoney(wallet.pendingBalance),
        availableBalance: roundMoney(wallet.availableBalance),
        lockedBalance: roundMoney(wallet.lockedBalance),
        totalLiability: roundMoney(
            Number(wallet.pendingBalance || 0)
            + Number(wallet.availableBalance || 0)
            + Number(wallet.lockedBalance || 0)
        ),
        lifetimeEarned: roundMoney(wallet.lifetimeEarned),
        lifetimeWithdrawn: roundMoney(wallet.lifetimeWithdrawn),
        currency: wallet.currency || 'INR',
        isPayoutBlocked: wallet.isPayoutBlocked === true,
        blockReason: wallet.blockReason || '',
        hasPayoutDetails: payoutDetails.isComplete,
        payoutDetails,
        codCashInHand,
        openWithdrawal: openWithdrawal || null,
        nextMaturingAt: nextMaturing?.maturesAt || null,
        totalDeliveries: Number(rider?.totalDeliveries || 0),
    };
};
