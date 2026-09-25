import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function verifyDb() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const sampleCat = await db.collection('categories').findOne({ image: { $regex: '/images/' } });
  console.log('Sample category image:', sampleCat?.name, '->', sampleCat?.image);

  const sampleProd = await db.collection('products').findOne({ image: { $regex: '/images/' } });
  console.log('Sample product image:', sampleProd?.name, '->', sampleProd?.image);

  const sampleBrand = await db.collection('brands').findOne({ logo: { $regex: '/images/' } });
  console.log('Sample brand logo:', sampleBrand?.name, '->', sampleBrand?.logo);

  const sampleDoc = await db.collection('vendordocuments').findOne({});
  console.log('Sample vendor document:', sampleDoc?.name, '->', sampleDoc?.fileUrl, 'publicId:', sampleDoc?.filePublicId);

  // Check remaining Cloudinary URLs if any
  const remainingCloudinary = {
    categories: await db.collection('categories').countDocuments({ image: /cloudinary\.com/ }),
    products: await db.collection('products').countDocuments({ $or: [{ image: /cloudinary\.com/ }, { images: /cloudinary\.com/ }] }),
    brands: await db.collection('brands').countDocuments({ logo: /cloudinary\.com/ }),
    banners: await db.collection('banners').countDocuments({ image: /cloudinary\.com/ }),
    users: await db.collection('users').countDocuments({ avatar: /cloudinary\.com/ }),
    vendors: await db.collection('vendors').countDocuments({ $or: [{ logo: /cloudinary\.com/ }, { 'documents.gst': /cloudinary\.com/ }, { 'documents.pan': /cloudinary\.com/ }] }),
    vendordocuments: await db.collection('vendordocuments').countDocuments({ fileUrl: /cloudinary\.com/ })
  };

  console.log('\nRemaining Cloudinary URLs in database:', remainingCloudinary);
  await mongoose.disconnect();
}

verifyDb().catch(console.error);
