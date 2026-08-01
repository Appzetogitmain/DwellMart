import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Order from '../../../models/Order.model.js';
import User from '../../../models/User.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Product from '../../../models/Product.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import {
    baseQuickCommerceMatch,
    resolveDateRange,
    startOfToday,
    getVolumeStats as qcVolumeStats,
    getEtaStats as qcEtaStats,
    getStageBreakdown as qcStageBreakdown,
    getAssignmentStats as qcAssignmentStats,
    getVendorResponsiveness as qcVendorResponsiveness,
    getTopStores as qcTopStores,
    getTopProducts as qcTopProducts,
    getPeakHours as qcPeakHours,
    getDailySeries as qcDailySeries,
} from '../../../services/quickCommerceAnalytics.service.js';

// GET /api/admin/analytics/dashboard
export const getDashboardStats = asyncHandler(async (req, res) => {
    const activeOrderFilter = { isDeleted: { $ne: true } };
    const [totalOrders, totalUsers, totalVendors, totalProducts, revenueAgg, pendingOrders] = await Promise.all([
        Order.countDocuments(activeOrderFilter),
        User.countDocuments({ role: 'customer' }),
        Vendor.countDocuments({ status: 'approved' }),
        Product.countDocuments({ isActive: true }),
        Order.aggregate([{ $match: { ...activeOrderFilter, status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
        Order.countDocuments({ ...activeOrderFilter, status: 'pending' }),
    ]);

    res.status(200).json(new ApiResponse(200, {
        totalOrders,
        totalUsers,
        totalVendors,
        totalProducts,
        totalRevenue: revenueAgg[0]?.total || 0,
        pendingOrders,
    }, 'Dashboard stats fetched.'));
});

// GET /api/admin/analytics/revenue
export const getRevenueData = asyncHandler(async (req, res) => {
    const { period = 'monthly', startDate, endDate } = req.query;
    const groupFormat = period === 'daily' ? '%Y-%m-%d' : period === 'weekly' ? '%Y-%U' : '%Y-%m';
    const match = { isDeleted: { $ne: true }, status: { $ne: 'cancelled' } };
    if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const pipeline = [
        { $match: match },
        { $group: { _id: { $dateToString: { format: groupFormat, date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
    ];
    if (!startDate && !endDate) {
        pipeline.push({ $sort: { _id: -1 } }, { $limit: 12 });
    }
    pipeline.push({ $sort: { _id: 1 } });

    const revenue = await Order.aggregate(pipeline);

    res.status(200).json(new ApiResponse(200, revenue, 'Revenue data fetched.'));
});

// GET /api/admin/analytics/order-status
export const getOrderStatusBreakdown = asyncHandler(async (req, res) => {
    const breakdown = await Order.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
    ]);

    const result = breakdown.map(item => ({ status: item._id, count: item.count }));
    res.status(200).json(new ApiResponse(200, result, 'Order status breakdown fetched.'));
});

// GET /api/admin/analytics/top-products
export const getTopProducts = asyncHandler(async (req, res) => {
    const topProducts = await Order.aggregate([
        { $match: { isDeleted: { $ne: true }, status: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.productId', totalSold: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                name: { $ifNull: ['$product.name', 'Unknown Product'] },
                image: {
                    $ifNull: [{ $arrayElemAt: ['$product.images', 0] }, '$product.image']
                },
                totalSold: 1,
                revenue: 1
            }
        },
    ]);

    res.status(200).json(new ApiResponse(200, topProducts, 'Top products fetched.'));
});

// GET /api/admin/analytics/customer-growth
export const getCustomerGrowth = asyncHandler(async (req, res) => {
    const { period = 'monthly' } = req.query;
    const groupFormat = period === 'daily' ? '%Y-%m-%d' : period === 'weekly' ? '%Y-%U' : '%Y-%m';

    const growth = await User.aggregate([
        { $match: { role: 'customer' } },
        { $group: { _id: { $dateToString: { format: groupFormat, date: '$createdAt' } }, newUsers: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 12 },
        { $sort: { _id: 1 } },
    ]);

    res.status(200).json(new ApiResponse(200, growth, 'Customer growth fetched.'));
});

// GET /api/admin/analytics/recent-orders
export const getRecentOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({ isDeleted: { $ne: true } })
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

    res.status(200).json(new ApiResponse(200, orders, 'Recent orders fetched.'));
});

// GET /api/admin/analytics/sales
export const getSalesData = asyncHandler(async (req, res) => {
    const { period = 'monthly', startDate, endDate } = req.query;
    const groupFormat = period === 'daily' ? '%Y-%m-%d' : period === 'weekly' ? '%Y-%U' : '%Y-%m';
    const match = { isDeleted: { $ne: true }, status: { $ne: 'cancelled' } };
    if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const pipeline = [
        { $match: match },
        { $group: { _id: { $dateToString: { format: groupFormat, date: '$createdAt' } }, sales: { $sum: '$total' }, orders: { $sum: 1 } } },
    ];
    if (!startDate && !endDate) {
        pipeline.push({ $sort: { _id: -1 } }, { $limit: 12 });
    }
    pipeline.push({ $sort: { _id: 1 } });

    const sales = await Order.aggregate(pipeline);

    res.status(200).json(new ApiResponse(200, sales, 'Sales data fetched.'));
});

// GET /api/admin/analytics/finance-summary
export const getFinancialSummary = asyncHandler(async (req, res) => {
    const { period = 'monthly', startDate, endDate } = req.query;
    const groupFormat = period === 'daily' ? '%Y-%m-%d' : period === 'weekly' ? '%Y-%U' : '%Y-%m';
    const match = { isDeleted: { $ne: true }, status: { $ne: 'cancelled' } };
    if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const pipeline = [
        { $match: match },
        {
            $group: {
                _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
                revenue: { $sum: '$total' },
                subtotal: { $sum: '$subtotal' },
                tax: { $sum: '$tax' },
                delivery: { $sum: '$shipping' },
                discount: { $sum: '$discount' },
                orders: { $sum: 1 }
            }
        },
    ];
    if (!startDate && !endDate) {
        pipeline.push({ $sort: { _id: -1 } }, { $limit: 12 });
    }
    pipeline.push({ $sort: { _id: 1 } });

    const summary = await Order.aggregate(pipeline);

    res.status(200).json(new ApiResponse(200, summary, 'Financial summary fetched.'));
});

// GET /api/admin/analytics/inventory-stats
export const getInventoryStats = asyncHandler(async (req, res) => {
    const [totalProducts, outOfStock, lowStock, activeProducts] = await Promise.all([
        Product.countDocuments(),
        Product.countDocuments({ stock: 'out_of_stock' }),
        Product.countDocuments({ stock: 'low_stock' }),
        Product.countDocuments({ isActive: true }),
    ]);

    res.status(200).json(new ApiResponse(200, {
        totalProducts,
        outOfStock,
        lowStock,
        activeProducts,
    }, 'Inventory stats fetched.'));
});

// GET /api/admin/analytics/wholesale
export const getWholesaleStats = asyncHandler(async (req, res) => {
    const activeOrderFilter = { isDeleted: { $ne: true }, status: { $ne: 'cancelled' } };
    const approvedVendorFilter = { status: 'approved' };

    const [
        retailOnlyVendors,
        wholesaleOnlyVendors,
        hybridVendors,
        wholesaleProducts,
        totalProducts,
        orderTypeAgg,
        bulkRevenueAgg,
        topBulkProducts,
    ] = await Promise.all([
        // Legacy vendors have no sellingChannels sub-document, so retail is
        // matched as "not explicitly false" to keep historical data counted.
        Vendor.countDocuments({
            ...approvedVendorFilter,
            'sellingChannels.retail.enabled': { $ne: false },
            'sellingChannels.wholesale.enabled': { $ne: true },
        }),
        Vendor.countDocuments({
            ...approvedVendorFilter,
            'sellingChannels.retail.enabled': false,
            'sellingChannels.wholesale.enabled': true,
        }),
        Vendor.countDocuments({
            ...approvedVendorFilter,
            'sellingChannels.retail.enabled': { $ne: false },
            'sellingChannels.wholesale.enabled': true,
        }),
        Product.countDocuments({ isActive: true, wholesaleEnabled: true }),
        Product.countDocuments({ isActive: true }),
        Order.aggregate([
            { $match: activeOrderFilter },
            {
                $group: {
                    _id: { $ifNull: ['$orderType', 'retail'] },
                    count: { $sum: 1 },
                    revenue: { $sum: '$total' },
                },
            },
        ]),
        // Bulk revenue is summed from the wholesale order lines themselves so it
        // reflects the amount actually paid at tier pricing.
        Order.aggregate([
            { $match: activeOrderFilter },
            { $unwind: '$items' },
            { $match: { 'items.pricingType': 'wholesale' } },
            {
                $group: {
                    _id: null,
                    bulkRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    unitsSold: { $sum: '$items.quantity' },
                    customerSavings: { $sum: { $ifNull: ['$items.savings', 0] } },
                },
            },
        ]),
        Order.aggregate([
            { $match: activeOrderFilter },
            { $unwind: '$items' },
            { $match: { 'items.pricingType': 'wholesale' } },
            {
                $group: {
                    _id: '$items.productId',
                    name: { $first: '$items.name' },
                    unitsSold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                },
            },
            { $sort: { revenue: -1 } },
            { $limit: 5 },
        ]),
    ]);

    const orderTypeCounts = orderTypeAgg.reduce(
        (acc, row) => {
            acc[row._id] = { count: row.count, revenue: row.revenue };
            return acc;
        },
        {}
    );
    const wholesaleOrders = (orderTypeCounts.wholesale?.count || 0) + (orderTypeCounts.mixed?.count || 0);

    res.status(200).json(new ApiResponse(200, {
        vendors: {
            retailOnly: retailOnlyVendors,
            wholesaleOnly: wholesaleOnlyVendors,
            hybrid: hybridVendors,
            wholesaleCapable: wholesaleOnlyVendors + hybridVendors,
        },
        products: {
            wholesaleProducts,
            totalProducts,
            retailProducts: Math.max(0, totalProducts - wholesaleProducts),
        },
        orders: {
            retail: orderTypeCounts.retail?.count || 0,
            wholesale: orderTypeCounts.wholesale?.count || 0,
            mixed: orderTypeCounts.mixed?.count || 0,
            wholesaleTotal: wholesaleOrders,
        },
        revenue: {
            bulkRevenue: parseFloat((bulkRevenueAgg[0]?.bulkRevenue || 0).toFixed(2)),
            unitsSold: bulkRevenueAgg[0]?.unitsSold || 0,
            customerSavings: parseFloat((bulkRevenueAgg[0]?.customerSavings || 0).toFixed(2)),
        },
        topBulkProducts: topBulkProducts.map((product) => ({
            productId: String(product._id || ''),
            name: product.name || 'Unknown product',
            unitsSold: product.unitsSold,
            revenue: parseFloat((product.revenue || 0).toFixed(2)),
        })),
    }, 'Wholesale stats fetched.'));
});

/**
 * GET /api/admin/analytics/quick-commerce
 *
 * Platform view of Quick Commerce health.
 *
 * Ordered by what actually decides whether the experience is working: ETA
 * performance first, then dispatch reliability, then commercial figures.
 * Serviceability coverage is included because a healthy-looking ETA over three
 * live stores is not the same signal as one over three hundred.
 */
export const getQuickCommerceStats = asyncHandler(async (req, res) => {
    const { start, end } = resolveDateRange({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        days: Number(req.query.days) || 30,
    });

    // Hour/day buckets follow the viewer's clock, not the server's.
    const timezone = req.query.timezone;

    const rangeMatch = baseQuickCommerceMatch({ createdAt: { $gte: start, $lte: end } });
    const todayMatch = baseQuickCommerceMatch({ createdAt: { $gte: startOfToday() } });
    const liveMatch = baseQuickCommerceMatch({
        'quickCommerce.status': { $nin: ['delivered', 'cancelled'] },
    });

    const [
        volume,
        today,
        eta,
        live,
        assignment,
        responsiveness,
        topStores,
        topProducts,
        peakHours,
        daily,
        quickCommerceVendors,
        orderableVendors,
        quickCommerceProducts,
        quickCommerceRiders,
        busyRiders,
    ] = await Promise.all([
        qcVolumeStats(rangeMatch),
        qcVolumeStats(todayMatch),
        qcEtaStats(rangeMatch),
        qcStageBreakdown(liveMatch),
        qcAssignmentStats(rangeMatch),
        qcVendorResponsiveness(rangeMatch),
        qcTopStores(rangeMatch, 10),
        qcTopProducts(rangeMatch, 10),
        qcPeakHours(rangeMatch, timezone),
        qcDailySeries(rangeMatch, timezone),
        Vendor.countDocuments({
            status: 'approved',
            'sellingChannels.quickCommerce.enabled': true,
        }),
        Vendor.countDocuments({
            status: 'approved',
            'sellingChannels.quickCommerce.enabled': true,
            'quickCommerceProfile.availabilityStatus': { $in: ['open', 'busy'] },
        }),
        Product.countDocuments({ isActive: true, quickCommerceEnabled: true }),
        DeliveryBoy.countDocuments({
            isActive: true,
            applicationStatus: 'approved',
            experiences: 'quick_commerce',
        }),
        DeliveryBoy.countDocuments({
            isActive: true,
            applicationStatus: 'approved',
            experiences: 'quick_commerce',
            activeOrderId: { $ne: null },
        }),
    ]);

    res.status(200).json(new ApiResponse(200, {
        range: { start, end },
        // The leading indicator of Quick Commerce health.
        eta,
        volume,
        today,
        live,
        assignment,
        responsiveness,
        coverage: {
            quickCommerceVendors,
            orderableVendors,
            quickCommerceProducts,
        },
        riders: {
            total: quickCommerceRiders,
            busy: busyRiders,
            available: Math.max(0, quickCommerceRiders - busyRiders),
            // Share of the Quick Commerce fleet currently carrying an order.
            utilisationRate: quickCommerceRiders > 0
                ? Number(((busyRiders / quickCommerceRiders) * 100).toFixed(2))
                : 0,
        },
        topStores: topStores.map((store) => ({
            vendorId: String(store._id || ''),
            storeName: store.storeName || 'Unknown store',
            orders: store.orders,
            revenue: store.revenue,
            slaBreaches: store.slaBreaches,
            slaBreachRate: store.slaBreachRate,
        })),
        topProducts: topProducts.map((product) => ({
            productId: String(product._id || ''),
            name: product.name || 'Unknown product',
            unitsSold: product.unitsSold,
            revenue: parseFloat((product.revenue || 0).toFixed(2)),
        })),
        peakHours,
        daily,
    }, 'Quick Commerce stats fetched.'));
});
