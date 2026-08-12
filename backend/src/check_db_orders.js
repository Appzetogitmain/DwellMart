import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI;
await mongoose.connect(MONGO_URI);

const { default: DeliveryBoy } = await import('./models/DeliveryBoy.model.js');
const { default: Order }       = await import('./models/Order.model.js');

const rider = await DeliveryBoy.findOne({ email: 'delivery@delivery.com' }).lean();
console.log('=== DELIVERY AGENT STATUS ===');
console.log('Name:', rider?.name);
console.log('Email:', rider?.email);
console.log('Status:', rider?.status);
console.log('isAvailable:', rider?.isAvailable);
console.log('ActiveOrderId:', rider?.activeOrderId);
console.log('LastLocationAt:', rider?.lastLocationAt);

const riderOrders = await Order.find({
    deliveryBoyId: rider._id,
    status: { $nin: ['delivered', 'cancelled'] },
}).select('orderId status quickCommerce.status quickCommerce.assignment.status total createdAt').lean();

console.log('\n=== RIDER UNFINISHED ORDERS (' + riderOrders.length + ') ===');
console.log(JSON.stringify(riderOrders, null, 2));

const openQcOrders = await Order.find({
    experience: 'quick_commerce',
    status: { $nin: ['delivered', 'cancelled'] },
}).select('orderId status quickCommerce.status quickCommerce.assignment.status deliveryBoyId total createdAt').lean();

console.log('\n=== ALL OPEN QUICK COMMERCE ORDERS (' + openQcOrders.length + ') ===');
console.log(JSON.stringify(openQcOrders, null, 2));

await mongoose.disconnect();
