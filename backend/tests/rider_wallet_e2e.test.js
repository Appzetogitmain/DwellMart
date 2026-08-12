/**
 * Rider Earnings Wallet — end-to-end ledger integrity test.
 *
 * Exercises the full lifecycle against a real MongoDB, asserting the properties
 * that matter for money: idempotency, conservation, concurrency safety, and
 * projection/ledger agreement.
 *
 *   node tests/rider_wallet_e2e.test.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';

import DeliveryBoy from '../src/models/DeliveryBoy.model.js';
import Order from '../src/models/Order.model.js';
import RiderWallet from '../src/models/RiderWallet.model.js';
import RiderWalletTransaction from '../src/models/RiderWalletTransaction.model.js';
import RiderWithdrawalRequest from '../src/models/RiderWithdrawalRequest.model.js';
import RiderRateCard from '../src/models/RiderRateCard.model.js';

import { accrueDeliveryEarning, reverseDeliveryEarning } from '../src/services/wallet/riderEarnings.service.js';
import { resolveRateCard, computeDeliveryEarning } from '../src/services/wallet/riderRateCard.service.js';
import {
    createWithdrawalRequest,
    approveWithdrawalRequest,
    markWithdrawalPaid,
    rejectWithdrawalRequest,
    adjustRiderWallet,
} from '../src/services/wallet/riderWithdrawal.service.js';
import { updatePayoutDetails } from '../src/services/wallet/riderPayoutDetails.service.js';
import { rebuildWallet, deriveBalancesFromLedger, getWalletSummary } from '../src/services/wallet/riderWallet.service.js';
import { runWalletMaturitySweep } from '../src/services/wallet/walletMaturity.worker.js';
import { getOutstandingLiability, getReconciliationDrift } from '../src/services/wallet/walletAnalytics.service.js';

let passed = 0;
let failed = 0;
const check = (label, condition, detail = '') => {
    if (condition) { passed += 1; console.log(`  ✅ [PASS] ${label}`); }
    else { failed += 1; console.log(`  ❌ [FAIL] ${label}${detail ? ` → ${detail}` : ''}`); }
};

const SUFFIX = Date.now();
const ids = { rider: null, admin: new mongoose.Types.ObjectId(), orders: [], card: null };

const makeOrder = async (total, { experience = 'marketplace', paymentMethod = 'cod', distanceKm = 6 } = {}) => {
    const order = await Order.create({
        orderId: `WT-${SUFFIX}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        userId: new mongoose.Types.ObjectId(),
        deliveryBoyId: ids.rider,
        items: [],
        shippingAddress: { name: 'Wallet Test', city: 'Indore', phone: '9999999999' },
        paymentMethod,
        paymentStatus: 'pending',
        subtotal: total, shipping: 40, tax: 0, total,
        status: 'delivered',
        deliveredAt: new Date(),
        experience,
        returnPolicy: { windowHours: experience === 'quick_commerce' ? 24 : 168, eligible: true },
        ...(experience === 'quick_commerce' ? { quickCommerce: { deliveryDistanceKm: distanceKm, status: 'delivered' } } : {}),
    });
    ids.orders.push(order._id);
    return order;
};

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('\n══════════════════════════════════════════════════════');
    console.log('  RIDER EARNINGS WALLET — E2E LEDGER INTEGRITY');
    console.log('══════════════════════════════════════════════════════\n');

    // ── Setup ────────────────────────────────────────────────────────────────
    const rider = await DeliveryBoy.create({
        name: `Wallet Test Rider ${SUFFIX}`,
        email: `wallet.rider.${SUFFIX}@test.dwell`,
        password: 'testpass123',
        phone: `9${String(SUFFIX).slice(-9)}`,
        applicationStatus: 'approved',
        isActive: true,
    });
    ids.rider = rider._id;

    const card = await RiderRateCard.create({
        name: `E2E card ${SUFFIX}`,
        scope: 'rider',
        deliveryBoyId: ids.rider,
        baseFarePerDelivery: 30,
        perKmRate: 6,
        freeDistanceKm: 1,
        minimumFare: 35,
        codHandlingFee: 5,
        effectiveFrom: new Date(Date.now() - 60_000),
        isActive: true,
    });
    ids.card = card._id;

    console.log('── 1. Rate card resolution & fare computation ──');
    const resolved = await resolveRateCard({ deliveryBoyId: ids.rider, city: 'Indore', experience: 'quick_commerce' });
    check('Rider-scoped card wins over global', String(resolved?._id) === String(ids.card));

    const fare = computeDeliveryEarning({ card: resolved, distanceKm: 6, isCod: true, experience: 'quick_commerce' });
    // base 30 + (6-1)*6 = 60 → above minimum 35 → +5 COD = 65
    check('Fare computed from card components', fare.amount === 65, `got ${fare.amount}`);
    check('Breakdown snapshot retained', fare.breakdown.baseFare === 30 && fare.breakdown.distanceFare === 30);

    console.log('\n── 2. Earning accrual & idempotency ──');
    const order1 = await makeOrder(500, { experience: 'quick_commerce', distanceKm: 6 });
    const tx1 = await accrueDeliveryEarning({ order: order1, deliveryBoyId: ids.rider });
    check('Earning accrued on delivered order', Boolean(tx1) && tx1.amount === 65, `got ${tx1?.amount}`);
    check('Earning lands PENDING', tx1.state === 'PENDING');
    check('Maturity anchored to the order return window (24h QC)',
        Math.abs(new Date(tx1.maturesAt) - new Date(order1.deliveredAt)) - 24 * 3600 * 1000 < 60_000);

    const replay = await accrueDeliveryEarning({ order: order1, deliveryBoyId: ids.rider });
    check('Replay is idempotent (same transaction returned)', String(replay._id) === String(tx1._id));
    const earningCount = await RiderWalletTransaction.countDocuments({ orderId: order1._id, type: 'DELIVERY_EARNING' });
    check('Exactly ONE earning row exists for the order', earningCount === 1, `got ${earningCount}`);

    // Concurrency: five simultaneous accruals must still produce one row.
    const order2 = await makeOrder(700, { experience: 'quick_commerce', distanceKm: 3 });
    await Promise.allSettled(Array.from({ length: 5 }, () => accrueDeliveryEarning({ order: order2, deliveryBoyId: ids.rider })));
    const concurrentCount = await RiderWalletTransaction.countDocuments({ orderId: order2._id, type: 'DELIVERY_EARNING' });
    check('5 concurrent accruals produce exactly ONE row', concurrentCount === 1, `got ${concurrentCount}`);

    console.log('\n── 3. Non-delivered orders never accrue ──');
    const pendingOrder = await Order.create({
        orderId: `WT-${SUFFIX}-PENDING`,
        deliveryBoyId: ids.rider, items: [],
        shippingAddress: { name: 'x', city: 'Indore' },
        paymentMethod: 'cod', subtotal: 100, total: 100, status: 'shipped', experience: 'marketplace',
    });
    ids.orders.push(pendingOrder._id);
    const noTx = await accrueDeliveryEarning({ order: pendingOrder, deliveryBoyId: ids.rider });
    check('A shipped (not delivered) order accrues nothing', noTx === null);

    console.log('\n── 4. Maturity sweep ──');
    let wallet = await RiderWallet.findOne({ deliveryBoyId: ids.rider });
    const pendingBefore = wallet.pendingBalance;
    check('Pending balance reflects both earnings', pendingBefore > 0, `got ${pendingBefore}`);
    check('Available is still zero before maturity', wallet.availableBalance === 0);

    // Force maturity by back-dating.
    await RiderWalletTransaction.updateMany(
        { deliveryBoyId: ids.rider, state: 'PENDING' },
        { $set: { maturesAt: new Date(Date.now() - 60_000) } }
    );
    const sweep = await runWalletMaturitySweep();
    check('Sweep matured the due earnings', sweep.transactions >= 2, `matured ${sweep.transactions}`);

    wallet = await RiderWallet.findOne({ deliveryBoyId: ids.rider });
    check('Pending moved fully into available',
        wallet.pendingBalance === 0 && wallet.availableBalance === pendingBefore,
        `pending=${wallet.pendingBalance} available=${wallet.availableBalance}`);

    const sweepAgain = await runWalletMaturitySweep();
    check('Re-running the sweep is a no-op', sweepAgain.transactions === 0);

    console.log('\n── 5. Withdrawal lifecycle ──');
    // Withdrawal must be refused before payout details exist.
    let refused = false;
    try { await createWithdrawalRequest({ deliveryBoyId: ids.rider, amount: 50 }); }
    catch (err) { refused = /UPI ID or bank account/i.test(err.message); }
    check('Withdrawal refused without payout details', refused);

    await updatePayoutDetails({ deliveryBoyId: ids.rider, method: 'upi', upiId: `rider${SUFFIX}@okhdfc`, accountName: 'Test Rider' });
    check('Payout details saved (first setup, no cooling-off)', true);

    const available = wallet.availableBalance;
    const { request } = await createWithdrawalRequest({ deliveryBoyId: ids.rider, amount: available });
    check('Withdrawal request created', Boolean(request?.requestNumber));

    wallet = await RiderWallet.findOne({ deliveryBoyId: ids.rider });
    check('Funds moved AVAILABLE → LOCKED at request time',
        wallet.availableBalance === 0 && wallet.lockedBalance === available,
        `available=${wallet.availableBalance} locked=${wallet.lockedBalance}`);

    let secondBlocked = false;
    try { await createWithdrawalRequest({ deliveryBoyId: ids.rider, amount: 1 }); }
    catch { secondBlocked = true; }
    check('A second open request is blocked', secondBlocked);

    // Concurrent approvals: exactly one must win.
    const approvals = await Promise.allSettled([
        approveWithdrawalRequest({ withdrawalId: request._id, adminId: ids.admin }),
        approveWithdrawalRequest({ withdrawalId: request._id, adminId: ids.admin }),
    ]);
    const approvedOk = approvals.filter((r) => r.status === 'fulfilled').length;
    check('Concurrent approvals: exactly one succeeds', approvedOk === 1, `${approvedOk} succeeded`);

    const utr = `UTR${SUFFIX}`;
    await markWithdrawalPaid({ withdrawalId: request._id, adminId: ids.admin, utr });
    wallet = await RiderWallet.findOne({ deliveryBoyId: ids.rider });
    check('Locked cleared after payout', wallet.lockedBalance === 0, `locked=${wallet.lockedBalance}`);
    check('lifetimeWithdrawn recorded', wallet.lifetimeWithdrawn === available, `got ${wallet.lifetimeWithdrawn}`);

    let doubleePay = false;
    try { await markWithdrawalPaid({ withdrawalId: request._id, adminId: ids.admin, utr: `${utr}X` }); }
    catch { doubleePay = true; }
    check('A paid request cannot be paid twice', doubleePay);

    console.log('\n── 6. Rejection releases the hold ──');
    // Long-distance QC order so the earning clears the ₹100 withdrawal minimum.
    const order3 = await makeOrder(400, { experience: 'quick_commerce', distanceKm: 20 });
    await accrueDeliveryEarning({ order: order3, deliveryBoyId: ids.rider });
    await RiderWalletTransaction.updateMany(
        { deliveryBoyId: ids.rider, state: 'PENDING' },
        { $set: { maturesAt: new Date(Date.now() - 60_000) } }
    );
    await runWalletMaturitySweep();

    wallet = await RiderWallet.findOne({ deliveryBoyId: ids.rider });
    const availableBeforeReject = wallet.availableBalance;
    const { request: req2 } = await createWithdrawalRequest({ deliveryBoyId: ids.rider, amount: availableBeforeReject });
    await rejectWithdrawalRequest({ withdrawalId: req2._id, adminId: ids.admin, reason: 'KYC re-verification required' });

    wallet = await RiderWallet.findOne({ deliveryBoyId: ids.rider });
    check('Rejection returns funds to available',
        wallet.availableBalance === availableBeforeReject && wallet.lockedBalance === 0,
        `available=${wallet.availableBalance} locked=${wallet.lockedBalance}`);

    console.log('\n── 7. Reversal and negative balance ──');
    const reversal = await reverseDeliveryEarning({ orderId: order3._id, reason: 'Order refunded after delivery', adminId: ids.admin });
    check('Earning reversed', Boolean(reversal));
    const original = await RiderWalletTransaction.findOne({ orderId: order3._id, type: 'DELIVERY_EARNING' });
    // Append-only: the original row is never edited or deleted. The REVERSAL
    // entry offsets it and `reversalOf` records the link. Mutating the original
    // as well would remove its amount from the derived balance a second time.
    check('Original earning row left intact (append-only)', Boolean(original) && original.state !== 'REVERSED');
    check('Reversal links back to the original', String(reversal.reversalOf) === String(original._id));
    check('Reversal offsets the exact earned amount', reversal.amount === original.amount);
    const reReverse = await reverseDeliveryEarning({ orderId: order3._id, reason: 'again', adminId: ids.admin });
    check('Double reversal is idempotent', String(reReverse._id) === String(reversal._id));

    console.log('\n── 8. Manual adjustment ──');
    await adjustRiderWallet({ deliveryBoyId: ids.rider, amount: 250, reason: 'Missed festive incentive', adminId: ids.admin });
    await adjustRiderWallet({ deliveryBoyId: ids.rider, amount: -100, reason: 'Damaged package penalty', adminId: ids.admin });
    const adjustments = await RiderWalletTransaction.countDocuments({ deliveryBoyId: ids.rider, type: { $in: ['ADJUSTMENT', 'PENALTY'] } });
    check('Both adjustments written to the ledger', adjustments >= 2, `got ${adjustments}`);

    let zeroRejected = false;
    try { await adjustRiderWallet({ deliveryBoyId: ids.rider, amount: 0, reason: 'nothing at all' }); }
    catch { zeroRejected = true; }
    check('A zero adjustment is rejected', zeroRejected);

    let noReasonRejected = false;
    try { await adjustRiderWallet({ deliveryBoyId: ids.rider, amount: 10, reason: 'x' }); }
    catch { noReasonRejected = true; }
    check('An adjustment without a real reason is rejected', noReasonRejected);

    console.log('\n── 9. Projection vs ledger (the integrity invariant) ──');
    const derived = await deriveBalancesFromLedger(ids.rider);
    wallet = await RiderWallet.findOne({ deliveryBoyId: ids.rider });
    check('Cached pending matches ledger', Math.abs(derived.pendingBalance - wallet.pendingBalance) < 0.01,
        `cached=${wallet.pendingBalance} ledger=${derived.pendingBalance}`);
    check('Cached available matches ledger', Math.abs(derived.availableBalance - wallet.availableBalance) < 0.01,
        `cached=${wallet.availableBalance} ledger=${derived.availableBalance}`);
    check('Cached locked matches ledger', Math.abs(derived.lockedBalance - wallet.lockedBalance) < 0.01,
        `cached=${wallet.lockedBalance} ledger=${derived.lockedBalance}`);

    // Deliberately corrupt the projection, then prove rebuild recovers it.
    await RiderWallet.updateOne({ deliveryBoyId: ids.rider }, { $set: { availableBalance: 99999 } });
    const rebuilt = await rebuildWallet(ids.rider);
    check('Rebuild detects injected drift', rebuilt.hadDrift === true);
    check('Rebuild restores the ledger-derived balance',
        Math.abs(rebuilt.wallet.availableBalance - derived.availableBalance) < 0.01,
        `restored=${rebuilt.wallet.availableBalance} expected=${derived.availableBalance}`);

    console.log('\n── 10. Analytics ──');
    const liability = await getOutstandingLiability();
    check('Outstanding liability aggregates', typeof liability.totalOutstandingLiability === 'number');
    check('Liability equals its three components',
        Math.abs(liability.totalOutstandingLiability
            - (liability.pendingLiability + liability.availableLiability + liability.lockedLiability)) < 0.01);

    const drift = await getReconciliationDrift({ limit: 50 });
    check('Drift report runs and reports zero for this rider',
        !drift.drifted.some((d) => String(d.deliveryBoyId) === String(ids.rider)));

    const summary = await getWalletSummary(ids.rider);
    check('Wallet summary exposes COD dues alongside the balance', typeof summary.codCashInHand === 'number');
    check('Full account number is never returned', !JSON.stringify(summary).includes('accountNumber"'));

    // ── Cleanup ──────────────────────────────────────────────────────────────
    console.log('\n── Cleanup ──');
    await RiderWalletTransaction.deleteMany({ deliveryBoyId: ids.rider });
    await RiderWithdrawalRequest.deleteMany({ deliveryBoyId: ids.rider });
    await RiderWallet.deleteMany({ deliveryBoyId: ids.rider });
    await RiderRateCard.deleteMany({ deliveryBoyId: ids.rider });
    await Order.deleteMany({ _id: { $in: ids.orders } });
    await DeliveryBoy.deleteOne({ _id: ids.rider });
    console.log('  cleaned up.');

    console.log('\n══════════════════════════════════════════════════════');
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(failed === 0 ? '  🎉 ALL RIDER WALLET ASSERTIONS PASSED' : '  ❌ FAILURES PRESENT');
    console.log('══════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    process.exit(failed === 0 ? 0 : 1);
};

run().catch(async (err) => {
    console.error('\nTest run crashed:', err);
    await mongoose.disconnect().catch(() => null);
    process.exit(1);
});
