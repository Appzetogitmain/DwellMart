import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function prepareOrder() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        // Find any order to reuse its data or just update its status
        let order = await Order.findOne({});
        if (!order) {
            console.log('No orders found at all. Creating a dummy order.');
            // This part is more complex as it needs products, users etc.
            // For now, let's assume we have at least one.
            process.exit(1);
        }

        console.log('Found order:', order.orderId, 'Current status:', order.status);
        
        // Update to make it eligible
        order.status = 'pending';
        order.integration = order.integration || {};
        order.integration.eligibleForPartner = true;
        order.integration.partnerStatus = 'READY_FOR_ASSIGNMENT';
        
        // Ensure it has shipping details if missing
        if (!order.shippingAddress || !order.shippingAddress.phone) {
            order.shippingAddress = {
                name: 'Test User',
                email: 'test@example.com',
                phone: '1234567890',
                address: '123 Test St',
                city: 'Test City',
                state: 'TS',
                zipCode: '12345',
                country: 'Test Country'
            };
        }

        await order.save();
        console.log('Order', order.orderId, 'is now READY for integration testing.');
        
        mongoose.connection.close();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

prepareOrder();
