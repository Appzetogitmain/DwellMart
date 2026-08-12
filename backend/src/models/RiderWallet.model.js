/**
 * RiderWallet
 *
 * A CACHED PROJECTION of RiderWalletTransaction. It exists so the rider app and
 * the admin queue can read a balance without aggregating a growing ledger on
 * every request — nothing more.
 *
 * It is never the source of truth. `walletRebuild.service.js` can recompute all
 * three balances from the ledger alone, and the reconciliation analytic asserts
 * projection and ledger agree. Any drift is a bug in the writer, and the ledger
 * always wins.
 *
 * Balance semantics:
 *   pendingBalance   accrued earnings still inside the order's return window
 *   availableBalance matured, withdrawable right now
 *   lockedBalance    reserved against an open withdrawal request
 *
 * Negative balances are permitted and deliberately not clamped. A reversal
 * landing after a payout can legitimately drive a rider negative; hiding that
 * behind a floor is how an over-payment becomes invisible.
 */

import mongoose from 'mongoose';

const riderWalletSchema = new mongoose.Schema(
    {
        deliveryBoyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DeliveryBoy',
            required: true,
            unique: true,
            index: true,
        },

        pendingBalance: { type: Number, default: 0 },
        availableBalance: { type: Number, default: 0 },
        lockedBalance: { type: Number, default: 0 },

        lifetimeEarned: { type: Number, default: 0 },
        lifetimeWithdrawn: { type: Number, default: 0 },

        currency: { type: String, default: 'INR', uppercase: true, trim: true },

        // Payout destination lives on DeliveryBoy.payoutDetails, mirroring
        // Vendor.bankDetails — the actor owns where its money goes.

        /** Set by an admin to suspend payouts during a fraud investigation. */
        isPayoutBlocked: { type: Boolean, default: false },
        blockReason: { type: String, trim: true, default: '' },
        blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        blockedAt: { type: Date, default: null },

        /**
         * Optimistic concurrency guard. Every projection write filters on the
         * version it read and increments it, so two concurrent balance updates
         * cannot both succeed against stale reads.
         */
        version: { type: Number, default: 0 },

        lastTransactionAt: { type: Date, default: null },
        lastRebuiltAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// Admin wallet overview: richest riders / largest liabilities first.
riderWalletSchema.index({ availableBalance: -1 });
riderWalletSchema.index({ isPayoutBlocked: 1, availableBalance: -1 });

/** Total the platform owes this rider across every state. */
riderWalletSchema.virtual('totalLiability').get(function totalLiability() {
    return Number(
        (
            Number(this.pendingBalance || 0)
            + Number(this.availableBalance || 0)
            + Number(this.lockedBalance || 0)
        ).toFixed(2)
    );
});

riderWalletSchema.set('toJSON', { virtuals: true });
riderWalletSchema.set('toObject', { virtuals: true });

const RiderWallet = mongoose.model('RiderWallet', riderWalletSchema);

export { RiderWallet };
export default RiderWallet;
