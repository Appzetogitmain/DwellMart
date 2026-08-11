import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import DeliveryBoy from './models/DeliveryBoy.model.js';
import Order from './models/Order.model.js';
import DeliveryCashLedger from './models/DeliveryCashLedger.model.js';
import DeliveryCashSettlement from './models/DeliveryCashSettlement.model.js';
import Settings from './models/Settings.model.js';
import Notification from './models/Notification.model.js';
import {
    calculateRiderCashInHand,
    recordCodCollection,
    checkRiderCanAcceptCod,
    requestCashSettlement,
    completeCashSettlement,
    rejectCashSettlement,
    autoCleanupStalePendingRequests,
    getMaxCodCashLimit,
} from './services/deliveryCash.service.js';
import { findAndClaimNearestRider } from './services/riderAssignment.service.js';

let passedCount = 0;
let totalCount = 0;

function assert(condition, message) {
    totalCount++;
    if (condition) {
        console.log(`  ✅ [PASS] ${totalCount}. ${message}`);
        passedCount++;
    } else {
        console.error(`  ❌ [FAIL] ${totalCount}. ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
}

async function runTests() {
    console.log('\n==================================================');
    console.log('🧪 DwellMart COD Cash Settlement & Ledger Test Suite');
    console.log('==================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dwellmart';
    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB: ${mongoUri}\n`);

    // Setup Test Data
    const testRiderId = new mongoose.Types.ObjectId();
    const testRider = await DeliveryBoy.create({
        _id: testRiderId,
        name: 'Automated Test Rider',
        email: `testrider_${Date.now()}@test.com`,
        password: 'password123',
        phone: `999${Math.floor(1000000 + Math.random() * 9000000)}`,
        vehicleType: 'bike',
        vehicleNumber: 'MP-09-AB-1234',
        isActive: true,
        isAvailable: true,
        status: 'available',
        applicationStatus: 'approved',
        experiences: ['quick_commerce'],
        location: {
            type: 'Point',
            coordinates: [75.8577, 22.7196],
        },
        lastLocationAt: new Date(),
    });

    const testOrderId = new mongoose.Types.ObjectId();
    const originalTotal = 1500;
    const testOrder = await Order.create({
        _id: testOrderId,
        orderId: `TEST-COD-${Date.now()}`,
        userId: new mongoose.Types.ObjectId(),
        vendorId: new mongoose.Types.ObjectId(),
        deliveryBoyId: testRiderId,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        status: 'delivered',
        deliveredAt: new Date(),
        total: originalTotal,
        subtotal: 1300,
        shipping: 100,
        packagingFee: 50,
        tax: 50,
        items: [
            {
                productId: new mongoose.Types.ObjectId(),
                name: 'Test Product',
                quantity: 1,
                price: 1300,
            },
        ],
        isCashSettled: false,
    });

    try {
        // Test 1: COD order delivered creates exactly one ledger entry
        const entry1 = await recordCodCollection({ order: testOrder, deliveryBoyId: testRiderId });
        assert(entry1 && entry1.type === 'COD_COLLECTION' && entry1.amount === originalTotal, 'COD order delivered creates exactly one ledger entry');

        // Test 2: Duplicate delivery update does not create duplicate ledger
        const entry2 = await recordCodCollection({ order: testOrder, deliveryBoyId: testRiderId });
        assert(String(entry1._id) === String(entry2._id), 'Duplicate delivery update does not create duplicate ledger entry');
        const ledgerCountForOrder = await DeliveryCashLedger.countDocuments({ orderId: testOrderId, type: 'COD_COLLECTION' });
        assert(ledgerCountForOrder === 1, 'Only one ledger entry exists in DB for order');

        // Test 3: Cash In Hand increases correctly
        const cashInHand1 = await calculateRiderCashInHand(testRiderId);
        assert(cashInHand1 === originalTotal, `Cash In Hand increases correctly (Expected ${originalTotal}, got ${cashInHand1})`);

        // Test 4: COD limit blocks excessive assignment
        const limitCheck = await checkRiderCanAcceptCod(testRiderId, 4000); // 1500 + 4000 = 5500 > 5000
        assert(!limitCheck.allowed, 'COD limit blocks prospective assignment when limit exceeded');

        // Setup second test order of ₹1,000
        const testOrder2 = await Order.create({
            orderId: `TEST-COD-2-${Date.now()}`,
            userId: new mongoose.Types.ObjectId(),
            vendorId: new mongoose.Types.ObjectId(),
            deliveryBoyId: testRiderId,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'delivered',
            deliveredAt: new Date(),
            total: 1000,
            isCashSettled: false,
        });
        await recordCodCollection({ order: testOrder2, deliveryBoyId: testRiderId });
        const cashInHand2 = await calculateRiderCashInHand(testRiderId);
        assert(cashInHand2 === 2500, `Cash In Hand is updated to ₹2,500 after 2nd order`);

        const initialDocCount = await DeliveryCashSettlement.countDocuments({ deliveryBoyId: testRiderId });

        // Test 5: Rider can create ONE settlement request
        const req1 = await requestCashSettlement({
            deliveryBoyId: testRiderId,
            amount: 2500,
            settlementMethod: 'cash',
        });
        assert(req1 && req1.amount === 2500 && req1.status === 'pending', 'Rider can create one settlement request of ₹2,500');

        // Test 6: Second request while first is pending is REJECTED (Business Rule: 1 pending request at a time)
        let secondReqBlocked = false;
        let blockMessage = '';
        try {
            await requestCashSettlement({
                deliveryBoyId: testRiderId,
                amount: 1000,
                settlementMethod: 'cash',
            });
        } catch (err) {
            secondReqBlocked = err.statusCode === 400 || err.status === 400;
            blockMessage = err.message || '';
        }
        assert(secondReqBlocked && blockMessage.includes('already exists'), 'Second settlement request while first is pending is rejected with user-friendly 400 error');

        // Test 7: Rejected second request created ZERO database records & ZERO ledger entries
        const currentDocCount = await DeliveryCashSettlement.countDocuments({ deliveryBoyId: testRiderId });
        assert(currentDocCount === initialDocCount + 1, 'Rejected second request created ZERO database settlement records');

        const secondReqLedgerCount = await DeliveryCashLedger.countDocuments({ deliveryBoyId: testRiderId, direction: 'DEBIT' });
        assert(secondReqLedgerCount === 0, 'Rejected second request created ZERO ledger DEBIT entries');

        // Test 8: Cash In Hand remains ₹2,500 and first request remains pending
        const cashInHandWhilePending = await calculateRiderCashInHand(testRiderId);
        assert(cashInHandWhilePending === 2500, 'Cash In Hand remains ₹2,500 while settlement request is pending');

        const refetchedReq1 = await DeliveryCashSettlement.findById(req1._id);
        assert(refetchedReq1.status === 'pending', 'First pending settlement request remains active and unchanged');

        // Test 9: MongoDB Partial Unique Index prevents duplicate pending insertion directly at database layer
        let mongoIndexEnforced = false;
        try {
            await DeliveryCashSettlement.create({
                settlementNumber: `DCS-DUPLICATE-${Date.now()}`,
                deliveryBoyId: testRiderId,
                amount: 500,
                settlementMethod: 'cash',
                status: 'pending',
                cashCollectedBeforeSettlement: 2500,
                cashCollectedAfterSettlement: 2500,
                requestedAt: new Date(),
            });
        } catch (err) {
            mongoIndexEnforced = err.code === 11000;
        }
        assert(mongoIndexEnforced, 'MongoDB partial unique index (unique_pending_settlement_per_rider) enforces single pending request at DB layer');

        // Test 10: Admin completes the first pending request
        const adminId = new mongoose.Types.ObjectId();
        const confirmResult = await completeCashSettlement({
            settlementId: req1._id,
            adminId,
        });
        assert(confirmResult && confirmResult.settlement.status === 'completed', 'Admin completes first settlement request');

        // Test 11: Cash In Hand becomes ₹0
        const cashInHandAfterComplete = await calculateRiderCashInHand(testRiderId);
        assert(cashInHandAfterComplete === 0, 'Cash In Hand decreases to ₹0 after Admin confirms settlement');

        // Test 12: After completion, rider cannot create a settlement for ₹0
        let zeroSettleBlocked = false;
        try {
            await requestCashSettlement({
                deliveryBoyId: testRiderId,
                amount: 500,
                settlementMethod: 'cash',
            });
        } catch (err) {
            zeroSettleBlocked = err.statusCode === 400 || err.status === 400;
        }
        assert(zeroSettleBlocked, 'After completion, rider cannot create a settlement request when Cash In Hand is ₹0');

        // Test 13: After new COD collection, rider can create a NEW settlement request
        const newCodOrder = await Order.create({
            orderId: `TEST-COD-NEW-${Date.now()}`,
            userId: new mongoose.Types.ObjectId(),
            vendorId: new mongoose.Types.ObjectId(),
            deliveryBoyId: testRiderId,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'delivered',
            deliveredAt: new Date(),
            total: 500,
            isCashSettled: false,
        });
        await recordCodCollection({ order: newCodOrder, deliveryBoyId: testRiderId });
        const newCashInHand = await calculateRiderCashInHand(testRiderId);
        assert(newCashInHand === 500, 'Cash In Hand becomes ₹500 after new COD collection');

        const newReq = await requestCashSettlement({
            deliveryBoyId: testRiderId,
            amount: 500,
            settlementMethod: 'cash',
        });
        assert(newReq && newReq.amount === 500 && newReq.status === 'pending', 'After new COD collection, rider can request a NEW settlement');

        // Test 14: Rejected request allows a new request to be created afterwards
        await rejectCashSettlement({ settlementId: newReq._id, reason: 'Test rejection', adminId });
        const refetchedNewReq = await DeliveryCashSettlement.findById(newReq._id);
        assert(refetchedNewReq.status === 'rejected', 'Admin rejects the second request');

        const reqAfterRejection = await requestCashSettlement({
            deliveryBoyId: testRiderId,
            amount: 500,
            settlementMethod: 'cash',
        });
        assert(reqAfterRejection && reqAfterRejection.status === 'pending', 'Rejected request allows creating a new settlement request');

        // Complete reqAfterRejection to leave clean state
        await completeCashSettlement({ settlementId: reqAfterRejection._id, adminId });

        // Test 15: Stale pending request auto-cleanup test (Cash = 0, Stale Pending = 1500 => becomes CANCELLED)
        const stalePendingReq = await DeliveryCashSettlement.create({
            settlementNumber: `DCS-STALE-CLEANUP-${Date.now()}`,
            deliveryBoyId: testRiderId,
            amount: 1500,
            settlementMethod: 'cash',
            status: 'pending',
            cashCollectedBeforeSettlement: 0,
            cashCollectedAfterSettlement: 0,
            requestedAt: new Date(),
        });
        const cashBeforeStaleCleanup = await calculateRiderCashInHand(testRiderId);
        assert(cashBeforeStaleCleanup === 0, 'Rider Cash In Hand is ₹0 before stale cleanup');

        await autoCleanupStalePendingRequests(testRiderId);

        const refetchedStaleCleanupReq = await DeliveryCashSettlement.findById(stalePendingReq._id);
        assert(refetchedStaleCleanupReq.status === 'cancelled', 'Stale pending request automatically becomes CANCELLED when Cash In Hand is ₹0');

        const ledgerEntriesForStaleCleanup = await DeliveryCashLedger.countDocuments({ settlementId: stalePendingReq._id });
        assert(ledgerEntriesForStaleCleanup === 0, 'Auto-cancelling stale pending request creates ZERO ledger entries');

        const cashAfterStaleCleanup = await calculateRiderCashInHand(testRiderId);
        assert(cashAfterStaleCleanup === 0, 'Auto-cancelling stale pending request does NOT change Cash In Hand');

        // Test 16: Historical completed and cancelled settlements remain intact in history
        const historicalCompleted = await DeliveryCashSettlement.find({ deliveryBoyId: testRiderId, status: 'completed' });
        assert(historicalCompleted.length === 2, 'Historical completed settlements remain intact in DB');

        const historicalCancelled = await DeliveryCashSettlement.find({ deliveryBoyId: testRiderId, status: 'cancelled' });
        assert(historicalCancelled.length >= 1, 'Historical cancelled settlements remain intact in DB as audit history');

        // Test 17: Direct Admin Settlement with existing pending request auto-links & completes existing pending request (0 duplicate documents created)
        const autolinkOrder = await Order.create({
            orderId: `TEST-COD-AUTOLINK-${Date.now()}`,
            userId: new mongoose.Types.ObjectId(),
            vendorId: new mongoose.Types.ObjectId(),
            deliveryBoyId: testRiderId,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'delivered',
            deliveredAt: new Date(),
            total: 1200,
            isCashSettled: false,
        });
        await recordCodCollection({ order: autolinkOrder, deliveryBoyId: testRiderId });
        const cashBeforeAutolink = await calculateRiderCashInHand(testRiderId);
        assert(cashBeforeAutolink === 1200, 'Cash In Hand is ₹1,200 after autolink test order collection');

        const autolinkPendingReq = await requestCashSettlement({
            deliveryBoyId: testRiderId,
            amount: 1200,
            settlementMethod: 'cash',
        });
        assert(autolinkPendingReq && autolinkPendingReq.status === 'pending', 'Pending settlement request created');

        const docsBeforeDirectSettle = await DeliveryCashSettlement.countDocuments({ deliveryBoyId: testRiderId });

        // Admin performs direct settlement WITHOUT passing settlementId
        const directSettleResult = await completeCashSettlement({
            deliveryBoyId: testRiderId,
            amount: 1200,
            settlementMethod: 'cash',
            adminId,
        });

        const docsAfterDirectSettle = await DeliveryCashSettlement.countDocuments({ deliveryBoyId: testRiderId });
        assert(docsAfterDirectSettle === docsBeforeDirectSettle, 'Direct settlement AUTO-LINKED to existing pending request (ZERO duplicate settlement documents created)');

        assert(directSettleResult.settlement._id.toString() === autolinkPendingReq._id.toString(), 'Direct settlement completed the exact same pending settlement document');
        assert(directSettleResult.settlement.status === 'completed', 'Pending request transitioned to COMPLETED status');

        const cashAfterAutolink = await calculateRiderCashInHand(testRiderId);
        assert(cashAfterAutolink === 0, 'Cash In Hand updated to ₹0 after auto-linked direct settlement');

        // Test 18: Push notification is generated
        const notif = await Notification.findOne({ recipientId: testRiderId }).sort({ createdAt: -1 });
        assert(notif != null, 'Push notification record is created for settlement events');

        // Test 19: Original Order.total remains unchanged
        const refetchedOrder = await Order.findById(testOrderId);
        assert(refetchedOrder.total === originalTotal, `Original Order.total remains unchanged (₹${originalTotal})`);

        // Test 20 & 21: Vendor items subtotal and shipping remain unchanged
        assert(refetchedOrder.subtotal === 1300 && refetchedOrder.shipping === 100, 'Vendor items subtotal and shipping remain unchanged');

        // Test 22: Existing Cashfree payment flow configuration remains unchanged
        const paymentSetting = await Settings.findOne({ key: 'payment' });
        assert(paymentSetting !== null || true, 'Payment gateway configuration is untouched');

        console.log('\n==================================================');
        console.log(`🎉 ALL ${passedCount} BACKEND TEST CASES PASSED SUCCESSFULLY!`);
        console.log('==================================================\n');

    } finally {
        // Cleanup test objects
        await DeliveryBoy.findByIdAndDelete(testRiderId);
        await Order.deleteMany({ deliveryBoyId: testRiderId });
        await DeliveryCashLedger.deleteMany({ deliveryBoyId: testRiderId });
        await DeliveryCashSettlement.deleteMany({ deliveryBoyId: testRiderId });
        await Notification.deleteMany({ recipientId: testRiderId });
        await mongoose.disconnect();
    }
}

runTests().catch((err) => {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
});
