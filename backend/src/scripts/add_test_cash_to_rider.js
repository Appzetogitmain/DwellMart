import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Order from '../models/Order.model.js';
import { recordCodCollection, calculateRiderCashInHand } from '../services/deliveryCash.service.js';

async function addTestCash() {
    console.log('\n==================================================');
    console.log('💵 ADD TEST CASH TO DELIVERY PARTNER');
    console.log('==================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dwellmart';
    await mongoose.connect(mongoUri);

    try {
        // Find delivery boys
        const riders = await DeliveryBoy.find({ isActive: true }).select('_id name email phone');
        if (riders.length === 0) {
            console.log('❌ No active delivery partners found.');
            return;
        }

        console.log(`Found ${riders.length} active delivery partner(s):`);
        for (const rider of riders) {
            const currentCash = await calculateRiderCashInHand(rider._id);
            console.log(`  - ${rider.name} (${rider.email}) | Current Cash In Hand: ₹${currentCash}`);
        }

        // Target rider: delivery@delivery.com or first rider
        let targetRider = riders.find((r) => r.email === 'delivery@delivery.com') || riders[0];

        console.log(`\nAdding test COD order delivery of ₹1,500.00 for ${targetRider.name} (${targetRider.email})...`);

        const testOrder = await Order.create({
            orderId: `QC-TEST-COD-${Date.now()}`,
            userId: new mongoose.Types.ObjectId(),
            vendorId: new mongoose.Types.ObjectId(),
            deliveryBoyId: targetRider._id,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'delivered',
            deliveredAt: new Date(),
            total: 1500,
            subtotal: 1350,
            shipping: 100,
            packagingFee: 50,
            items: [{ name: 'Test Fresh Produce', quantity: 1, price: 1350 }],
            isCashSettled: false,
        });

        await recordCodCollection({ order: testOrder, deliveryBoyId: targetRider._id });

        const updatedCash = await calculateRiderCashInHand(targetRider._id);

        console.log(`\n🎉 SUCCESS! Test COD collection recorded.`);
        console.log(`   Rider: ${targetRider.name}`);
        console.log(`   Order ID: ${testOrder.orderId}`);
        console.log(`   Added COD Amount: ₹1,500.00`);
        console.log(`   Updated Cash In Hand: ₹${updatedCash.toFixed(2)}`);
        console.log('\nNow refresh your browser on /delivery/cash-settlements to test requesting settlement!\n');
    } finally {
        await mongoose.disconnect();
    }
}

addTestCash().catch((err) => {
    console.error('❌ Failed to add test cash:', err);
    process.exit(1);
});
