import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection;

  const wsVendors = await db.collection('vendors').find({
    $or: [{ vendorType: 'wholesale' }, { 'sellingChannels.wholesale.enabled': true }]
  }).toArray();
  const wsVendorIds = wsVendors.map(v => v._id);
  const wsVendorStringIds = wsVendors.map(v => String(v._id));

  const countObj = await db.collection('products').countDocuments({ vendorId: { $in: wsVendorIds } });
  const countStr = await db.collection('products').countDocuments({ vendorId: { $in: wsVendorStringIds } });
  const countAllVendor = await db.collection('products').countDocuments({ vendorId: { $exists: true, $ne: null } });

  const someProducts = await db.collection('products').find({}).limit(10).project({ name: 1, vendorId: 1, vendor: 1 }).toArray();

  console.log({
    wsVendorsCount: wsVendors.length,
    countObj,
    countStr,
    countAllVendor,
    someProducts,
  });

  await mongoose.disconnect();
}

run().catch(console.error);
