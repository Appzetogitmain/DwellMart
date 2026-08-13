import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkAdminSettings() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const Settings = (await import('./models/Settings.model.js')).default;
    const s = await Settings.findOne({ key: 'quick_commerce' }).lean();
    console.log('Current Admin QC Settings in DB:', JSON.stringify(s, null, 2));

    const Vendor = (await import('./models/Vendor.model.js')).default;
    const vendors = await Vendor.find({ 'sellingChannels.quickCommerce.enabled': true }).select('name storeName quickCommerceProfile').lean();
    console.log('Current QC Vendors profiles in DB:', JSON.stringify(vendors, null, 2));

    await mongoose.disconnect();
}

checkAdminSettings().catch(console.error);
