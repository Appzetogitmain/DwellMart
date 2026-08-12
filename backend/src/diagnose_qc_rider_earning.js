import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI;
await mongoose.connect(MONGO_URI);

const { default: Order }                  = await import('./models/Order.model.js');
const { default: DeliveryBoy }            = await import('./models/DeliveryBoy.model.js');
const { default: RiderWallet }            = await import('./models/RiderWallet.model.js');
const { default: RiderWalletTransaction } = await import('./models/RiderWalletTransaction.model.js');
const { default: RiderRateCard }          = await import('./models/RiderRateCard.model.js');
const { default: RiderWithdrawalRequest } = await import('./models/RiderWithdrawalRequest.model.js');
const { resolveRateCard, computeDeliveryEarning } = await import('./services/wallet/riderRateCard.service.js');
const { getWalletSummary }               = await import('./services/wallet/riderWallet.service.js');

console.log('══════════════════════════════════════════════════════');
console.log('  QC RIDER EARNING DIAGNOSTIC REPORT');
console.log('══════════════════════════════════════════════════════\n');

// 1. Fetch most recently delivered or open QC orders
const deliveredQcOrder = await Order.findOne({
    experience: 'quick_commerce',
    $or: [{ status: 'delivered' }, { 'quickCommerce.status': 'delivered' }],
}).sort({ deliveredAt: -1, updatedAt: -1 }).lean();

if (!deliveredQcOrder) {
    console.log('No delivered Quick Commerce order found in database.');
    // Let's check any QC order
    const anyQcOrder = await Order.findOne({ experience: 'quick_commerce' }).sort({ updatedAt: -1 }).lean();
    console.log('Most recent QC order overall:', anyQcOrder?.orderId, 'status:', anyQcOrder?.status, 'qcStatus:', anyQcOrder?.quickCommerce?.status);
} else {
    console.log('--- 1. DELIVERED QC ORDER ---');
    console.log('Order Mongo ID:', deliveredQcOrder._id);
    console.log('Order ID:', deliveredQcOrder.orderId);
    console.log('Experience:', deliveredQcOrder.experience);
    console.log('Order Status:', deliveredQcOrder.status);
    console.log('QC Status:', deliveredQcOrder.quickCommerce?.status);
    console.log('Delivered At:', deliveredQcOrder.deliveredAt);
    console.log('Payment Method:', deliveredQcOrder.paymentMethod);
    console.log('Payment Status:', deliveredQcOrder.paymentStatus);
    console.log('Delivery Distance (km):', deliveredQcOrder.quickCommerce?.deliveryDistanceKm);
    console.log('DeliveryBoyId:', deliveredQcOrder.deliveryBoyId);
    console.log('City:', deliveredQcOrder.shippingAddress?.city);

    const riderId = deliveredQcOrder.deliveryBoyId;
    if (riderId) {
        const rider = await DeliveryBoy.findById(riderId).lean();
        console.log('\n--- 2. RIDER DETAILS ---');
        console.log('Rider ID:', rider?._id);
        console.log('Name:', rider?.name);
        console.log('Email:', rider?.email);
        console.log('Status:', rider?.status);
        console.log('isAvailable:', rider?.isAvailable);

        // Rate card check
        const city = String(deliveredQcOrder.shippingAddress?.city || '').trim();
        const experience = String(deliveredQcOrder.experience || 'quick_commerce');

        const card = await resolveRateCard({
            deliveryBoyId: riderId,
            city,
            experience,
        });

        console.log('\n--- 3. RATE CARD MATCHING ---');
        console.log('Matched:', !!card);
        if (card) {
            console.log('Rate Card ID:', card._id);
            console.log('Name:', card.name);
            console.log('Scope:', card.scope);
            console.log('Base Fare:', card.baseFarePerDelivery);
            console.log('Per Km Rate:', card.perKmRate);
            console.log('Free Distance Km:', card.freeDistanceKm);
            console.log('Minimum Fare:', card.minimumFare);
            console.log('Maximum Fare:', card.maximumFare);
            console.log('Surge Multiplier:', card.surgeMultiplier);
            console.log('Peak Hour Bonus:', card.peakHourBonus);
            console.log('COD Handling Fee:', card.codHandlingFee);

            const distanceKm = Number(deliveredQcOrder.quickCommerce?.deliveryDistanceKm || 0);
            const isCod = ['cod', 'cash'].includes(String(deliveredQcOrder.paymentMethod || '').toLowerCase());
            const computed = computeDeliveryEarning({
                card,
                distanceKm,
                isCod,
                experience,
                completedAt: deliveredQcOrder.deliveredAt || new Date(),
            });
            console.log('Calculated Earning Amount:', computed.amount);
            console.log('Calculated Breakdown:', JSON.stringify(computed.breakdown, null, 2));
        } else {
            console.log('❌ NO RATE CARD MATCHED! Checking all active rate cards in DB...');
            const allCards = await RiderRateCard.find({ isActive: true }).lean();
            console.log('Total Active Rate Cards in DB:', allCards.length);
            console.log(JSON.stringify(allCards, null, 2));
        }

        // Wallet transactions
        const txs = await RiderWalletTransaction.find({ orderId: deliveredQcOrder._id }).lean();
        console.log('\n--- 4. WALLET TRANSACTIONS FOR ORDER ---');
        console.log('Found:', txs.length);
        console.log(JSON.stringify(txs, null, 2));

        // Wallet summary
        const wallet = await RiderWallet.findOne({ deliveryBoyId: riderId }).lean();
        console.log('\n--- 5. RIDER WALLET PROJECTION ---');
        console.log('Pending Balance:', wallet?.pendingBalance);
        console.log('Available Balance:', wallet?.availableBalance);
        console.log('Locked Balance:', wallet?.lockedBalance);
        console.log('Lifetime Earned:', wallet?.lifetimeEarned);
        console.log('Lifetime Withdrawn:', wallet?.lifetimeWithdrawn);

        if (riderId) {
            const summary = await getWalletSummary(riderId);
            console.log('\n--- 6. WALLET SUMMARY SERVICE OUTPUT ---');
            console.log(JSON.stringify(summary, null, 2));
        }
    }
}

await mongoose.disconnect();
