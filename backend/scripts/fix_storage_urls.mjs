import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://DwellMart:DwellMart123456@cluster0.fg2wgjg.mongodb.net/DwellMart';
const OLD_PREFIX = 'http://localhost:5000/images/';
const NEW_PREFIX = 'https://dwellmart.in/images/';

async function fixUrls() {
  console.log('Connecting to MongoDB...');
  const conn = await mongoose.connect(MONGO_URI);
  const db = conn.connection.db;

  const collections = [
    { name: 'categories', fields: ['image', 'icon'] },
    { name: 'products', fields: ['image', 'images'] },
    { name: 'brands', fields: ['logo'] },
    { name: 'banners', fields: ['image', 'mobileImage'] },
    { name: 'users', fields: ['avatar'] },
    { name: 'vendors', fields: ['logo', 'banner'] },
    { name: 'vendordocuments', fields: ['fileUrl'] },
  ];

  for (const { name, fields } of collections) {
    console.log(`\nProcessing ${name}...`);
    let updatedCount = 0;

    for (const field of fields) {
      if (field === 'images') {
        // Handle array field
        const docs = await db.collection(name).find({ 'images': { $regex: 'localhost:5000' } }).toArray();
        for (const doc of docs) {
          const newImages = (doc.images || []).map((img) =>
            typeof img === 'string' && img.startsWith(OLD_PREFIX)
              ? img.replace(OLD_PREFIX, NEW_PREFIX)
              : img
          );
          await db.collection(name).updateOne({ _id: doc._id }, { $set: { images: newImages } });
          updatedCount++;
        }
      } else {
        // Handle string field
        const query = { [field]: { $regex: 'localhost:5000' } };
        const docs = await db.collection(name).find(query).toArray();
        for (const doc of docs) {
          const oldVal = doc[field];
          if (typeof oldVal === 'string' && oldVal.startsWith(OLD_PREFIX)) {
            const newVal = oldVal.replace(OLD_PREFIX, NEW_PREFIX);
            await db.collection(name).updateOne({ _id: doc._id }, { $set: { [field]: newVal } });
            updatedCount++;
          }
        }
      }
    }

    console.log(`  Updated ${updatedCount} document fields in ${name}.`);
  }

  console.log('\nAll localhost:5000 URLs updated to https://dwellmart.in/images/ successfully!');
  await mongoose.disconnect();
}

fixUrls().catch(console.error);
