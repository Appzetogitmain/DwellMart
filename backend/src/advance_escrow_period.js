import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from './models/Order.model.js';
import Commission from './models/Commission.model.js';
import Vendor from './models/Vendor.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Script to simulate passing the 7-day escrow period for vendor orders.
 * Updates order `deliveredAt` timestamps to 8 days in the past so earnings
 * mature from Locked Balance into Withdrawable Balance instantly!
 */
const advanceEscrowPeriod = async () => {
    try {
        console.log('=== ESCROW PERIOD FAST-FORWARD SCRIPT ===\n');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✔ MongoDB Connected.');

        const vendorDoc = await Vendor.findOne({ email: /qc\.vendor/i }).lean();
        if (!vendorDoc) {
            console.error('❌ Vendor qc.vendor@dwellmart.com not found.');
            return;
        }

        console.log(`Vendor: ${vendorDoc.storeName} (ID: ${vendorDoc._id})`);

        // Calculate timestamp 8 days in the past
        const eightDaysAgo = new Date();
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

        // Find all delivered orders for this vendor
        const filter = {
            $or: [
                { vendorId: vendorDoc._id },
                { 'vendorItems.vendorId': vendorDoc._id }
            ],
            status: 'delivered'
        };

        const deliveredOrders = await Order.find(filter);
        console.log(`Found ${deliveredOrders.length} delivered order(s) for vendor.`);

        if (deliveredOrders.length === 0) {
            console.log('No delivered orders found to advance escrow.');
            return;
        }

        const orderIds = deliveredOrders.map(o => o._id);

        // 1. Update deliveredAt on orders to 8 days ago
        const orderResult = await Order.updateMany(
            { _id: { $in: orderIds } },
            { $set: { deliveredAt: eightDaysAgo } }
        );
        console.log(`✔ Updated deliveredAt to 8 days ago (${eightDaysAgo.toLocaleDateString()}) for ${orderResult.modifiedCount} order(s).`);

        // 2. Update createdAt on Commission records to 8 days ago
        const commResult = await Commission.updateMany(
            { orderId: { $in: orderIds } },
            { $set: { createdAt: eightDaysAgo } }
        );
        console.log(`✔ Updated Commission createdAt to 8 days ago for ${commResult.modifiedCount} record(s).`);

        // 3. Re-calculate vendor earnings to confirm withdrawable balance
        const allCommissions = await Commission.find({ vendorId: vendorDoc._id })
            .populate('orderId', 'orderId status deliveredAt')
            .lean();

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const summary = allCommissions.reduce((acc, doc) => {
            const status = String(doc.status || 'pending');
            const orderStatus = String(doc.orderId?.status || '').toLowerCase();
            const effectiveStatus = orderStatus === 'cancelled' ? 'cancelled' : status;
            const earnings = Number(doc.vendorEarnings || 0);

            if (effectiveStatus !== 'cancelled') {
                acc.totalEarnings += earnings;
            }

            if (effectiveStatus === 'pending') {
                const deliveredAt = doc.orderId?.deliveredAt;
                if (orderStatus === 'delivered' && deliveredAt && new Date(deliveredAt) <= sevenDaysAgo) {
                    acc.withdrawableEarnings += earnings;
                } else {
                    acc.lockedEarnings += earnings;
                }
            }
            return acc;
        }, { totalEarnings: 0, withdrawableEarnings: 0, lockedEarnings: 0 });

        console.log('\n======================================================');
        console.log('          UPDATED VENDOR WALLET SUMMARY              ');
        console.log('======================================================');
        console.log(`  - Total Earnings:        ₹${summary.totalEarnings.toFixed(2)}`);
        console.log(`  - Locked Balance:        ₹${summary.lockedEarnings.toFixed(2)}`);
        console.log(`  - Withdrawable Balance:  ₹${summary.withdrawableEarnings.toFixed(2)} 🟢`);
        console.log(`  - Payout Threshold:      ₹500.00`);
        console.log(`  - Payout Request Status: ${summary.withdrawableEarnings >= 500 ? 'AVAILABLE (>= ₹500)' : 'Awaiting ₹500 minimum threshold'}`);
        console.log('======================================================\n');

    } catch (err) {
        console.error('Escrow script error:', err);
    } finally {
        await mongoose.disconnect();
    }
};

advanceEscrowPeriod();
