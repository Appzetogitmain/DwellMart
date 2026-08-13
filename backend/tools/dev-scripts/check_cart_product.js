import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import mongoose from 'mongoose';
import Product from './models/Product.model.js';
import Vendor from './models/Vendor.model.js';
import { validateCart } from './services/checkout/CartValidationPipeline.js';

async function checkProduct() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const products = await Product.find({ name: /Whole Wheat Bread/i }).lean();
    console.log('PRODUCTS FOUND:', JSON.stringify(products.map(p => ({ _id: p._id, name: p.name, isActive: p.isActive, isVisible: p.isVisible, stockQuantity: p.stockQuantity, quickCommerceEnabled: p.quickCommerceEnabled, vendorId: p.vendorId })), null, 2));

    if (products.length > 0) {
        const vendorIds = products.map(p => p.vendorId);
        const vendors = await Vendor.find({ _id: { $in: vendorIds } }).lean();
        console.log('VENDORS FOUND:', JSON.stringify(vendors.map(v => ({ _id: v._id, storeName: v.storeName, status: v.status, sellingChannels: v.sellingChannels, quickCommerceProfile: v.quickCommerceProfile })), null, 2));

        const cartValidation = await validateCart({
            items: [{ productId: products[0]._id, quantity: 1 }],
            customerLocation: { latitude: 22.7196, longitude: 75.8577 },
        });
        console.log('VALIDATION RESULT:', JSON.stringify(cartValidation, null, 2));
    }
    await mongoose.disconnect();
}

checkProduct();
