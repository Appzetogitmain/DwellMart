import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkCloudinaryUrlsInDb() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  const checks = [
    { col: 'categories', filter: { image: /cloudinary\.com/ } },
    { col: 'products', filter: { $or: [{ image: /cloudinary\.com/ }, { images: /cloudinary\.com/ }] } },
    { col: 'brands', filter: { logo: /cloudinary\.com/ } },
    { col: 'banners', filter: { image: /cloudinary\.com/ } },
    { col: 'users', filter: { avatar: /cloudinary\.com/ } },
    { col: 'vendors', filter: { $or: [{ logo: /cloudinary\.com/ }, { 'documents.gst': /cloudinary\.com/ }, { 'documents.pan': /cloudinary\.com/ }, { 'documents.tradeLicense.url': /cloudinary\.com/ }] } },
    { col: 'vendordocuments', filter: { fileUrl: /cloudinary\.com/ } },
    { col: 'deliveryboys', filter: { $or: [{ avatar: /cloudinary\.com/ }, { 'documents.aadhaarCard.front': /cloudinary\.com/ }] } },
    { col: 'campaigns', filter: { image: /cloudinary\.com/ } }
  ];

  const results = {};
  for (const c of checks) {
    try {
      const count = await db.collection(c.col).countDocuments(c.filter);
      results[c.col] = count;
    } catch (e) {
      results[c.col] = e.message;
    }
  }

  console.log('Targeted Cloudinary URL counts:', results);
  await mongoose.disconnect();
}

checkCloudinaryUrlsInDb().catch(console.error);
