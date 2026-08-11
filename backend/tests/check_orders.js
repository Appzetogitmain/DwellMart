import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkOrders() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const count = await Order.countDocuments({
            'integration.eligibleForPartner': true,
            status: { $in: ['pending', 'processing', 'shipped'] }
        });
        console.log('Eligible orders count:', count);
        
        if (count > 0) {
            const orders = await Order.find({
                'integration.eligibleForPartner': true,
                status: { $in: ['pending', 'processing', 'shipped'] }
            }).limit(1);
            console.log('Sample Order ID:', orders[0].orderId);
        } else {
            console.log('No eligible orders found.');
        }
        
        mongoose.connection.close();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOrders();
