import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Order from '../../../models/Order.model.js';
import Product from '../../../models/Product.model.js';
import Commission from '../../../models/Commission.model.js';
import mongoose from 'mongoose';
import { channelToProductFlag } from '../../../constants/vendorChannels.js';

const toDateKey = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
};

const getDateRange = (period = 'month') => {
    const now = new Date();
    if (period === 'today') {
        return {
            start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            end: now,
        };
    }
    if (period === 'week') {
        return {
            start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            end: now,
        };
    }
    if (period === 'year') {
        return {
            start: new Date(now.getFullYear(), 0, 1),
            end: now,
        };
    }
    return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now,
    };
};

const getVendorOrderStatus = (order, vendorId) => {
    const vendorItem = order?.vendorItems?.find(
        (vi) => String(vi?.vendorId) === String(vendorId)
    );
    return String(vendorItem?.status || order?.status || 'pending').toLowerCase();
};

const getVendorOrderRevenue = (order, vendorId) => {
    const vendorItem = order?.vendorItems?.find(
        (vi) => String(vi?.vendorId) === String(vendorId)
    );
    return Number(vendorItem?.subtotal || vendorItem?.vendorEarnings || 0);
};

export const getAnalyticsOverview = asyncHandler(async (req, res) => {
    const period = String(req.query?.period || 'month').toLowerCase();
    const { start, end } = getDateRange(period);
    const vendorObjectId = new mongoose.Types.ObjectId(req.user.id);
    const workspace = req.vendorWorkspace;
    const orderChannelFilter = { $or: [
        { fulfillmentType: workspace }, { orderType: workspace }, { 'vendorItems.orderType': workspace },
    ] };
    const productFlag = channelToProductFlag(workspace);

    const [orders, productsCount, commissions, wholesaleProductsCount] = await Promise.all([
        Order.find({
            'vendorItems.vendorId': req.user.id,
            isDeleted: { $ne: true },
            status: { $nin: ['cancelled', 'returned'] },
            createdAt: { $gte: start, $lte: end },
            ...orderChannelFilter,
        })
            .select('createdAt date status orderType fulfillmentType vendorItems')
            .sort({ createdAt: 1 })
            .lean(),
        Product.countDocuments({ vendorId: req.user.id, [productFlag]: true, isDeleted: { $ne: true } }),
        Commission.find({
            vendorId: req.user.id,
            status: { $ne: 'cancelled' },
            createdAt: { $gte: start, $lte: end },
        })
            .select('vendorEarnings status')
            .lean(),
        Product.countDocuments({ vendorId: req.user.id, wholesaleEnabled: true, isDeleted: { $ne: true } }),
    ]);

    const dailyMap = {};
    const statusCounts = {};
    let activeOrdersCount = 0;
    // Wholesale accumulators (blueprint §8).
    let retailOrdersCount = 0;
    let wholesaleOrdersCount = 0;
    let bulkRevenue = 0;
    let totalSavingsPassed = 0;
    const tierUsage = {};
    const bulkProductMap = {};

    for (const order of orders) {
        const vendorItem = order?.vendorItems?.find(
            (vi) => String(vi?.vendorId) === String(vendorObjectId)
        );
        if (!vendorItem) continue;
        if (String(vendorItem?.status || '').toLowerCase() === 'cancelled') continue;

        const dateKey = toDateKey(order?.createdAt || order?.date);
        if (!dateKey) continue;

        const revenue = getVendorOrderRevenue(order, req.user.id);
        if (!dailyMap[dateKey]) {
            dailyMap[dateKey] = { date: dateKey, revenue: 0, orders: 0 };
        }
        dailyMap[dateKey].revenue += revenue;
        dailyMap[dateKey].orders += 1;
        activeOrdersCount += 1;

        const status = getVendorOrderStatus(order, req.user.id);
        statusCounts[status] = (statusCounts[status] || 0) + 1;

        // Classify this vendor's slice of the order. Legacy orders without
        // orderType default to 'retail'.
        const vendorOrderType = String(vendorItem?.orderType || 'retail');
        if (vendorOrderType === 'retail') {
            retailOrdersCount += 1;
        } else {
            wholesaleOrdersCount += 1;
        }

        for (const line of vendorItem?.items || []) {
            if (String(line?.pricingType) !== 'wholesale') continue;

            const lineRevenue = Number(line?.price || 0) * Number(line?.quantity || 0);
            bulkRevenue += lineRevenue;
            totalSavingsPassed += Number(line?.savings || 0);

            const tierMinQty = line?.appliedTier?.minQty;
            if (Number.isFinite(Number(tierMinQty))) {
                const tierKey = String(tierMinQty);
                if (!tierUsage[tierKey]) {
                    tierUsage[tierKey] = { minQty: Number(tierMinQty), timesUsed: 0, unitsSold: 0, revenue: 0 };
                }
                tierUsage[tierKey].timesUsed += 1;
                tierUsage[tierKey].unitsSold += Number(line?.quantity || 0);
                tierUsage[tierKey].revenue += lineRevenue;
            }

            const productKey = String(line?.productId || '');
            if (!productKey) continue;
            if (!bulkProductMap[productKey]) {
                bulkProductMap[productKey] = {
                    productId: productKey,
                    name: line?.name || 'Unknown product',
                    image: line?.image || '',
                    unitsSold: 0,
                    revenue: 0,
                    orders: 0,
                };
            }
            bulkProductMap[productKey].unitsSold += Number(line?.quantity || 0);
            bulkProductMap[productKey].revenue += lineRevenue;
            bulkProductMap[productKey].orders += 1;
        }
    }

    const timeseries = Object.values(dailyMap).sort(
        (a, b) => new Date(a.date) - new Date(b.date)
    );

    const totalRevenue = timeseries.reduce((sum, point) => sum + Number(point?.revenue || 0), 0);
    const pendingEarnings = commissions
        .filter((c) => c?.status === 'pending')
        .reduce((sum, c) => sum + Number(c?.vendorEarnings || 0), 0);

    const summary = {
        totalRevenue,
        pendingEarnings,
        totalOrders: activeOrdersCount,
        totalProducts: productsCount,
    };

    const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
    }));

    const pricingTiers = Object.values(tierUsage).sort((a, b) => b.timesUsed - a.timesUsed);
    const wholesale = {
        retailOrders: retailOrdersCount,
        wholesaleOrders: wholesaleOrdersCount,
        bulkRevenue: parseFloat(bulkRevenue.toFixed(2)),
        customerSavings: parseFloat(totalSavingsPassed.toFixed(2)),
        wholesaleProducts: wholesaleProductsCount,
        mostUsedTier: pricingTiers[0] || null,
        pricingTiers,
        topBulkProducts: Object.values(bulkProductMap)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5)
            .map((product) => ({
                ...product,
                revenue: parseFloat(product.revenue.toFixed(2)),
            })),
    };

    res.status(200).json(
        new ApiResponse(
            200,
            { summary, timeseries, statusBreakdown, wholesale },
            'Analytics overview fetched.'
        )
    );
});
