import 'dotenv/config';
import mongoose from 'mongoose';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import RiderWallet from '../models/RiderWallet.model.js';
import RiderRateCard from '../models/RiderRateCard.model.js';
import PhoneVerification from '../models/PhoneVerification.model.js';
import { toE164 } from '../utils/phone.js';

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI not set in .env');
  process.exit(1);
}

const SEED_PHONE = '1234567890';
const SEED_PHONE_E164 = toE164(SEED_PHONE) || '+911234567890';
const SEED_EMAIL = 'delivery@dwellmart.com';
const FIXED_OTP = '123456';

export const seedDelivery = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Find by phone, phoneE164 or legacy seed email
    let rider = await DeliveryBoy.findOne({
      $or: [
        { phoneE164: SEED_PHONE_E164 },
        { phone: SEED_PHONE },
        { email: SEED_EMAIL },
      ],
    });

    const updatePayload = {
      name: 'Delivery Boy',
      email: SEED_EMAIL,
      phone: SEED_PHONE,
      phoneE164: SEED_PHONE_E164,
      phoneVerified: true,
      whatsappOptIn: true,
      whatsappOptInAt: new Date(),
      applicationStatus: 'approved',
      rejectionReason: '',
      isActive: true,
      isAvailable: true,
      status: 'available',
      vehicleType: 'Bike',
      vehicleNumber: 'DL-01-AB-1234',
      address: 'Connaught Place, New Delhi, India',
      experiences: ['marketplace', 'quick_commerce'],
      documents: {
        drivingLicense: '/uploads/delivery-docs/seed-license.pdf',
        aadharCard: '/uploads/delivery-docs/seed-aadhar.pdf',
      },
      currentLocation: {
        lat: 28.6315,
        lng: 77.2167,
      },
      location: {
        type: 'Point',
        coordinates: [77.2167, 28.6315],
      },
      lastLocationAt: new Date(),
    };

    if (rider) {
      Object.assign(rider, updatePayload);
      await rider.save();
      console.log(`Updated existing Delivery Boy account (ID: ${rider._id})`);
    } else {
      rider = await DeliveryBoy.create(updatePayload);
      console.log(`Created new Delivery Boy account (ID: ${rider._id})`);
    }

    // Clean up any legacy password / reset fields per Migration 0015
    await DeliveryBoy.collection.updateOne(
      { _id: rider._id },
      { $unset: { password: '', resetOtp: '', resetOtpExpiry: '', resetOtpVerified: '' } }
    );

    // Ensure RiderWallet exists
    const existingWallet = await RiderWallet.findOne({ deliveryBoyId: rider._id });
    if (!existingWallet) {
      await RiderWallet.create({
        deliveryBoyId: rider._id,
        currency: 'INR',
        pendingBalance: 0,
        availableBalance: 0,
        lockedBalance: 0,
      });
      console.log(`Created RiderWallet for Delivery Boy (ID: ${rider._id})`);
    } else {
      console.log(`RiderWallet already exists for Delivery Boy (ID: ${rider._id})`);
    }

    // Ensure active starter rate card exists so earnings calculations work
    const activeRateCards = await RiderRateCard.countDocuments({ isActive: true });
    if (activeRateCards === 0) {
      await RiderRateCard.create({
        name: 'Default Global Rate Card',
        scope: 'global',
        baseFarePerDelivery: 25,
        perKmRate: 5,
        freeDistanceKm: 2,
        minimumFare: 25,
        codHandlingFee: 5,
        effectiveFrom: new Date(),
        isActive: true,
        notes: 'Starter rate card seeded with delivery boy account.',
      });
      console.log('Created starter RiderRateCard');
    }

    // Upsert PhoneVerification entry with the fixed OTP (valid for 1 year)
    await PhoneVerification.findOneAndUpdate(
      { phoneE164: SEED_PHONE_E164 },
      {
        phoneE164: SEED_PHONE_E164,
        otp: FIXED_OTP,
        otpExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        isVerified: true,
        attempts: 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Pre-seeded PhoneVerification for ${SEED_PHONE_E164} with fixed OTP: ${FIXED_OTP}`);

    console.log('\n=============================================');
    console.log('  DELIVERY BOY SEEDED SUCCESSFULLY');
    console.log('=============================================');
    console.log(`  Mobile Number : ${SEED_PHONE} (E.164: ${SEED_PHONE_E164})`);
    console.log(`  Fixed OTP     : ${FIXED_OTP} (Always works)`);
    console.log(`  Status        : approved`);
    console.log(`  Active        : true`);
    console.log(`  Available     : true`);
    console.log(`  Experiences   : marketplace, quick_commerce`);
    console.log('=============================================\n');

    return rider;
  } catch (err) {
    console.error('Seed failed:', err);
    throw err;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  }
};

// Execute if run directly
if (process.argv[1] && (process.argv[1].endsWith('seedDelivery.js') || process.argv[1].includes('seedDelivery'))) {
  seedDelivery()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
