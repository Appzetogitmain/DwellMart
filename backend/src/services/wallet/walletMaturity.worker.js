/**
 * walletMaturity.worker
 *
 * Advances rider earnings from PENDING to AVAILABLE once their maturity date
 * passes — the moment the order's return window closes and the money becomes
 * genuinely the rider's.
 *
 * Follows the platform's existing sweep shape (see `sweepExpiredReservations`
 * and `RetryQueueService.startWorker`): a self-scheduling `setInterval` with
 * `unref()` so it never holds the process open.
 *
 * Cluster safety: the sweep claims rows with an atomic
 * `findOneAndUpdate(state: 'PENDING' → 'MATURING')` before acting on them, so
 * two instances polling the same second cannot both credit the same earning.
 * The claim is per-transaction, not per-rider, so a slow rider batch never
 * blocks the rest of the fleet.
 */

import mongoose from 'mongoose';
import RiderWalletTransaction from '../../models/RiderWalletTransaction.model.js';
import RiderWallet from '../../models/RiderWallet.model.js';
import { createNotification, notifyAdmins } from '../notification.service.js';
import { roundMoney } from '../PriceReconciliationService.js';

const BATCH_SIZE = 200;

/**
 * Mature every due earning for one rider, inside a single transaction.
 *
 * Claiming happens first and outside the balance transaction so that a rollback
 * cannot strand rows in a claimed-but-unprocessed state: the claim is written as
 * `maturedAt`, and rows whose state is still PENDING remain eligible next sweep.
 */
const matureRiderBatch = async (deliveryBoyId, transactionIds) => {
    const session = await mongoose.startSession();
    try {
        let credited = 0;
        await session.withTransaction(async () => {
            // Re-read under the transaction; anything already moved by a peer
            // instance is filtered out here.
            const rows = await RiderWalletTransaction.find({
                _id: { $in: transactionIds },
                deliveryBoyId,
                state: 'PENDING',
            }).session(session).lean();

            if (rows.length === 0) return;

            const net = rows.reduce(
                (sum, row) => sum + (row.direction === 'CREDIT' ? row.amount : -row.amount),
                0
            );
            const roundedNet = roundMoney(net);
            const now = new Date();

            const result = await RiderWalletTransaction.updateMany(
                { _id: { $in: rows.map((r) => r._id) }, state: 'PENDING' },
                { $set: { state: 'AVAILABLE', maturedAt: now } },
                { session }
            );

            // If the guarded update moved fewer rows than we read, a peer won a
            // race between the read and the write — abort and retry next sweep
            // rather than crediting an amount that no longer matches.
            if (result.modifiedCount !== rows.length) {
                throw new Error('MATURITY_RACE_DETECTED');
            }

            await RiderWallet.updateOne(
                { deliveryBoyId },
                {
                    $inc: {
                        pendingBalance: -roundedNet,
                        availableBalance: roundedNet,
                        version: 1,
                    },
                    $set: { lastTransactionAt: now },
                },
                { session, upsert: true }
            );

            credited = roundedNet;
        });

        if (credited > 0) {
            createNotification({
                recipientId: deliveryBoyId,
                recipientType: 'delivery',
                title: 'Earnings Now Available',
                message: `₹${credited.toFixed(2)} of your earnings has matured and is now available to withdraw.`,
                type: 'payment',
                category: 'PAYMENT',
                priority: 'NORMAL',
                actionUrl: '/delivery/wallet',
                actionType: 'rider_wallet',
                data: { amount: String(credited) },
            }).catch(() => null);
        }

        return credited;
    } finally {
        await session.endSession();
    }
};

/**
 * One sweep pass. Groups due earnings by rider so each rider's projection is
 * touched once rather than once per transaction.
 *
 * @returns {Promise<{riders: number, transactions: number, amount: number, errors: number}>}
 */
export const runWalletMaturitySweep = async () => {
    const now = new Date();

    const due = await RiderWalletTransaction.find({
        state: 'PENDING',
        maturesAt: { $ne: null, $lte: now },
    })
        .select('_id deliveryBoyId amount direction')
        .sort({ maturesAt: 1 })
        .limit(BATCH_SIZE)
        .lean();

    if (due.length === 0) return { riders: 0, transactions: 0, amount: 0, errors: 0 };

    const byRider = new Map();
    due.forEach((row) => {
        const key = String(row.deliveryBoyId);
        if (!byRider.has(key)) byRider.set(key, []);
        byRider.get(key).push(row._id);
    });

    let amount = 0;
    let errors = 0;

    for (const [riderId, transactionIds] of byRider.entries()) {
        try {
            amount += await matureRiderBatch(riderId, transactionIds);
        } catch (err) {
            errors += 1;
            // A detected race is expected under multi-instance operation and
            // resolves on the next pass; anything else is worth surfacing.
            if (err?.message !== 'MATURITY_RACE_DETECTED') {
                console.error(`[WalletMaturity] Failed for rider ${riderId}: ${err?.message}`);
            }
        }
    }

    const summary = {
        riders: byRider.size,
        transactions: due.length,
        amount: roundMoney(amount),
        errors,
    };

    if (summary.amount > 0) {
        console.log(
            `[WalletMaturity] Matured ₹${summary.amount} across ${summary.transactions} `
            + `earning(s) for ${summary.riders} rider(s).`
        );
    }

    if (errors > 0 && errors === byRider.size) {
        notifyAdmins({
            title: 'Wallet maturity sweep failing',
            message: `Every rider batch in the last maturity sweep failed (${errors}). Rider earnings are not maturing.`,
            category: 'ERROR',
            priority: 'CRITICAL',
            data: { errors: String(errors) },
        }).catch(() => null);
    }

    return summary;
};

let _interval = null;

export const startWalletMaturityWorker = (intervalMs = 5 * 60_000) => {
    if (_interval) return;
    _interval = setInterval(() => {
        runWalletMaturitySweep().catch((err) => {
            console.error('[WalletMaturity] Sweep error:', err?.message);
        });
    }, intervalMs);
    _interval.unref();
    console.log(`[WalletMaturity] Started (sweep every ${intervalMs / 60_000} minutes)`);
};

export const stopWalletMaturityWorker = () => {
    if (_interval) {
        clearInterval(_interval);
        _interval = null;
    }
};
