import mongoose from 'mongoose';

const sellOnDwellmartStatsSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            default: 'sell_on_dwellmart',
            trim: true,
        },
        activeVendors: {
            type: String,
            required: true,
            trim: true,
            default: '500+',
        },
        productsSold: {
            type: String,
            required: true,
            trim: true,
            default: '100K+',
        },
        citiesCovered: {
            type: String,
            required: true,
            trim: true,
            default: '50+',
        },
        onTimeDeliveryRate: {
            type: String,
            required: true,
            trim: true,
            default: '99.9%',
        },
        todaysRevenue: {
            type: String,
            required: true,
            trim: true,
            default: '₹4,85,200',
        },
        ordersToday: {
            type: String,
            required: true,
            trim: true,
            default: '389',
        },
        expressDeliveries: {
            type: String,
            required: true,
            trim: true,
            default: '142',
        },
        revenueGrowthPercent: {
            type: String,
            required: true,
            trim: true,
            default: '+28.4%',
        },
        dailySettlementAmount: {
            type: String,
            required: true,
            trim: true,
            default: '₹1,48,250',
        },
    },
    {
        timestamps: true,
    }
);

const SellOnDwellmartStats = mongoose.model('SellOnDwellmartStats', sellOnDwellmartStatsSchema);

export default SellOnDwellmartStats;
