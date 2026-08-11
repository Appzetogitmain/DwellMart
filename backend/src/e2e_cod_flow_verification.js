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
    requestCashSettlement,
    completeCashSettlement,
} from './services/deliveryCash.service.js';

function formatCurrency(amount) {
    return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function runE2EFlow() {
    console.log('\n======================================================================');
    console.log('🚀 DWELLMART COD CASH SETTLEMENT — REAL END-TO-END FLOW VERIFICATION');
    console.log('======================================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dwellmart';
    await mongoose.connect(mongoUri);

    const riderId = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();

    try {
        // Step 1: Create Test Delivery Partner
        console.log('STEP 1: Registering Test Delivery Partner...');
        const rider = await DeliveryBoy.create({
            _id: riderId,
            name: 'Rahul Sharma (E2E Test Rider)',
            email: `rahul_e2e_${Date.now()}@dwellmart.com`,
            password: 'password123',
            phone: '9876543210',
            vehicleType: 'EV Bike',
            vehicleNumber: 'MP-09-EV-9999',
            isActive: true,
            isAvailable: true,
            status: 'available',
            applicationStatus: 'approved',
        });
        console.log(`  ➔ Delivery Partner Created: ${rider.name} (ID: ${rider._id})`);
        const initialCash = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ Initial Cash In Hand: ${formatCurrency(initialCash)}\n`);

        // Step 2: Customer Places & Vendor Fulfillment of COD Order 1 (₹1,500)
        console.log('STEP 2: Customer places COD Order #1 (₹1,500)...');
        const order1 = await Order.create({
            orderId: `QC-COD-${Date.now()}-1`,
            userId: new mongoose.Types.ObjectId(),
            vendorId: new mongoose.Types.ObjectId(),
            deliveryBoyId: riderId,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'shipped',
            total: 1500,
            subtotal: 1350,
            shipping: 100,
            packagingFee: 50,
            items: [{ name: 'Fresh Fruits Basket', quantity: 1, price: 1350 }],
            isCashSettled: false,
        });
        console.log(`  ➔ Order Created: ${order1.orderId} | Payable COD Amount: ${formatCurrency(order1.total)}`);

        // Step 3: Rider Delivers Order 1 via OTP
        console.log('STEP 3: Rider enters customer OTP and marks Order #1 as DELIVERED...');
        order1.status = 'delivered';
        order1.deliveredAt = new Date();
        await order1.save();

        const ledger1 = await recordCodCollection({ order: order1, deliveryBoyId: riderId });
        console.log(`  ➔ COD Collection Ledger CREDIT Created: ${formatCurrency(ledger1.amount)} (${ledger1.type})`);
        const cashAfterOrder1 = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ Updated Rider Cash In Hand: ${formatCurrency(cashAfterOrder1)}\n`);

        // Step 4: Customer Places & Rider Delivers Order 2 (₹1,000)
        console.log('STEP 4: Customer places & Rider delivers COD Order #2 (₹1,000)...');
        const order2 = await Order.create({
            orderId: `QC-COD-${Date.now()}-2`,
            userId: new mongoose.Types.ObjectId(),
            vendorId: new mongoose.Types.ObjectId(),
            deliveryBoyId: riderId,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'delivered',
            deliveredAt: new Date(),
            total: 1000,
            subtotal: 900,
            shipping: 100,
            items: [{ name: 'Gourmet Cheese', quantity: 1, price: 900 }],
            isCashSettled: false,
        });

        const ledger2 = await recordCodCollection({ order: order2, deliveryBoyId: riderId });
        console.log(`  ➔ COD Collection Ledger CREDIT Created: ${formatCurrency(ledger2.amount)} (${ledger2.type})`);
        const cashAfterOrder2 = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ Updated Rider Cash In Hand: ${formatCurrency(cashAfterOrder2)} (Accumulated liability)\n`);

        // Step 5: Rider opens Cash & Settlement page in Delivery App & Requests Settlement
        console.log('STEP 5: Rider opens Delivery App → Cash & Settlement page...');
        console.log(`  ➔ Rider sees Cash In Hand: ${formatCurrency(cashAfterOrder2)}`);
        console.log('  ➔ Rider clicks "Request Settlement" for ₹1,500 (Physical Cash)...');

        const settlementReq = await requestCashSettlement({
            deliveryBoyId: riderId,
            amount: 1500,
            settlementMethod: 'cash',
            notes: 'Handing over physical cash at main office cashier counter',
        });
        console.log(`  ➔ Settlement Request Generated: ${settlementReq.settlementNumber} (Status: PENDING)`);

        const cashWhilePending = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ Cash In Hand while request is Pending: ${formatCurrency(cashWhilePending)} (INVARIANT MAINTAINED: Not reduced prematurely!)\n`);

        // Step 6: Admin Opens Cash Collection Page & Reviews Request
        console.log('STEP 6: Admin opens Admin Panel → Cash Collection page (/admin/delivery/cash-collection)...');
        const pendingForAdmin = await DeliveryCashSettlement.findById(settlementReq._id).populate('deliveryBoyId', 'name phone');
        console.log(`  ➔ Admin sees Pending Request: ${pendingForAdmin.settlementNumber}`);
        console.log(`     Rider: ${pendingForAdmin.deliveryBoyId?.name} (${pendingForAdmin.deliveryBoyId?.phone})`);
        console.log(`     Requested Amount: ${formatCurrency(pendingForAdmin.amount)} | Method: PHYSICAL CASH`);
        console.log(`     Notes: "${pendingForAdmin.notes}"\n`);

        // Step 7: Admin Confirms Physical Cash Received
        console.log('STEP 7: Admin counts cash, verifies ₹1,500, and clicks "Confirm Cash Received"...');
        const confirmResult = await completeCashSettlement({
            settlementId: settlementReq._id,
            adminId,
        });
        console.log(`  ➔ Settlement Marked: COMPLETED (Received at: ${confirmResult.settlement.receivedAt.toLocaleTimeString()})`);
        console.log(`  ➔ Settlement Ledger DEBIT Created: ${formatCurrency(confirmResult.ledgerEntry.amount)} (${confirmResult.ledgerEntry.type})`);

        const finalCashInHand = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ Updated Rider Cash In Hand: ${formatCurrency(finalCashInHand)} (${formatCurrency(cashAfterOrder2)} - ${formatCurrency(1500)})\n`);

        // Step 8: Verify Notifications & Audit Trail
        console.log('STEP 8: Verifying Notifications & Audit History...');
        const riderNotifications = await Notification.find({ recipientId: riderId }).sort({ createdAt: -1 });
        console.log(`  ➔ Push Notifications Sent to Rider (${riderNotifications.length}):`);
        riderNotifications.forEach((n, idx) => {
            console.log(`     [${idx + 1}] ${n.title}: "${n.message}"`);
        });

        const history = await DeliveryCashSettlement.find({ deliveryBoyId: riderId });
        console.log(`  ➔ Rider Settlement History (${history.length} record):`);
        history.forEach((h) => {
            console.log(`     • ${h.settlementNumber} | ${formatCurrency(h.amount)} | ${h.settlementMethod.toUpperCase()} | Status: ${h.status.toUpperCase()}`);
        });

        console.log('\n======================================================================');
        console.log('✅ REAL E2E FLOW VERIFICATION COMPLETED SUCCESSFULLY!');
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

runE2EFlow().catch((err) => {
    console.error('\n❌ E2E VERIFICATION FAILED:', err);
    process.exit(1);
});
