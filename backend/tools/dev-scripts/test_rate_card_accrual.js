import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI;
await mongoose.connect(MONGO_URI);

const { default: Order }                  = await import('./models/Order.model.js');
const { default: DeliveryBoy }            = await import('./models/DeliveryBoy.model.js');
const { default: RiderRateCard }          = await import('./models/RiderRateCard.model.js');
const { accrueDeliveryEarning }           = await import('./services/wallet/riderEarnings.service.js');
const { runWalletMaturitySweep }          = await import('./services/wallet/walletMaturity.worker.js');
const { getWalletSummary }               = await import('./services/wallet/riderWallet.service.js');

// 1. Ensure default global rate card exists in MongoDB
let globalCard = await RiderRateCard.findOne({ scope: 'global', isActive: true });
if (!globalCard) {
    globalCard = await RiderRateCard.create({
        name: 'Default Quick Commerce Rate Card',
        scope: 'global',
        baseFarePerDelivery: 30,
        perKmRate: 6,
        freeDistanceKm: 1,
        minimumFare: 35,
        effectiveFrom: new Date('2026-01-01'),
        isActive: true,
        notes: 'Default platform rate card for Quick Commerce deliveries',
    });
    console.log('✅ Created default global rate card:', globalCard.name, globalCard._id);
} else {
    console.log('Found existing global rate card:', globalCard.name);
}

// 2. Find delivered QC order
const deliveredOrder = await Order.findOne({
    experience: 'quick_commerce',
    $or: [{ status: 'delivered' }, { 'quickCommerce.status': 'delivered' }],
}).sort({ deliveredAt: -1 }).lean();

if (deliveredOrder) {
    console.log('\n--- ACCRUING EARNING FOR ORDER ---', deliveredOrder.orderId);
    const tx = await accrueDeliveryEarning({ order: deliveredOrder });
    console.log('Accrual result transaction:', JSON.stringify(tx, null, 2));

    // 3. Run maturity sweep
    console.log('\n--- RUNNING MATURITY SWEEP ---');
    // Force maturesAt to now for immediate testing
    if (tx?.state === 'PENDING') {
        await mongoose.model('RiderWalletTransaction').updateOne(
            { _id: tx._id },
            { $set: { maturesAt: new Date(Date.now() - 1000) } }
        );
    }
    const sweepResult = await runWalletMaturitySweep();
    console.log('Maturity sweep result:', JSON.stringify(sweepResult, null, 2));

    // 4. Print wallet summary
    const summary = await getWalletSummary(deliveredOrder.deliveryBoyId);
    console.log('\n--- UPDATED RIDER WALLET SUMMARY ---');
    console.log(JSON.stringify(summary, null, 2));
}

await mongoose.disconnect();
