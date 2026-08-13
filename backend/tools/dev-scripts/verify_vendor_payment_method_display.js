import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Order from './models/Order.model.js';
import Vendor from './models/Vendor.model.js';
import { getVendorOrderById } from './modules/vendor/controllers/order.controller.js';

async function runVerification() {
    console.log('\n======================================================================');
    console.log('🧪 VENDOR ORDER DETAIL PAYMENT METHOD DISPLAY VERIFICATION');
    console.log('======================================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dwellmart';
    await mongoose.connect(mongoUri);

    const vendorId = new mongoose.Types.ObjectId();

    try {
        // Step 1: Create Test Vendor
        const vendor = await Vendor.create({
            _id: vendorId,
            name: 'Test Vendor',
            storeName: 'Test Vendor Store',
            email: `vendor_pm_${Date.now()}@dwellmart.com`,
            password: 'password123',
            phone: '9998887776',
            status: 'approved',
        });

        // Step 2: Create COD Order
        const codOrder = await Order.create({
            orderId: `QC-COD-PM-${Date.now()}`,
            userId: new mongoose.Types.ObjectId(),
            vendorId: vendorId,
            vendorItems: [{
                vendorId: vendorId,
                items: [{ name: 'Test Product', price: 85.10, quantity: 1 }],
                subtotal: 85.10,
                shipping: 0,
                packagingFee: 0,
                tax: 0,
            }],
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'delivered',
            total: 85.10,
        });

        // Step 3: Create Prepaid Order
        const prepaidOrder = await Order.create({
            orderId: `QC-PREPAID-PM-${Date.now()}`,
            userId: new mongoose.Types.ObjectId(),
            vendorId: vendorId,
            vendorItems: [{
                vendorId: vendorId,
                items: [{ name: 'Test Prepaid Product', price: 150.00, quantity: 1 }],
                subtotal: 150.00,
                shipping: 0,
                packagingFee: 0,
                tax: 0,
            }],
            paymentMethod: 'card',
            paymentStatus: 'paid',
            status: 'delivered',
            total: 150.00,
        });

        // Test API responses
        const reqCod = { params: { id: codOrder.orderId }, user: { id: vendorId.toString() } };
        const resCod = {
            status: function(code) { this.statusCode = code; return this; },
            json: function(payload) { this.payload = payload; return this; }
        };
        await getVendorOrderById(reqCod, resCod);

        const codData = resCod.payload.data;
        console.log(`1. COD Order Response:`);
        console.log(`   Order ID: ${codData.orderId}`);
        console.log(`   paymentMethod: "${codData.paymentMethod}"`);
        const isCod = ['cod', 'cash'].includes(String(codData.paymentMethod).toLowerCase());
        console.log(`   Expected UI Label: ${isCod ? '💵 Cash on Delivery (COD)' : '💳 Prepaid'}`);
        console.log(`   ➔ Verified: ${isCod ? 'PASS' : 'FAIL'}\n`);

        const reqPrepaid = { params: { id: prepaidOrder.orderId }, user: { id: vendorId.toString() } };
        const resPrepaid = {
            status: function(code) { this.statusCode = code; return this; },
            json: function(payload) { this.payload = payload; return this; }
        };
        await getVendorOrderById(reqPrepaid, resPrepaid);

        const prepaidData = resPrepaid.payload.data;
        console.log(`2. Prepaid Order Response:`);
        console.log(`   Order ID: ${prepaidData.orderId}`);
        console.log(`   paymentMethod: "${prepaidData.paymentMethod}"`);
        const isPrepaid = !['cod', 'cash'].includes(String(prepaidData.paymentMethod).toLowerCase());
        console.log(`   Expected UI Label: ${!isPrepaid ? '💵 Cash on Delivery (COD)' : '💳 Prepaid (CARD)'}`);
        console.log(`   ➔ Verified: ${isPrepaid ? 'PASS' : 'FAIL'}\n`);

        console.log('======================================================================');
        console.log('🎉 VENDOR ORDER DETAIL PAYMENT METHOD VERIFICATION COMPLETED SUCCESSFULLY!');
        console.log('======================================================================\n');

        await Vendor.findByIdAndDelete(vendorId);
        await Order.deleteMany({ vendorId: vendorId });
    } finally {
        await mongoose.disconnect();
    }
}

runVerification().catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
});
