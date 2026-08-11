/**
 * Read-Only Database Audit Script for Delivery Fee & Rider Earnings
 * 
 * Usage:
 *   node tests/audit_delivery_fee_db.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const runAudit = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected successfully.\n');

        const Order = (await import('../src/models/Order.model.js')).default;
        const DeliveryBoy = (await import('../src/models/DeliveryBoy.model.js')).default;
        const DeliveryCashLedger = (await import('../src/models/DeliveryCashLedger.model.js')).default;
        const DeliveryCashSettlement = (await import('../src/models/DeliveryCashSettlement.model.js')).default;
        const Settings = (await import('../src/models/Settings.model.js')).default;

        // 1. Delivery Settings
        console.log('=== 1. ADMIN DELIVERY SETTINGS IN MONGO ===');
        const qcSettings = await Settings.findOne({ key: 'quick_commerce' }).lean();
        const genDeliverySettings = await Settings.findOne({ key: 'delivery' }).lean();
        console.log('Quick Commerce Settings:', JSON.stringify(qcSettings?.value || {}, null, 2));
        console.log('General Delivery Settings:', JSON.stringify(genDeliverySettings?.value || {}, null, 2));
        console.log('\n');

        // 2. Count of Delivery Boys
        console.log('=== 2. DELIVERY BOY ACCOUNTS ===');
        const totalBoys = await DeliveryBoy.countDocuments();
        console.log(`Total Delivery Boys in DB: ${totalBoys}`);
        const sampleBoys = await DeliveryBoy.find().limit(5).select('name email phone status cashCollected totalDeliveries isActive').lean();
        console.log('Sample Delivery Boys:', sampleBoys);
        console.log('\n');

        // 3. Delivered Orders with Delivery Fees
        console.log('=== 3. RECENT DELIVERED ORDERS WITH SHIPPING/DELIVERY FEE ===');
        const deliveredOrders = await Order.find({ status: 'delivered' })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('orderId status shipping total paymentMethod deliveryBoyId experience quickCommerce')
            .lean();
        console.log(`Delivered Orders Count: ${deliveredOrders.length}`);
        deliveredOrders.forEach((ord) => {
            console.log(`Order ${ord.orderId}: status=${ord.status}, shipping=₹${ord.shipping}, total=₹${ord.total}, payMethod=${ord.paymentMethod}, riderId=${ord.deliveryBoyId}, exp=${ord.experience}`);
        });
        console.log('\n');

        // 4. Cash Ledger Entries
        console.log('=== 4. DELIVERY CASH LEDGER ENTRIES ===');
        const ledgerCount = await DeliveryCashLedger.countDocuments();
        console.log(`Total Cash Ledger Entries: ${ledgerCount}`);
        const sampleLedger = await DeliveryCashLedger.find().sort({ createdAt: -1 }).limit(5).lean();
        console.log('Sample Ledger Entries:', sampleLedger);
        console.log('\n');

        // 5. Cash Settlement Requests
        console.log('=== 5. DELIVERY CASH SETTLEMENT REQUESTS ===');
        const settlementCount = await DeliveryCashSettlement.countDocuments();
        console.log(`Total Settlement Requests: ${settlementCount}`);
        const sampleSettlements = await DeliveryCashSettlement.find().sort({ createdAt: -1 }).limit(5).lean();
        console.log('Sample Settlement Requests:', sampleSettlements);
        console.log('\n');

        await mongoose.disconnect();
        console.log('Audit completed cleanly.');
    } catch (err) {
        console.error('Audit error:', err);
        process.exit(1);
    }
};

runAudit();
