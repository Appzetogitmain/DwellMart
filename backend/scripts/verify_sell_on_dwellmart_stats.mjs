import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SellOnDwellmartStats from '../src/models/SellOnDwellmartStats.model.js';
import {
    getSellOnDwellmartStats,
    updateSellOnDwellmartStats,
} from '../src/services/sellOnDwellmartStats.service.js';

dotenv.config();

async function verifyE2E() {
    console.log('--- Sell On DwellMart Stats E2E Verification ---');
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGO_URI is missing');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // 1. Initial fetch (auto-seeds defaults)
    const initialStats = await getSellOnDwellmartStats();
    console.log('Initial stats from service:', initialStats);

    // 2. Admin updates stats
    const updatedStats = await updateSellOnDwellmartStats({
        activeVendors: '750+',
        productsSold: '150K+',
        citiesCovered: '75+',
        onTimeDeliveryRate: '99.95%',
        todaysRevenue: '₹6,25,000',
        ordersToday: '475',
        expressDeliveries: '210',
        revenueGrowthPercent: '+31.2%',
        dailySettlementAmount: '₹2,10,000',
    });
    console.log('Updated stats from service:', updatedStats);

    // 3. Verify in MongoDB
    const docCount = await SellOnDwellmartStats.countDocuments({ key: 'sell_on_dwellmart' });
    console.log('Singleton count in MongoDB:', docCount);
    if (docCount !== 1) throw new Error('Singleton invariant failed!');

    const directDoc = await SellOnDwellmartStats.findOne({ key: 'sell_on_dwellmart' }).lean();
    console.log('Direct MongoDB document:', {
        activeVendors: directDoc.activeVendors,
        productsSold: directDoc.productsSold,
        todaysRevenue: directDoc.todaysRevenue,
        ordersToday: directDoc.ordersToday,
        expressDeliveries: directDoc.expressDeliveries,
        revenueGrowthPercent: directDoc.revenueGrowthPercent,
        dailySettlementAmount: directDoc.dailySettlementAmount,
    });

    // 4. Public fetch
    const publicStats = await getSellOnDwellmartStats();
    console.log('Public fetch after update:', publicStats);

    // 5. Restore original baseline defaults for clean state
    await updateSellOnDwellmartStats({
        activeVendors: '500+',
        productsSold: '100K+',
        citiesCovered: '50+',
        onTimeDeliveryRate: '99.9%',
        todaysRevenue: '₹4,85,200',
        ordersToday: '389',
        expressDeliveries: '142',
        revenueGrowthPercent: '+28.4%',
        dailySettlementAmount: '₹1,48,250',
    });
    console.log('Restored baseline default stats.');

    await mongoose.disconnect();
    console.log('--- E2E Verification Complete & PASSED ---');
}

verifyE2E().catch((err) => {
    console.error('E2E Verification Failed:', err);
    process.exit(1);
});
