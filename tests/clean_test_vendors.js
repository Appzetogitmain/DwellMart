import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const TEST_VENDOR_REGEX = /test|sptest|qwerty|qa\s|audit|seeded|demo|dummy|sample|free\s*vendor|^sk\s*store|^sagar\s*store/i;

async function cleanTestVendors() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const Vendor = mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }));

        const allVendors = await Vendor.find({});
        console.log(`Total Vendors in DB: ${allVendors.length}`);

        const testVendors = allVendors.filter(v => {
            const name = String(v.storeName || v.name || '');
            const email = String(v.email || '');
            return TEST_VENDOR_REGEX.test(name) || TEST_VENDOR_REGEX.test(email);
        });

        console.log(`Test/Seeded Vendors Found: ${testVendors.length}`);
        testVendors.forEach(v => console.log(` - ID: ${v._id}, Store: "${v.storeName || v.name}", Email: "${v.email}"`));

        if (testVendors.length > 0) {
            const testIds = testVendors.map(v => v._id);
            const res = await Vendor.updateMany(
                { _id: { $in: testIds } },
                { $set: { isDeleted: true, status: 'rejected', isActive: false } }
            );
            console.log(`Updated ${res.modifiedCount} test vendors to isDeleted: true, status: 'rejected'`);
        }

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    } catch (err) {
        console.error('Error cleaning test vendors:', err);
    }
}

cleanTestVendors();
