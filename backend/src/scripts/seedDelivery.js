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

const FIXED_OTP = '123456';

const ACCOUNTS_TO_SEED = [
  {
    name: 'Delivery Partner',
    phone: '7869958637',
    phoneE164: toE164('7869958637') || '+917869958637',
    email: 'delivery.7869958637@dwellmart.com',
    vehicleType: 'Bike',
    vehicleNumber: 'DL-01-AB-7869',
    address: 'Connaught Place, New Delhi, India',
  },
  {
    name: 'Delivery Boy',
    phone: '1234567890',
    phoneE164: toE164('1234567890') || '+911234567890',
    email: 'delivery@dwellmart.com',
    vehicleType: 'Bike',
    vehicleNumber: 'DL-01-AB-1234',
    address: 'Connaught Place, New Delhi, India',
  },
];

export const seedDelivery = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

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

    for (const acc of ACCOUNTS_TO_SEED) {
      // Find by phone, phoneE164 or email
      let rider = await DeliveryBoy.findOne({
        $or: [
          { phoneE164: acc.phoneE164 },
          { phone: acc.phone },
          { email: acc.email },
        ],
      });

      const updatePayload = {
        name: acc.name,
        email: acc.email,
        phone: acc.phone,
        phoneE164: acc.phoneE164,
        phoneVerified: true,
        whatsappOptIn: true,
        whatsappOptInAt: new Date(),
        applicationStatus: 'approved',
        rejectionReason: '',
        isActive: true,
        isAvailable: true,
        status: 'available',
        vehicleType: acc.vehicleType,
        vehicleNumber: acc.vehicleNumber,
        address: acc.address,
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
        console.log(`Updated existing Delivery Boy account ${acc.phone} (ID: ${rider._id})`);
      } else {
        rider = await DeliveryBoy.create(updatePayload);
        console.log(`Created new Delivery Boy account ${acc.phone} (ID: ${rider._id})`);
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

      // Upsert PhoneVerification entry with the fixed OTP (valid for 1 year)
      await PhoneVerification.findOneAndUpdate(
        { phoneE164: acc.phoneE164 },
        {
          phoneE164: acc.phoneE164,
          otp: FIXED_OTP,
          otpExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          isVerified: true,
          attempts: 0,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`Pre-seeded PhoneVerification for ${acc.phoneE164} with fixed OTP: ${FIXED_OTP}`);
    }

    console.log('\n=============================================');
    console.log('  DELIVERY ACCOUNTS SEEDED SUCCESSFULLY');
    console.log('=============================================');
    for (const acc of ACCOUNTS_TO_SEED) {
      console.log(`  Mobile Number : ${acc.phone} (E.164: ${acc.phoneE164})`);
      console.log(`  Fixed OTP     : ${FIXED_OTP} (Always works)`);
      console.log(`  Status        : approved`);
      console.log(`  Active        : true`);
      console.log(`  Available     : true`);
      console.log(`  Experiences   : marketplace, quick_commerce`);
      console.log('  -------------------------------------------');
    }
    console.log('=============================================\n');

    return true;
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
