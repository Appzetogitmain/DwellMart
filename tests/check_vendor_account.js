import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function checkVendorAccount() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const Vendor = mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }));

        const vendor = await Vendor.findOne({ email: 'fashionhub@example.com' });

        if (!vendor) {
            console.log('Vendor fashionhub@example.com NOT FOUND in database!');
        } else {
            console.log('Vendor Account Details:');
            console.log(' - ID:', vendor._id);
            console.log(' - Name:', vendor.name);
            console.log(' - Store Name:', vendor.storeName);
            console.log(' - Email:', vendor.email);
            console.log(' - Status:', vendor.status);
            console.log(' - Is Active:', vendor.isActive);
            console.log(' - Is Deleted:', vendor.isDeleted);
            console.log(' - Has Password Hash:', !!vendor.password);

            // Test password
            const isMatch = await bcrypt.compare('vendor123', vendor.password || '');
            console.log(' - Password "vendor123" matches hash:', isMatch);
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error checking vendor account:', err);
    }
}

checkVendorAccount();
