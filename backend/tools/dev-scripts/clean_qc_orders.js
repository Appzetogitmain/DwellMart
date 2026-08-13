import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI;
await mongoose.connect(MONGO_URI);

const { default: Order }       = await import('./models/Order.model.js');
const { default: DeliveryBoy } = await import('./models/DeliveryBoy.model.js');

const res = await Order.updateMany(
  { experience: 'quick_commerce', status: { $nin: ['delivered', 'cancelled'] } },
  {
    $set: {
      status: 'delivered',
      'quickCommerce.status': 'delivered',
      deliveredAt: new Date(),
    }
  }
);

console.log('Cleaned up open QC orders:', res.modifiedCount);

await DeliveryBoy.updateMany(
  { email: 'delivery@delivery.com' },
  { $set: { activeOrderId: null, status: 'available', isAvailable: true, lastLocationAt: new Date() } }
);

console.log('Rider delivery@delivery.com reset to AVAILABLE with null activeOrderId and FRESH lastLocationAt.');

await mongoose.disconnect();
