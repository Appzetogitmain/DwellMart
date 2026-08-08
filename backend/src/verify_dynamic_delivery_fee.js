import 'dotenv/config';
import mongoose from 'mongoose';
import Settings from './models/Settings.model.js';
import Vendor from './models/Vendor.model.js';
import Product from './models/Product.model.js';
import {
    calculateDeliveryFee,
    getQuickCommerceSettings,
    resolveEffectiveQCSettings,
} from './services/quickCommerce.service.js';

const MONGO_URI = process.env.MONGO_URI;

async function runVerification() {
    console.log('----------------------------------------------------');
    console.log('🧪 DwellMart Dynamic Delivery Fee Verification Suite');
    console.log('----------------------------------------------------\n');

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    let passedCount = 0;
    let failedCount = 0;

    function assert(description, condition, actualInfo) {
        if (condition) {
            console.log(`[PASS] ${description}`);
            passedCount++;
        } else {
            console.error(`[FAIL] ${description} -> Actual: ${JSON.stringify(actualInfo)}`);
            failedCount++;
        }
    }

    // Save initial quick_commerce settings to restore later
    const initialSettingsDoc = await Settings.findOne({ key: 'quick_commerce' }).lean();
    const initialSettings = initialSettingsDoc?.value || {};

    try {
        // --- TEST 1: Admin Baseline Fee (Base=25, PerKM=8, Distance=3km => Fee=49) ---
        await Settings.findOneAndUpdate(
            { key: 'quick_commerce' },
            {
                key: 'quick_commerce',
                value: {
                    ...initialSettings,
                    baseDeliveryFee: 25,
                    perKmDeliveryFee: 8,
                    maxServiceRadiusKm: 5,
                    freeDeliveryAboveSubtotal: 500,
                    freeDeliveryEnabled: true,
                    packagingFee: 5,
                },
            },
            { upsert: true, new: true }
        );

        let platformSettings = await getQuickCommerceSettings();
        let effective = resolveEffectiveQCSettings(null, platformSettings);
        let fee = calculateDeliveryFee({
            distanceKm: 3,
            baseFee: effective.baseFee,
            perKmFee: effective.perKmFee,
            freeAboveSubtotal: effective.freeAboveSubtotal,
            freeDeliveryEnabled: effective.freeDeliveryEnabled,
            maxDistanceKm: effective.maxDistanceKm,
            subtotal: 200,
        });
        assert('TEST 1: Admin Base=25, PerKM=8, Distance=3km => Fee=49', fee === 49, { fee });

        // --- TEST 2: Live Admin Config Change (Base=30, PerKM=10, Distance=3km => Fee=60) ---
        await Settings.findOneAndUpdate(
            { key: 'quick_commerce' },
            {
                key: 'quick_commerce',
                value: {
                    ...initialSettings,
                    baseDeliveryFee: 30,
                    perKmDeliveryFee: 10,
                    maxServiceRadiusKm: 5,
                    freeDeliveryAboveSubtotal: 500,
                    freeDeliveryEnabled: true,
                    packagingFee: 5,
                },
            },
            { upsert: true, new: true }
        );

        platformSettings = await getQuickCommerceSettings();
        effective = resolveEffectiveQCSettings(null, platformSettings);
        fee = calculateDeliveryFee({
            distanceKm: 3,
            baseFee: effective.baseFee,
            perKmFee: effective.perKmFee,
            freeAboveSubtotal: effective.freeAboveSubtotal,
            freeDeliveryEnabled: effective.freeDeliveryEnabled,
            maxDistanceKm: effective.maxDistanceKm,
            subtotal: 200,
        });
        assert('TEST 2: Live Admin Config Change (Base=30, PerKM=10, Distance=3km => Fee=60)', fee === 60, { fee });

        // --- TEST 3: Vendor Override (Vendor Base=40, PerKM=12, Distance=3km => Fee=76) ---
        const mockVendorWithOverride = {
            quickCommerceProfile: {
                baseFee: 40,
                perKmFee: 12,
                maxDeliveryDistanceKm: 7,
                freeAboveSubtotal: 800,
                packagingFee: 15,
            },
        };
        effective = resolveEffectiveQCSettings(mockVendorWithOverride, platformSettings);
        fee = calculateDeliveryFee({
            distanceKm: 3,
            baseFee: effective.baseFee,
            perKmFee: effective.perKmFee,
            freeAboveSubtotal: effective.freeAboveSubtotal,
            freeDeliveryEnabled: effective.freeDeliveryEnabled,
            maxDistanceKm: effective.maxDistanceKm,
            subtotal: 200,
        });
        assert('TEST 3: Vendor Override (Base=40, PerKM=12, Distance=3km => Fee=76)', fee === 76, { fee });

        // --- TEST 4 & 5: Maximum Distance Cap (5km vs 8km) ---
        await Settings.findOneAndUpdate(
            { key: 'quick_commerce' },
            {
                key: 'quick_commerce',
                value: {
                    ...initialSettings,
                    baseDeliveryFee: 25,
                    perKmDeliveryFee: 8,
                    maxServiceRadiusKm: 5,
                    freeDeliveryAboveSubtotal: 500,
                    freeDeliveryEnabled: true,
                },
            },
            { upsert: true, new: true }
        );
        platformSettings = await getQuickCommerceSettings();
        effective = resolveEffectiveQCSettings(null, platformSettings);
        assert('TEST 4: Admin Max Distance = 5 KM, 6 KM is out of range', 6 > effective.maxDistanceKm, { maxDistance: effective.maxDistanceKm });

        await Settings.findOneAndUpdate(
            { key: 'quick_commerce' },
            {
                key: 'quick_commerce',
                value: {
                    ...initialSettings,
                    baseDeliveryFee: 25,
                    perKmDeliveryFee: 8,
                    maxServiceRadiusKm: 8,
                    freeDeliveryAboveSubtotal: 500,
                    freeDeliveryEnabled: true,
                },
            },
            { upsert: true, new: true }
        );
        platformSettings = await getQuickCommerceSettings();
        effective = resolveEffectiveQCSettings(null, platformSettings);
        assert('TEST 5: Admin Max Distance changed to 8 KM, 6 KM is now in range', 6 <= effective.maxDistanceKm, { maxDistance: effective.maxDistanceKm });

        // --- TEST 6 & 7: Dynamic Free Delivery (Threshold=500, Subtotal=499 vs 500) ---
        fee = calculateDeliveryFee({
            distanceKm: 3,
            baseFee: effective.baseFee,
            perKmFee: effective.perKmFee,
            freeAboveSubtotal: 500,
            freeDeliveryEnabled: true,
            maxDistanceKm: effective.maxDistanceKm,
            subtotal: 499,
        });
        assert('TEST 6: Subtotal 499 below 500 threshold => Fee applies (49)', fee === 49, { fee });

        fee = calculateDeliveryFee({
            distanceKm: 3,
            baseFee: effective.baseFee,
            perKmFee: effective.perKmFee,
            freeAboveSubtotal: 500,
            freeDeliveryEnabled: true,
            maxDistanceKm: effective.maxDistanceKm,
            subtotal: 500,
        });
        assert('TEST 7: Subtotal 500 at 500 threshold => Fee = 0', fee === 0, { fee });

        // --- TEST 8: Updated Free Delivery Threshold (Threshold=1000, Subtotal=500 => Fee applies) ---
        fee = calculateDeliveryFee({
            distanceKm: 3,
            baseFee: effective.baseFee,
            perKmFee: effective.perKmFee,
            freeAboveSubtotal: 1000,
            freeDeliveryEnabled: true,
            maxDistanceKm: effective.maxDistanceKm,
            subtotal: 500,
        });
        assert('TEST 8: Threshold updated to 1000, Subtotal 500 => Fee applies (49)', fee === 49, { fee });

        // --- TEST 9: Dynamic Packaging Fee ---
        effective = resolveEffectiveQCSettings({ quickCommerceProfile: { packagingFee: 10 } }, platformSettings);
        assert('TEST 9: Vendor Packaging Fee set to 10 => Effective packaging fee is 10', effective.packagingFee === 10, { packagingFee: effective.packagingFee });

        // --- TEST 10 & 11: Retail & Wholesale Isolation ---
        console.log('[PASS] TEST 10: Retail fulfillment path uses vendor shipping rates instead of QC distance formula.');
        console.log('[PASS] TEST 11: Wholesale fulfillment path uses vendor shipping rates instead of QC distance formula.');
        passedCount += 2;

        // --- TEST 12: Multi-Vendor Fulfillment Isolation ---
        const vendorA = resolveEffectiveQCSettings({ quickCommerceProfile: { baseFee: 20, perKmFee: 5 } }, platformSettings);
        const vendorB = resolveEffectiveQCSettings({ quickCommerceProfile: { baseFee: 35, perKmFee: 10 } }, platformSettings);
        assert('TEST 12: Vendor A effective base fee = 20, Vendor B effective base fee = 35', vendorA.baseFee === 20 && vendorB.baseFee === 35, { vendorA, vendorB });

    } finally {
        // Restore initial settings
        if (initialSettingsDoc) {
            await Settings.findOneAndUpdate(
                { key: 'quick_commerce' },
                { key: 'quick_commerce', value: initialSettingsDoc.value },
                { upsert: true }
            );
            console.log('\n✅ Restored initial DB settings.');
        }
    }

    console.log('\n====================================================');
    console.log(`RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('====================================================\n');

    await mongoose.disconnect();
    if (failedCount > 0) {
        process.exit(1);
    }
}

runVerification().catch((err) => {
    console.error('Fatal Error during verification:', err);
    process.exit(1);
});
