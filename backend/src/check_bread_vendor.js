import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkBreadVendor() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const Product = (await import('./models/Product.model.js')).default;
    const Vendor = (await import('./models/Vendor.model.js')).default;

    const products = await Product.find({ name: /Bread/i }).lean();
    console.log('Found Bread Products:', products.map(p => ({ id: p._id, name: p.name, vendorId: p.vendorId })));

    for (const p of products) {
        const v = await Vendor.findById(p.vendorId).lean();
        console.log(`Product "${p.name}" -> Vendor "${v?.storeName}" (${v?._id}):`);
        console.log('Location:', v?.quickCommerceProfile?.location);
    }

    const allVendors = await Vendor.find({ 'sellingChannels.quickCommerce.enabled': true }).lean();
    console.log('\nAll QC Vendors Locations:');
    allVendors.forEach(v => {
        console.log(`Vendor "${v.storeName}" (${v._id}):`, v.quickCommerceProfile?.location);
    });

    await mongoose.disconnect();
}

checkBreadVendor().catch(console.error);
