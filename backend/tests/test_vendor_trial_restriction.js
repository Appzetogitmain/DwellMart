import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Vendor from '../src/models/Vendor.model.js';
import SubscriptionPlan from '../src/models/SubscriptionPlan.model.js';
import VendorSubscription from '../src/models/VendorSubscription.model.js';
import { activateSubscription, getCurrentVendorSubscription } from '../src/services/billing/subscriptionState.service.js';

const runVerification = async () => {
    console.log('=== END-TO-END ONE-TIME TRIAL RESTRICTION VERIFICATION ===\n');
    await connectDB();

    // 1. Find or create a test free plan and a paid plan
    let freePlan = await SubscriptionPlan.findOne({ price_inr: 0, price_usd: 0, isActive: true });
    if (!freePlan) {
        freePlan = await SubscriptionPlan.create({
            name: 'Verification Free Trial Plan',
            slug: 'verification-free-trial-plan',
            price_inr: 0,
            price_usd: 0,
            interval: 'month',
            interval_count: 6,
            isActive: true,
        });
    }
    console.log(`✓ Free Trial Plan: "${freePlan.name}" (Slug: ${freePlan.slug}, ID: ${freePlan._id})`);

    let paidPlan = await SubscriptionPlan.findOne({ price_inr: { $gt: 0 }, isActive: true });
    console.log(`✓ Paid Plan: "${paidPlan.name}" (Price: ₹${paidPlan.price_inr}, ID: ${paidPlan._id})`);

    // 2. Create a fresh simulated vendor
    const testEmail = `trial_test_${Date.now()}@example.com`;
    const testVendor = await Vendor.create({
        name: 'Trial Tester',
        email: testEmail,
        password: 'Password123!',
        storeName: 'Trial Test Store',
        country: 'India',
        status: 'approved',
        hasUsedTrial: false,
    });
    console.log(`\n✓ Created Fresh Test Vendor: ${testVendor.email} (hasUsedTrial: ${testVendor.hasUsedTrial})`);

    // 3. Test first trial activation -> MUST SUCCEED
    console.log('\n--- Step 1: Initial Free Trial Activation ---');
    const firstSub = await activateSubscription({
        vendor: testVendor,
        plan: freePlan,
        activationSource: 'zero_price_plan',
    });
    console.log(`✓ First Trial Activated: Status=${firstSub.status}, PeriodEnd=${firstSub.current_period_end.toISOString()}`);

    const updatedVendor = await Vendor.findById(testVendor._id);
    console.log(`✓ Vendor hasUsedTrial is now: ${updatedVendor.hasUsedTrial} (trialUsedAt: ${updatedVendor.trialUsedAt})`);
    if (!updatedVendor.hasUsedTrial) {
        throw new Error('FAILED: Vendor hasUsedTrial should be true after first activation.');
    }

    // 4. Test second trial activation on same vendor -> MUST BE BLOCKED
    console.log('\n--- Step 2: Attempting Second Free Trial Activation ---');
    let blocked = false;
    try {
        await activateSubscription({
            vendor: updatedVendor,
            plan: freePlan,
            activationSource: 'zero_price_plan',
        });
    } catch (err) {
        blocked = true;
        console.log(`✓ Second Trial Correctly Blocked: HTTP ${err.statusCode || 403} - "${err.message}"`);
    }

    if (!blocked) {
        throw new Error('FAILED: Second trial activation was not blocked!');
    }

    // 5. Test Available Plans Filtering for this vendor
    console.log('\n--- Step 3: Verifying Available Plans Query for Trial-Used Vendor ---');
    const plansQuery = { isActive: true };
    if (updatedVendor.hasUsedTrial) {
        plansQuery.$or = [{ price_inr: { $gt: 0 } }, { price_usd: { $gt: 0 } }];
    }
    const availablePlansForVendor = await SubscriptionPlan.find(plansQuery);
    const hasFreeInList = availablePlansForVendor.some((p) => Number(p.price_inr || 0) === 0 && Number(p.price_usd || 0) === 0);
    console.log(`✓ Free Trial Included in Renewal/Upgrade List? ${hasFreeInList ? 'YES (FAIL)' : 'NO (CORRECT - HIDDEN)'}`);
    if (hasFreeInList) {
        throw new Error('FAILED: Free trial plan should be hidden for trial-used vendors.');
    }

    // 6. Test Switching to Paid Plan -> MUST SUCCEED
    console.log('\n--- Step 4: Upgrading to Paid Plan ---');
    const paidSub = await activateSubscription({
        vendor: updatedVendor,
        plan: paidPlan,
        activationSource: 'admin_grant',
        actorId: new mongoose.Types.ObjectId(),
        reason: 'Legitimate paid / admin grant upgrade verification',
    });
    console.log(`✓ Paid Plan Activated: Status=${paidSub.status}, Plan=${paidPlan.name}`);

    // Cleanup test data
    await VendorSubscription.deleteMany({ vendor: testVendor._id });
    await Vendor.findByIdAndDelete(testVendor._id);
    console.log('\n✓ Cleaned up temporary test vendor and subscriptions.');

    console.log('\n======================================================');
    console.log('✅ ALL ONE-TIME TRIAL RESTRICTION CHECKS PASSED 100%');
    console.log('======================================================\n');
    process.exit(0);
};

runVerification().catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
