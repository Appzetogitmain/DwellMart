import 'dotenv/config';
import mongoose from 'mongoose';
import Admin from '../models/Admin.model.js';

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set in .env');
    process.exit(1);
}

// P1-14 FIX: Credentials must come from environment variables.
// Never hardcode production credentials in source code.
// Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before running.
const SEED_EMAIL    = process.env.SEED_ADMIN_EMAIL;
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

if (!SEED_EMAIL || !SEED_PASSWORD) {
    console.error('❌ SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env');
    console.error('   Example: SEED_ADMIN_EMAIL=admin@yourcompany.com SEED_ADMIN_PASSWORD=<strong-password>');
    process.exit(1);
}

const seedAdmin = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const existing = await Admin.findOne({ email: SEED_EMAIL });

        if (existing) {
            // P1-14 FIX: Never overwrite existing credentials on re-run.
            // If you need to reset a password, use the admin password-reset endpoint.
            console.log(`ℹ️  Admin account already exists for ${SEED_EMAIL}. Skipping seed.`);
            console.log('   To reset a password, use the admin reset-password API endpoint.');
        } else {
            await Admin.create({
                name: process.env.SEED_ADMIN_NAME || 'Super Admin',
                email: SEED_EMAIL,
                password: SEED_PASSWORD,
                role: 'superadmin',
                isActive: true,
            });
            console.log(`✅ Admin created: ${SEED_EMAIL}`);
            console.log('⚠️  Please change this password immediately after first login.');
        }
    } catch (err) {
        console.error('❌ Seed failed:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
        process.exit(0);
    }
};

seedAdmin();
