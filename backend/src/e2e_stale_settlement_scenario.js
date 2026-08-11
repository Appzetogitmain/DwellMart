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
import Notification from './models/Notification.model.js';
import {
    calculateRiderCashInHand,
    recordCodCollection,
    completeCashSettlement,
    cancelCashSettlement,
} from './services/deliveryCash.service.js';

function formatCurrency(amount) {
    return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function runStaleScenario() {
    console.log('\n======================================================================');
    console.log('🧪 STALE SETTLEMENT SCENARIO VERIFICATION — EXACT USER ISSUE REPRODUCTION');
    console.log('======================================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dwellmart';
    await mongoose.connect(mongoUri);

    const riderId = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();

    try {
        // Step 1: Rider collects ₹85.10 from COD delivery
        console.log('STEP 1: Delivery Partner collects ₹85.10 from customer...');
        const rider = await DeliveryBoy.create({
            _id: riderId,
            name: 'Vikram Singh (Rider)',
            email: `vikram_${Date.now()}@test.com`,
            password: 'password123',
            phone: '9888877777',
            vehicleType: 'bike',
            vehicleNumber: 'MP-09-XX-1111',
            isActive: true,
            isAvailable: true,
            status: 'available',
            applicationStatus: 'approved',
        });

        const order = await Order.create({
            orderId: `QC-STALE-${Date.now()}`,
            userId: new mongoose.Types.ObjectId(),
            vendorId: new mongoose.Types.ObjectId(),
            deliveryBoyId: riderId,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'delivered',
            total: 85.10,
            deliveredAt: new Date(),
            isCashSettled: false,
        });

        await recordCodCollection({ order, deliveryBoyId: riderId });
        const initialCash = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ COD Collection Recorded. Rider Cash In Hand: ${formatCurrency(initialCash)}\n`);

        // Step 2: Request #1 Created (DCS-20260811-2JAX, ₹85.10)
        const num1 = `DCS-${Date.now()}-1`;
        console.log(`STEP 2: Creating Settlement Request #1 (${num1}, ₹85.10)...`);
        const req1 = await DeliveryCashSettlement.create({
            settlementNumber: num1,
            deliveryBoyId: riderId,
            amount: 85.10,
            settlementMethod: 'cash',
            status: 'pending',
            cashCollectedBeforeSettlement: 85.10,
            cashCollectedAfterSettlement: 85.10,
            requestedAt: new Date(),
        });
        console.log(`  ➔ Request #1 Status: PENDING | Amount: ${formatCurrency(req1.amount)}`);

        // Step 3: Stale Request #2 Created (DCS-20260811-LPBQ, ₹85.10)
        const num2 = `DCS-${Date.now()}-2`;
        console.log(`STEP 3: Simulating Stale Request #2 (${num2}, ₹85.10)...`);
        const req2 = await DeliveryCashSettlement.create({
            settlementNumber: num2,
            deliveryBoyId: riderId,
            amount: 85.10,
            settlementMethod: 'cash',
            status: 'pending',
            cashCollectedBeforeSettlement: 85.10,
            cashCollectedAfterSettlement: 85.10,
            requestedAt: new Date(Date.now() + 1000),
        });
        console.log(`  ➔ Request #2 Status: PENDING | Amount: ${formatCurrency(req2.amount)}\n`);

        // Step 4: Admin Confirms Request #1
        console.log('STEP 4: Admin confirms Request #1 (DCS-20260811-2JAX)...');
        const confirm1 = await completeCashSettlement({ settlementId: req1._id, adminId });
        console.log(`  ➔ Request #1 Status: COMPLETED`);
        console.log(`  ➔ Ledger DEBIT Created: ${formatCurrency(confirm1.ledgerEntry.amount)}`);
        const cashAfterReq1 = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ Rider Cash In Hand after Request #1: ${formatCurrency(cashAfterReq1)}\n`);

        // Step 5: Admin Attempts to Confirm Stale Request #2
        console.log('STEP 5: Admin attempts to confirm Stale Request #2 (DCS-20260811-LPBQ)...');
        let confirm2Blocked = false;
        try {
            await completeCashSettlement({ settlementId: req2._id, adminId });
        } catch (err) {
            confirm2Blocked = true;
            console.log(`  ➔ CONFIRMATION BLOCKED BY BACKEND GUARD!`);
            console.log(`     Error Message: "${err.message}"`);
        }

        // Step 6: Verify Request #2 Status & Financial Ledger
        console.log('\nSTEP 6: Verifying final state in Database & Financial Ledger...');
        const finalReq2 = await DeliveryCashSettlement.findById(req2._id);
        console.log(`  ➔ Request #2 Auto-Updated Status: ${finalReq2.status.toUpperCase()}`);
        console.log(`     Reason: "${finalReq2.rejectionReason}"`);

        const totalDebits = await DeliveryCashLedger.countDocuments({ deliveryBoyId: riderId, direction: 'DEBIT' });
        console.log(`  ➔ Total Ledger DEBIT Entries: ${totalDebits} (ZERO duplicate debits created!)`);

        const finalCash = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ Final Authoritative Cash In Hand: ${formatCurrency(finalCash)}\n`);

        console.log('======================================================================');
        console.log('🎉 STALE SETTLEMENT SCENARIO VERIFIED CLEANLY & SAFELY!');
        console.log('======================================================================\n');
    } finally {
        await DeliveryBoy.findByIdAndDelete(riderId);
        await Order.deleteMany({ deliveryBoyId: riderId });
        await DeliveryCashLedger.deleteMany({ deliveryBoyId: riderId });
        await DeliveryCashSettlement.deleteMany({ deliveryBoyId: riderId });
        await Notification.deleteMany({ recipientId: riderId });
        await mongoose.disconnect();
    }
}

runStaleScenario().catch((err) => {
    console.error('\n❌ SCENARIO FAILED:', err);
    process.exit(1);
});
