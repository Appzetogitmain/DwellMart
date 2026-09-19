import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Coupon from '../../src/models/Coupon.model.js';
import CouponUsage from '../../src/models/CouponUsage.model.js';
import Order from '../../src/models/Order.model.js';
import CheckoutSession from '../../src/models/CheckoutSession.model.js';
import User from '../../src/models/User.model.js';
import {
    incrementCouponUsage,
    reverseCouponUsage,
    evaluateCouponEligibility,
} from '../../src/services/coupon.service.js';
import { cancelOrder } from '../../src/modules/user/controllers/order.controller.js';
import { updateOrderStatus } from '../../src/modules/admin/controllers/order.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dwellmart_test';

describe('Phase 16 — P2-BIZ-01 Coupon Reversal on Order Cancellation', () => {
    let testUser;

    before(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUri);
        }
        const ts = Date.now();
        testUser = await User.create({
            name: `Coupon Test User ${ts}`,
            email: `coupontest_${ts}@dwellmart.test`,
            phone: `919999${String(ts).slice(-6)}`,
            password: 'hashed_password_test',
            role: 'customer',
        });
    });

    after(async () => {
        if (testUser?._id) {
            await User.deleteOne({ _id: testUser._id });
        }
        // Clean up any test coupons, usages, orders
        await Coupon.deleteMany({ code: { $regex: /^TEST_REV_/ } });
        await CouponUsage.deleteMany({ code: { $regex: /^TEST_REV_/ } });
        await Order.deleteMany({ orderId: { $regex: /^TEST-ORD-REV-/ } });
        await CheckoutSession.deleteMany({ sessionId: { $regex: /^TEST-CS-REV-/ } });
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        await Coupon.deleteMany({ code: { $regex: /^TEST_REV_/ } });
        await CouponUsage.deleteMany({ code: { $regex: /^TEST_REV_/ } });
        await Order.deleteMany({ orderId: { $regex: /^TEST-ORD-REV-/ } });
        await CheckoutSession.deleteMany({ sessionId: { $regex: /^TEST-CS-REV-/ } });
    });

    test('Requirement 1 & 4: Single-use coupon (perUserLimit: 1) is restored after order cancellation and user becomes eligible again', async () => {
        const code = `TEST_REV_SINGLE_${Date.now()}`;
        const coupon = await Coupon.create({
            code,
            name: 'Single Use 50',
            type: 'fixed',
            value: 50,
            minOrderValue: 100,
            perUserLimit: 1,
            isActive: true,
            usedCount: 0,
        });

        // 1. Check initial eligibility: user must be eligible
        const initVerdict = await evaluateCouponEligibility(coupon, { cartTotal: 500, userId: testUser._id });
        assert.equal(initVerdict.ok, true, 'User should initially be eligible');

        // 2. Simulate order placement and coupon consumption
        const orderId = new mongoose.Types.ObjectId();
        const sessionId = `TEST-CS-REV-${Date.now()}`;
        await incrementCouponUsage(code, {
            userId: testUser._id,
            orderId,
            checkoutSessionId: sessionId,
            amount: 50,
        });

        // Verify coupon state after placement
        const afterUseCoupon = await Coupon.findById(coupon._id);
        assert.equal(afterUseCoupon.usedCount, 1, 'Coupon usedCount must be 1 after placement');

        const usageDoc = await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id });
        assert.ok(usageDoc, 'CouponUsage row must exist after placement');

        // Verify user is now blocked by per-user limit
        const blockedVerdict = await evaluateCouponEligibility(coupon, { cartTotal: 500, userId: testUser._id });
        assert.equal(blockedVerdict.ok, false, 'User must be blocked after using single-use coupon');
        assert.equal(blockedVerdict.code, 'COUPON_USER_LIMIT');

        // 3. Reverse coupon usage (simulating order cancellation)
        const reverseResult = await reverseCouponUsage(code, {
            userId: testUser._id,
            orderId,
            checkoutSessionId: sessionId,
        });
        assert.equal(reverseResult.reversed, true, 'Reversal must report success');
        assert.equal(reverseResult.removedUsage, true, 'CouponUsage must be removed');
        assert.equal(reverseResult.decremented, true, 'usedCount must be decremented');

        // 4. Verify DB state after reversal
        const afterRevCoupon = await Coupon.findById(coupon._id);
        assert.equal(afterRevCoupon.usedCount, 0, 'Coupon usedCount must be back to 0');

        const usageAfterRev = await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id });
        assert.equal(usageAfterRev, null, 'CouponUsage row must be completely removed');

        // 5. Verify user is eligible once again!
        const restoredVerdict = await evaluateCouponEligibility(coupon, { cartTotal: 500, userId: testUser._id });
        assert.equal(restoredVerdict.ok, true, 'User must be eligible again after order cancellation');
    });

    test('Requirement 2 & 3: Platform-wide limit (usageLimit) restored and usedCount decremented exactly once', async () => {
        const code = `TEST_REV_GLOBAL_${Date.now()}`;
        const coupon = await Coupon.create({
            code,
            name: 'Global Cap 5',
            type: 'fixed',
            value: 20,
            usageLimit: 5,
            usedCount: 4,
            isActive: true,
        });

        const orderId = new mongoose.Types.ObjectId();
        const sessionId = `TEST-CS-REV-G-${Date.now()}`;

        // Consume the 5th and final usage
        await incrementCouponUsage(code, {
            userId: testUser._id,
            orderId,
            checkoutSessionId: sessionId,
            amount: 20,
        });

        const exhaustedCoupon = await Coupon.findById(coupon._id);
        assert.equal(exhaustedCoupon.usedCount, 5, 'usedCount should reach limit of 5');

        const blockedVerdict = await evaluateCouponEligibility(exhaustedCoupon, { cartTotal: 200, userId: testUser._id });
        assert.equal(blockedVerdict.ok, false, 'Coupon must be exhausted');
        assert.equal(blockedVerdict.code, 'COUPON_EXHAUSTED');

        // Cancel the order
        const reverseResult = await reverseCouponUsage(code, {
            userId: testUser._id,
            orderId,
            checkoutSessionId: sessionId,
        });
        assert.equal(reverseResult.reversed, true);

        const restoredCoupon = await Coupon.findById(coupon._id);
        assert.equal(restoredCoupon.usedCount, 4, 'usedCount must be decremented from 5 to 4');

        const restoredVerdict = await evaluateCouponEligibility(restoredCoupon, { cartTotal: 200, userId: testUser._id });
        assert.equal(restoredVerdict.ok, true, 'Coupon must no longer be exhausted');
    });

    test('Requirement 5: Multi-vendor CheckoutSession — cancelling 1 of 2 siblings does NOT reverse coupon', async () => {
        const code = `TEST_REV_MULTI_${Date.now()}`;
        const coupon = await Coupon.create({
            code,
            type: 'percentage',
            value: 10,
            perUserLimit: 1,
            isActive: true,
            usedCount: 0,
        });

        const csSessionId = `TEST-CS-REV-M-${Date.now()}`;
        const csDoc = await CheckoutSession.create({
            sessionId: csSessionId,
            userId: testUser._id,
            status: 'completed',
        });

        // Create 2 sibling orders under the same checkout session
        const orderA = await Order.create({
            orderId: `TEST-ORD-REV-A-${Date.now()}`,
            userId: testUser._id,
            checkoutSessionId: csDoc._id,
            status: 'pending',
            couponCode: code,
            couponDiscount: 15,
            total: 135,
        });

        const orderB = await Order.create({
            orderId: `TEST-ORD-REV-B-${Date.now()}`,
            userId: testUser._id,
            checkoutSessionId: csDoc._id,
            status: 'pending',
            couponCode: code,
            couponDiscount: 25,
            total: 225,
        });

        // Update checkout session with order IDs
        csDoc.orderIds = [orderA._id, orderB._id];
        await csDoc.save();

        // Single usage recorded for the checkout session
        await incrementCouponUsage(code, {
            userId: testUser._id,
            orderId: orderA._id,
            checkoutSessionId: csSessionId,
            amount: 40,
        });

        assert.equal((await Coupon.findById(coupon._id)).usedCount, 1);

        // Act 1: Cancel ONLY orderA. OrderB remains 'pending'
        orderA.status = 'cancelled';
        await orderA.save();

        const cancelOrderAResult = await reverseCouponUsage(code, {
            userId: testUser._id,
            orderId: orderA._id,
            checkoutSessionId: csDoc._id,
        });

        // Must NOT reverse because orderB is still active and using the coupon
        assert.equal(cancelOrderAResult.reversed, false, 'Must not reverse when active sibling exists');
        assert.equal(cancelOrderAResult.reason, 'ACTIVE_SIBLING_ORDERS_EXIST');

        const couponDuringSplit = await Coupon.findById(coupon._id);
        assert.equal(couponDuringSplit.usedCount, 1, 'usedCount must remain 1 while sibling is active');

        const usageDuringSplit = await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id });
        assert.ok(usageDuringSplit, 'CouponUsage must NOT be deleted while sibling is active');

        // Act 2: Cancel orderB (the final sibling)
        orderB.status = 'cancelled';
        await orderB.save();

        const cancelOrderBResult = await reverseCouponUsage(code, {
            userId: testUser._id,
            orderId: orderB._id,
            checkoutSessionId: csDoc._id,
        });

        // Now that all orders are cancelled, coupon MUST be reversed
        assert.equal(cancelOrderBResult.reversed, true, 'Must reverse when final sibling is cancelled');
        assert.equal(cancelOrderBResult.removedUsage, true);
        assert.equal(cancelOrderBResult.decremented, true);

        const couponAfterAllCancel = await Coupon.findById(coupon._id);
        assert.equal(couponAfterAllCancel.usedCount, 0, 'usedCount must be decremented to 0');

        const usageAfterAllCancel = await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id });
        assert.equal(usageAfterAllCancel, null, 'CouponUsage must be removed once all siblings cancelled');
    });

    test('Requirement 5: Repeated/Idempotent cancellation does NOT double-decrement', async () => {
        const code = `TEST_REV_IDEMP_${Date.now()}`;
        const coupon = await Coupon.create({
            code,
            type: 'fixed',
            value: 30,
            usedCount: 3,
            isActive: true,
        });

        const orderId = new mongoose.Types.ObjectId();
        const sessionId = `TEST-CS-REV-I-${Date.now()}`;

        // Create usage
        await incrementCouponUsage(code, {
            userId: testUser._id,
            orderId,
            checkoutSessionId: sessionId,
            amount: 30,
        });
        assert.equal((await Coupon.findById(coupon._id)).usedCount, 4);

        // First cancellation call
        const firstCall = await reverseCouponUsage(code, {
            userId: testUser._id,
            orderId,
            checkoutSessionId: sessionId,
        });
        assert.equal(firstCall.reversed, true);
        assert.equal(firstCall.decremented, true);
        assert.equal((await Coupon.findById(coupon._id)).usedCount, 3);

        // Second cancellation call (retry/duplicate)
        const secondCall = await reverseCouponUsage(code, {
            userId: testUser._id,
            orderId,
            checkoutSessionId: sessionId,
        });
        assert.equal(secondCall.reversed, false, 'Second call must not report reversed');
        assert.equal(secondCall.decremented, false, 'Second call must not decrement usedCount');

        // Third cancellation call
        const thirdCall = await reverseCouponUsage(code, {
            userId: testUser._id,
            orderId,
            checkoutSessionId: sessionId,
        });
        assert.equal(thirdCall.reversed, false);
        assert.equal(thirdCall.decremented, false);

        // usedCount must STILL be exactly 3, not 2 or 1!
        const finalCoupon = await Coupon.findById(coupon._id);
        assert.equal(finalCoupon.usedCount, 3, 'usedCount must never be double-decremented');
    });

    test('Requirement 5: usedCount never becomes negative', async () => {
        const code = `TEST_REV_NONNEG_${Date.now()}`;
        const coupon = await Coupon.create({
            code,
            type: 'fixed',
            value: 10,
            usedCount: 0, // already 0
            isActive: true,
        });

        const orderId = new mongoose.Types.ObjectId();
        const res = await reverseCouponUsage(code, {
            userId: testUser._id,
            orderId,
            isLegacy: true,
        });

        const checkedCoupon = await Coupon.findById(coupon._id);
        assert.equal(checkedCoupon.usedCount, 0, 'usedCount must remain >= 0, never negative');
    });

    test('Requirement 6: Order without coupon is a safe no-op', async () => {
        const nullRes = await reverseCouponUsage(null);
        assert.equal(nullRes.reversed, false);
        assert.equal(nullRes.reason, 'NO_CODE');

        const emptyRes = await reverseCouponUsage('');
        assert.equal(emptyRes.reversed, false);
        assert.equal(emptyRes.reason, 'NO_CODE');

        const undefinedRes = await reverseCouponUsage(undefined);
        assert.equal(undefinedRes.reversed, false);
        assert.equal(undefinedRes.reason, 'NO_CODE');
    });

    test('Requirement 6: Deleted coupon is handled safely without throwing', async () => {
        const orderId = new mongoose.Types.ObjectId();
        const nonExistentCode = `NONEXISTENT_CODE_${Date.now()}`;

        const result = await reverseCouponUsage(nonExistentCode, {
            userId: testUser._id,
            orderId,
        });

        assert.equal(result.reversed, false);
        assert.equal(result.reason, 'COUPON_NOT_FOUND');
    });

    test('Requirement 4: Transaction atomicity — rollback leaves coupon usage intact', async () => {
        // Test transactions using mongoose session
        const code = `TEST_REV_TXN_${Date.now()}`;
        const coupon = await Coupon.create({
            code,
            type: 'fixed',
            value: 25,
            perUserLimit: 1,
            isActive: true,
            usedCount: 0,
        });

        const orderId = new mongoose.Types.ObjectId();
        const sessionId = `TEST-CS-REV-TX-${Date.now()}`;

        await incrementCouponUsage(code, {
            userId: testUser._id,
            orderId,
            checkoutSessionId: sessionId,
            amount: 25,
        });

        assert.equal((await Coupon.findById(coupon._id)).usedCount, 1);
        assert.ok(await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id }));

        // Attempt cancellation inside transaction that then aborts
        const dbSession = await mongoose.startSession();
        try {
            await dbSession.withTransaction(async () => {
                await reverseCouponUsage(code, {
                    userId: testUser._id,
                    orderId,
                    checkoutSessionId: sessionId,
                }, { session: dbSession });

                // Intentionally throw to force transaction rollback
                throw new Error('SIMULATED_TRANSACTION_FAILURE');
            });
        } catch (err) {
            assert.equal(err.message, 'SIMULATED_TRANSACTION_FAILURE');
        } finally {
            await dbSession.endSession();
        }

        // Because transaction aborted, coupon state must NOT have been changed!
        const afterRollbackCoupon = await Coupon.findById(coupon._id);
        assert.equal(afterRollbackCoupon.usedCount, 1, 'usedCount must remain 1 after transaction rollback');

        const usageAfterRollback = await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id });
        assert.ok(usageAfterRollback, 'CouponUsage must still exist after transaction rollback');
    });

    test('Isolation: Reversal never touches CouponUsage belonging to another user or order', async () => {
        const code = `TEST_REV_ISOL_${Date.now()}`;
        const coupon = await Coupon.create({
            code,
            type: 'fixed',
            value: 15,
            perUserLimit: 5,
            isActive: true,
            usedCount: 0,
        });

        const otherUserId = new mongoose.Types.ObjectId();
        const otherOrderId = new mongoose.Types.ObjectId();
        const thisOrderId = new mongoose.Types.ObjectId();

        // Record usage for other user
        await incrementCouponUsage(code, {
            userId: otherUserId,
            orderId: otherOrderId,
            amount: 15,
        });

        // Record usage for this user
        await incrementCouponUsage(code, {
            userId: testUser._id,
            orderId: thisOrderId,
            amount: 15,
        });

        assert.equal((await Coupon.findById(coupon._id)).usedCount, 2);

        // Reverse this user's order
        await reverseCouponUsage(code, {
            userId: testUser._id,
            orderId: thisOrderId,
        });

        // Verify other user's usage row is completely untouched!
        const otherUsage = await CouponUsage.findOne({ couponId: coupon._id, userId: otherUserId });
        assert.ok(otherUsage, "Other user's usage row must NOT be deleted");
        assert.equal(String(otherUsage.orderId), String(otherOrderId));

        // This user's usage row is gone
        const thisUsage = await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id });
        assert.equal(thisUsage, null);

        assert.equal((await Coupon.findById(coupon._id)).usedCount, 1);

        // Clean up other usage
        await CouponUsage.deleteMany({ couponId: coupon._id });
    });

    test('Integration: cancelOrder controller reverses coupon in full customer cancellation flow', async () => {
        const code = `TEST_REV_CTRL_CUST_${Date.now()}`;
        const coupon = await Coupon.create({
            code,
            type: 'fixed',
            value: 40,
            perUserLimit: 1,
            isActive: true,
            usedCount: 0,
        });

        const order = await Order.create({
            orderId: `TEST-ORD-REV-CUST-${Date.now()}`,
            userId: testUser._id,
            status: 'pending',
            couponCode: code,
            couponDiscount: 40,
            items: [],
            total: 160,
        });

        await incrementCouponUsage(code, {
            userId: testUser._id,
            orderId: order._id,
            amount: 40,
        });

        assert.equal((await Coupon.findById(coupon._id)).usedCount, 1);
        assert.ok(await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id }));

        // Invoke cancelOrder
        const req = {
            params: { id: String(order._id) },
            user: { id: String(testUser._id) },
            body: { reason: 'Customer changed mind' },
        };
        let responseData = null;
        let responseStatus = null;
        const res = {
            status: (code) => {
                responseStatus = code;
                return res;
            },
            json: (data) => {
                responseData = data;
                return res;
            },
        };

        await cancelOrder(req, res);

        assert.equal(responseStatus, 200);
        assert.equal(responseData.success, true);

        // Verify order status
        const cancelledOrder = await Order.findById(order._id);
        assert.equal(cancelledOrder.status, 'cancelled');

        // Verify coupon state
        const restoredCoupon = await Coupon.findById(coupon._id);
        assert.equal(restoredCoupon.usedCount, 0);

        const restoredUsage = await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id });
        assert.equal(restoredUsage, null);

        // Verify user is eligible again
        const verdict = await evaluateCouponEligibility(restoredCoupon, { cartTotal: 200, userId: testUser._id });
        assert.equal(verdict.ok, true);
    });

    test('Integration: updateOrderStatus controller reverses coupon in full admin cancellation flow', async () => {
        const code = `TEST_REV_CTRL_ADMIN_${Date.now()}`;
        const coupon = await Coupon.create({
            code,
            type: 'percentage',
            value: 20,
            perUserLimit: 1,
            isActive: true,
            usedCount: 0,
        });

        const order = await Order.create({
            orderId: `TEST-ORD-REV-ADM-${Date.now()}`,
            userId: testUser._id,
            status: 'confirmed',
            couponCode: code,
            couponDiscount: 30,
            items: [],
            total: 120,
        });

        await incrementCouponUsage(code, {
            userId: testUser._id,
            orderId: order._id,
            amount: 30,
        });

        assert.equal((await Coupon.findById(coupon._id)).usedCount, 1);
        assert.ok(await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id }));

        // Invoke admin updateOrderStatus
        const req = {
            params: { id: String(order._id) },
            body: { status: 'cancelled' },
        };
        let responseData = null;
        let responseStatus = null;
        const res = {
            status: (code) => {
                responseStatus = code;
                return res;
            },
            json: (data) => {
                responseData = data;
                return res;
            },
        };

        await updateOrderStatus(req, res);

        assert.equal(responseStatus, 200);

        // Verify order status
        const cancelledOrder = await Order.findById(order._id);
        assert.equal(cancelledOrder.status, 'cancelled');

        // Verify coupon restored
        const restoredCoupon = await Coupon.findById(coupon._id);
        assert.equal(restoredCoupon.usedCount, 0);

        const restoredUsage = await CouponUsage.findOne({ couponId: coupon._id, userId: testUser._id });
        assert.equal(restoredUsage, null);
    });
});
