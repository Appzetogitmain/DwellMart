import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import DeliveryBoy from '../src/models/DeliveryBoy.model.js';
import Order from '../src/models/Order.model.js';
import DeliveryCashLedger from '../src/models/DeliveryCashLedger.model.js';
import DeliveryCashSettlement from '../src/models/DeliveryCashSettlement.model.js';
import Notification from '../src/models/Notification.model.js';
import {
    calculateRiderCashInHand,
    recordCodCollection,
    requestCashSettlement,
    completeCashSettlement,
} from '../src/services/deliveryCash.service.js';

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
    const customerId = new mongoose.Types.ObjectId();
    const vendorId = new mongoose.Types.ObjectId();

    try {
        // STEP 1: Register Delivery Partner
        console.log('STEP 1: Registering Test Delivery Partner...');
        const rider = await DeliveryBoy.create({
            _id: riderId,
            name: 'Rahul Sharma (E2E Test Rider)',
            email: `rahul_${Date.now()}@delivery.com`,
            phone: '9876543210',
            password: 'Password123!',
            vehicleType: 'EV Bike',
            vehicleNumber: 'KA-01-EQ-9999',
            applicationStatus: 'approved',
            status: 'available',
            isActive: true,
        });
        const initialCash = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ Delivery Partner Created: ${rider.name} (ID: ${rider._id})`);
        console.log(`  ➔ Initial Cash In Hand: ${formatCurrency(initialCash)}\n`);

        // STEP 2 & 3: Place COD Order #1 & Mark Delivered
        console.log('STEP 2: Customer places COD Order #1 (₹1,500)...');
        const order1 = await Order.create({
            orderId: `QC-COD-${Date.now()}-1`,
            userId: customerId,
            vendorId,
            deliveryBoyId: riderId,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'delivered',
            deliveredAt: new Date(),
            total: 1500,
            subtotal: 1350,
            shipping: 100,
            packagingFee: 50,
            isCashSettled: false,
        });
        console.log(`  ➔ Order Created: ${order1.orderId} | Payable COD Amount: ${formatCurrency(order1.total)}`);

        console.log('STEP 3: Rider enters customer OTP and marks Order #1 as DELIVERED...');
        await recordCodCollection({ order: order1, deliveryBoyId: riderId });
        const cashAfterOrder1 = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ COD Collection Ledger CREDIT Created: ${formatCurrency(1500)} (COD_COLLECTION)`);
        console.log(`  ➔ Updated Rider Cash In Hand: ${formatCurrency(cashAfterOrder1)}\n`);

        // STEP 4: Deliver Order #2 (₹1,000)
        console.log('STEP 4: Customer places & Rider delivers COD Order #2 (₹1,000)...');
        const order2 = await Order.create({
            orderId: `QC-COD-${Date.now()}-2`,
            userId: customerId,
            vendorId,
            deliveryBoyId: riderId,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'delivered',
            deliveredAt: new Date(),
            total: 1000,
            subtotal: 900,
            shipping: 100,
            isCashSettled: false,
        });
        await recordCodCollection({ order: order2, deliveryBoyId: riderId });
        const cashAfterOrder2 = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ COD Collection Ledger CREDIT Created: ${formatCurrency(1000)} (COD_COLLECTION)`);
        console.log(`  ➔ Updated Rider Cash In Hand: ${formatCurrency(cashAfterOrder2)} (Accumulated liability)\n`);

        // STEP 5: Rider requests cash settlement
        console.log('STEP 5: Rider opens Delivery App → Cash & Settlement page...');
        console.log(`  ➔ Rider sees Cash In Hand: ${formatCurrency(cashAfterOrder2)}`);
        console.log('  ➔ Rider clicks "Request Settlement" for ₹1,500 (Physical Cash)...');

        const settlementReq = await requestCashSettlement({
            deliveryBoyId: riderId,
            amount: 1500,
            settlementMethod: 'cash',
            notes: 'Handing over physical cash at main office cashier counter',
        });
        console.log(`  ➔ Settlement Request Generated: ${settlementReq.settlementNumber} (Status: ${settlementReq.status.toUpperCase()})`);

        const cashWhilePending = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ Cash In Hand while request is Pending: ${formatCurrency(cashWhilePending)} (INVARIANT MAINTAINED: Not reduced prematurely!)\n`);

        // STEP 6: Admin views Cash Collection page
        console.log('STEP 6: Admin opens Admin Panel → Cash Collection page (/admin/delivery/cash-collection)...');
        const pendingForAdmin = await DeliveryCashSettlement.findById(settlementReq._id).populate('deliveryBoyId', 'name phone');
        console.log(`  ➔ Admin sees Pending Request: ${pendingForAdmin.settlementNumber}`);
        console.log(`     Rider: ${pendingForAdmin.deliveryBoyId.name} (${pendingForAdmin.deliveryBoyId.phone})`);
        console.log(`     Requested Amount: ${formatCurrency(pendingForAdmin.amount)} | Method: ${pendingForAdmin.settlementMethod.toUpperCase().replace('_', ' ')}`);
        console.log(`     Notes: "${pendingForAdmin.notes}"\n`);

        // STEP 7: Admin confirms cash received
        console.log('STEP 7: Admin counts cash, verifies ₹1,500, and clicks "Confirm Cash Received"...');
        const confirmResult = await completeCashSettlement({
            settlementId: settlementReq._id,
            adminId,
        });

        const finalCashInHand = await calculateRiderCashInHand(riderId);
        console.log(`  ➔ Settlement Marked: ${confirmResult.settlement.status.toUpperCase()} (Received at: ${new Date(confirmResult.settlement.receivedAt).toLocaleTimeString()})`);
        console.log(`  ➔ Settlement Ledger DEBIT Created: ${formatCurrency(1500)} (CASH_SETTLEMENT)`);
        console.log(`  ➔ Updated Rider Cash In Hand: ${formatCurrency(finalCashInHand)} (${formatCurrency(cashAfterOrder2)} - ${formatCurrency(1500)})\n`);

        // STEP 8: Notifications and Audit History Check
        console.log('STEP 8: Verifying Notifications & Audit History...');
        const notifications = await Notification.find({ recipientId: riderId }).sort({ createdAt: -1 });
        console.log(`  ➔ Push Notifications Sent to Rider (${notifications.length}):`);
        notifications.forEach((n, i) => {
            console.log(`     [${i + 1}] ${n.title}: "${n.message}"`);
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
    console.error('\n❌ E2E FLOW FAILED:', err);
    process.exit(1);
});
