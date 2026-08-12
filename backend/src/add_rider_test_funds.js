import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI;
await mongoose.connect(MONGO_URI);

const { default: DeliveryBoy }   = await import('./models/DeliveryBoy.model.js');
const { postTransaction, getWalletSummary } = await import('./services/wallet/riderWallet.service.js');

const rider = await DeliveryBoy.findOne({ email: 'delivery@delivery.com' });
if (!rider) {
    console.error('❌ Delivery Agent delivery@delivery.com not found.');
    process.exit(1);
}

console.log('Found Rider:', rider.name, rider._id);

// 1. Post test wallet credit adjustment of ₹500 to AVAILABLE balance
const { transaction, wallet } = await postTransaction({
    deliveryBoyId: rider._id,
    amount: 500,
    type: 'INCENTIVE',
    state: 'AVAILABLE',
    description: 'Test incentive credit for manual withdrawal testing',
    createdByType: 'admin',
});

console.log('✅ Posted Wallet Credit Transaction:', transaction._id, 'Amount:', transaction.amount, 'State:', transaction.state);

// 2. Set test payout details (UPI) if not present
rider.payoutDetails = {
    method: 'upi',
    upiId: 'deliveryagent@okaxis',
    accountName: rider.name,
    verifiedAt: new Date(),
    lastChangedAt: new Date(),
};
await rider.save();
console.log('✅ Updated Rider Payout Details with test UPI ID: deliveryagent@okaxis');

// 3. Get updated wallet summary
const summary = await getWalletSummary(rider._id);
console.log('\n--- UPDATED WALLET SUMMARY ---');
console.log('Available Balance:', summary.availableBalance);
console.log('Pending Balance:', summary.pendingBalance);
console.log('Lifetime Earned:', summary.lifetimeEarned);
console.log('Has Payout Details:', summary.hasPayoutDetails);
console.log('Payout Details:', summary.payoutDetails);

await mongoose.disconnect();
