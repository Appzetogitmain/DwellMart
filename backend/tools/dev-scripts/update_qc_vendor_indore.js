import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function updateQcVendorIndore() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const Vendor = (await import('./models/Vendor.model.js')).default;
    
    const res = await Vendor.updateMany(
        { status: 'approved', 'sellingChannels.quickCommerce.enabled': true },
        {
            $set: {
                'quickCommerceProfile.location': { type: 'Point', coordinates: [75.8577, 22.7196] },
                'quickCommerceProfile.serviceRadiusKm': 25,
                'quickCommerceProfile.baseFee': 25,
                'quickCommerceProfile.perKmFee': 8,
                'quickCommerceProfile.packagingFee': 5,
            }
        }
    );

    console.log('Successfully updated QC vendors in DB to Indore coordinates:', res);
    await mongoose.disconnect();
}

updateQcVendorIndore().catch(console.error);
