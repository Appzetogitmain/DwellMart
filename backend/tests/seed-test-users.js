/**
 * Seed script for Support Chat Integration Tests
 *
 * Creates dedicated test users with known credentials for each role.
 * Run ONCE before running support.test.js
 *
 * Run: node tests/seed-test-users.js
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGO_URI);
console.log('✅ Connected to MongoDB');

const TEST_PASSWORD = 'TestSupport@123';
// Pre-hash with the same cost factor as models (10-12), bypassing Mongoose pre-save hook
// by setting the raw hash directly so it doesn't get double-hashed
const HASHED_PW = await bcrypt.hash(TEST_PASSWORD, 10);

// ─── Customer ────────────────────────────────────────────────────────────────
try {
    const UserModel = (await import('../src/models/User.model.js')).default;

    const email = 'support.test.customer@dwell.com';
    // Use updateOne with $set to bypass Mongoose pre('save') hook (avoids double-hashing)
    const existing = await UserModel.findOne({ email });
    if (!existing) {
        await UserModel.collection.insertOne({
            name: 'Test Customer',
            email,
            password: HASHED_PW,
            role: 'customer',
            isVerified: true,
            isEmailVerified: true,
            phone: '9999999901',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        console.log(`✅ Created test customer: ${email}`);
    } else {
        await UserModel.collection.updateOne({ email }, {
            $set: {
                password: HASHED_PW,
                isVerified: true,
                isEmailVerified: true,
                updatedAt: new Date(),
            }
        });
        console.log(`ℹ️  Updated test customer password: ${email}`);
    }
} catch (e) {
    console.error('❌ Customer seed error:', e.message);
}

// ─── Vendor ──────────────────────────────────────────────────────────────────
try {
    const VendorModel = (await import('../src/models/Vendor.model.js')).default;

    const email = 'support.test.vendor@dwell.com';
    const existing = await VendorModel.findOne({ email });
    if (!existing) {
        await VendorModel.collection.insertOne({
            name: 'Test Vendor',
            email,
            password: HASHED_PW,
            storeName: 'Test Vendor Store',
            phone: '9999999902',
            isApproved: true,
            isActive: true,
            isVerified: true,
            status: 'approved',
            hasActiveSubscription: true,
            subscriptionStatus: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        console.log(`✅ Created test vendor: ${email}`);
    } else {
        await VendorModel.collection.updateOne({ email }, {
            $set: {
                password: HASHED_PW,
                isApproved: true,
                isActive: true,
                isVerified: true,
                status: 'approved',
                hasActiveSubscription: true,
                subscriptionStatus: 'active',
                updatedAt: new Date(),
            }
        });
        console.log(`ℹ️  Updated test vendor password: ${email}`);
    }
} catch (e) {
    console.error('❌ Vendor seed error:', e.message);
}

// ─── Delivery ─────────────────────────────────────────────────────────────────
try {
    const DeliveryModel = (await import('../src/models/DeliveryBoy.model.js')).default;

    const email = 'support.test.delivery@dwell.com';
    const existing = await DeliveryModel.findOne({ email });
    if (!existing) {
        await DeliveryModel.collection.insertOne({
            name: 'Test Delivery Partner',
            email,
            password: HASHED_PW,
            phone: '9999999903',
            applicationStatus: 'approved',
            isActive: true,
            vehicleType: 'bike',
            vehicleNumber: 'TEST1234',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        console.log(`✅ Created test delivery partner: ${email}`);
    } else {
        await DeliveryModel.collection.updateOne({ email }, {
            $set: {
                password: HASHED_PW,
                applicationStatus: 'approved',
                isActive: true,
                updatedAt: new Date(),
            }
        });
        console.log(`ℹ️  Updated test delivery password: ${email}`);
    }
} catch (e) {
    console.error('❌ Delivery seed error:', e.message);
}

// ─── Admin ────────────────────────────────────────────────────────────────────
try {
    const AdminModel = (await import('../src/models/Admin.model.js')).default;

    const email = 'support.test.admin@dwell.com';
    const existing = await AdminModel.findOne({ email });
    if (!existing) {
        await AdminModel.collection.insertOne({
            name: 'Test Admin',
            email,
            password: HASHED_PW,
            role: 'admin',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        console.log(`✅ Created test admin: ${email}`);
    } else {
        await AdminModel.collection.updateOne({ email }, {
            $set: {
                password: HASHED_PW,
                isActive: true,
                updatedAt: new Date(),
            }
        });
        console.log(`ℹ️  Updated test admin password: ${email}`);
    }
} catch (e) {
    console.error('❌ Admin seed error:', e.message);
}

await mongoose.disconnect();

console.log('\n' + '═'.repeat(60));
console.log('TEST CREDENTIALS (use in support.test.js):');
console.log('═'.repeat(60));
console.log('Customer  : support.test.customer@dwell.com');
console.log('Vendor    : support.test.vendor@dwell.com');
console.log('Delivery  : support.test.delivery@dwell.com');
console.log('Admin     : support.test.admin@dwell.com');
console.log('Password  : TestSupport@123 (all accounts)');
console.log('═'.repeat(60));

process.exit(0);
