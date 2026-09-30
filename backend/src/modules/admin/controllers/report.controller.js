import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Order from '../../../models/Order.model.js';
import Product from '../../../models/Product.model.js';
import Settings from '../../../models/Settings.model.js';
import Vendor from '../../../models/Vendor.model.js';
import User from '../../../models/User.model.js';

// GET /api/admin/reports/sales
export const getSalesReport = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        status = 'delivered',
        startDate,
        endDate,
        search,
        period,
    } = req.query;

    const numericPage = Number.parseInt(page, 10) || 1;
    const numericLimit = Number.parseInt(limit, 10) || 20;
    const skip = (numericPage - 1) * numericLimit;

    const filter = { isDeleted: { $ne: true } };
    if (status && status !== 'all') filter.status = status;
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (search) {
        const regex = new RegExp(search, 'i');
        filter.$or = [
            { orderId: regex },
            { 'shippingAddress.name': regex },
            { 'shippingAddress.email': regex },
        ];
    }

    // Determine trend granularity: daily (%Y-%m-%d) or weekly (%Y-%U) or monthly (%Y-%m)
    let groupFormat = '%Y-%m-%d';
    if (period === 'monthly') groupFormat = '%Y-%m';
    else if (period === 'weekly') groupFormat = '%Y-%U';
    else if (period === 'daily') groupFormat = '%Y-%m-%d';
    else if (startDate && endDate) {
        const diffDays = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
        if (diffDays > 120) groupFormat = '%Y-%m';
        else if (diffDays > 45) groupFormat = '%Y-%U';
        else groupFormat = '%Y-%m-%d';
    }

    const [orders, total, totalsAgg, trendAgg] = await Promise.all([
        Order.find(filter)
            .populate('userId', 'name email phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(filter),
        Order.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: { $ifNull: ['$total', 0] } },
                    totalOrders: { $sum: 1 },
                },
            },
        ]),
        Order.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
                    sales: { $sum: { $ifNull: ['$total', 0] } },
                    orders: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]),
    ]);

    const totals = totalsAgg?.[0] || { totalSales: 0, totalOrders: 0 };
    const summary = {
        totalSales: Number(totals.totalSales) || 0,
        totalOrders: Number(totals.totalOrders) || 0,
        averageOrderValue:
            (Number(totals.totalOrders) || 0) > 0
                ? (Number(totals.totalSales) || 0) / Number(totals.totalOrders)
                : 0,
    };

    let trend = (trendAgg || []).map((t) => ({
        date: t._id,
        sales: Math.round((Number(t.sales) || 0) * 100) / 100,
        orders: Number(t.orders) || 0,
    }));

    // If daily grouping with explicit date range, fill dates that had 0 sales
    if (groupFormat === '%Y-%m-%d' && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 62) {
            const map = new Map(trend.map((item) => [item.date, item]));
            const filled = [];
            const curr = new Date(start);
            while (curr <= end) {
                const dateStr = curr.toISOString().split('T')[0];
                if (map.has(dateStr)) {
                    filled.push(map.get(dateStr));
                } else {
                    filled.push({ date: dateStr, sales: 0, orders: 0 });
                }
                curr.setDate(curr.getDate() + 1);
            }
            trend = filled;
        }
    }

    res.status(200).json(
        new ApiResponse(
            200,
            {
                orders,
                total,
                page: numericPage,
                pages: Math.ceil(total / numericLimit),
                summary,
                trend,
            },
            'Sales report fetched.'
        )
    );
});

// GET /api/admin/reports/inventory
export const getInventoryReport = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, search, status } = req.query;
    const numericPage = Number.parseInt(page, 10) || 1;
    const numericLimit = Number.parseInt(limit, 10) || 50;
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (search) filter.$text = { $search: search };
    if (status && status !== 'all') filter.stock = status;

    const [products, total, summaryAgg] = await Promise.all([
        Product.find(filter)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
        Product.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalProducts: { $sum: 1 },
                    activeProducts: {
                        $sum: {
                            $cond: [{ $ne: ['$isActive', false] }, 1, 0]
                        }
                    },
                    lowStock: {
                        $sum: {
                            $cond: [{ $eq: ['$stock', 'low_stock'] }, 1, 0]
                        }
                    },
                    outOfStock: {
                        $sum: {
                            $cond: [{ $eq: ['$stock', 'out_of_stock'] }, 1, 0]
                        }
                    },
                    totalValue: {
                        $sum: {
                            $multiply: [
                                { $ifNull: ['$price', 0] },
                                { $ifNull: ['$stockQuantity', 0] },
                            ]
                        }
                    },
                }
            }
        ]),
    ]);

    const aggregated = summaryAgg?.[0] || {};
    const summary = {
        totalProducts: Number(aggregated.totalProducts) || 0,
        activeProducts: Number(aggregated.activeProducts) || 0,
        lowStock: Number(aggregated.lowStock) || 0,
        outOfStock: Number(aggregated.outOfStock) || 0,
        totalValue: Number(aggregated.totalValue) || 0,
    };

    res.status(200).json(
        new ApiResponse(
            200,
            {
                products,
                total,
                page: numericPage,
                pages: Math.ceil(total / numericLimit),
                summary,
            },
            'Inventory report fetched.'
        )
    );
});

// GET /api/admin/reports/tds or /api/admin/finance/tax-reports/tds
export const getTdsReport = asyncHandler(async (req, res) => {
    const {
        startDate,
        endDate,
        vendorId,
        userId,
        view = 'vendor',
        page = 1,
        limit = 20,
    } = req.query;

    const numericPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const numericLimit = Math.max(1, Number.parseInt(limit, 10) || 20);
    const skip = (numericPage - 1) * numericLimit;

    // Check TDS configuration in database (Settings)
    const [taxSetting, tdsSetting] = await Promise.all([
        Settings.findOne({ key: 'product_tax_pricing_rules' }).lean(),
        Settings.findOne({ key: 'tds' }).lean(),
    ]);

    let configuredTdsRate = null;
    if (tdsSetting?.value?.rate != null) {
        configuredTdsRate = Number(tdsSetting.value.rate);
    } else if (taxSetting?.value?.tdsRate != null) {
        configuredTdsRate = Number(taxSetting.value.tdsRate);
    }
    const tdsConfigured = configuredTdsRate !== null && !isNaN(configuredTdsRate);

    // Build base order match filter
    const orderMatch = {
        isDeleted: { $ne: true },
        status: 'delivered',
    };
    if (startDate || endDate) {
        orderMatch.createdAt = {};
        if (startDate) orderMatch.createdAt.$gte = new Date(startDate);
        if (endDate) orderMatch.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (userId) {
        orderMatch.userId = mongoose.Types.ObjectId.isValid(userId)
            ? new mongoose.Types.ObjectId(userId)
            : userId;
    }
    if (vendorId) {
        orderMatch['vendorItems.vendorId'] = mongoose.Types.ObjectId.isValid(vendorId)
            ? new mongoose.Types.ObjectId(vendorId)
            : vendorId;
    }

    if (view === 'user') {
        const userAgg = await Order.aggregate([
            { $match: orderMatch },
            {
                $group: {
                    _id: '$userId',
                    customerName: { $first: '$shippingAddress.name' },
                    customerEmail: { $first: '$shippingAddress.email' },
                    customerPhone: { $first: '$shippingAddress.phone' },
                    orderIds: { $addToSet: '$_id' },
                    taxableAmount: { $sum: { $ifNull: ['$subtotal', 0] } },
                    gstAmount: { $sum: { $ifNull: ['$tax', 0] } },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userDoc',
                },
            },
            { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    userId: '$_id',
                    customerName: { $ifNull: ['$userDoc.name', '$customerName', 'Guest Customer'] },
                    customerEmail: { $ifNull: ['$userDoc.email', '$customerEmail', 'N/A'] },
                    customerPhone: { $ifNull: ['$userDoc.phone', '$customerPhone', 'N/A'] },
                    orderCount: { $size: '$orderIds' },
                    taxableAmount: { $round: ['$taxableAmount', 2] },
                    gstAmount: { $round: ['$gstAmount', 2] },
                },
            },
            { $sort: { taxableAmount: -1 } },
        ]);

        const totalItems = userAgg.length;
        const totalTaxable = Math.round(userAgg.reduce((s, u) => s + (u.taxableAmount || 0), 0) * 100) / 100;
        const totalGst = Math.round(userAgg.reduce((s, u) => s + (u.gstAmount || 0), 0) * 100) / 100;
        const totalTds = tdsConfigured ? Math.round(totalTaxable * (configuredTdsRate / 100) * 100) / 100 : null;
        const netPayable = tdsConfigured
            ? Math.round((totalTaxable + totalGst - totalTds) * 100) / 100
            : Math.round((totalTaxable + totalGst) * 100) / 100;

        const paginatedItems = userAgg.slice(skip, skip + numericLimit).map((u) => {
            const tdsAmount = tdsConfigured ? Math.round(u.taxableAmount * (configuredTdsRate / 100) * 100) / 100 : null;
            const net = tdsConfigured
                ? Math.round((u.taxableAmount + u.gstAmount - tdsAmount) * 100) / 100
                : Math.round((u.taxableAmount + u.gstAmount) * 100) / 100;
            return {
                ...u,
                gstin: 'N/A', // Retail User model does not have a GSTIN
                tdsRate: tdsConfigured ? `${configuredTdsRate}%` : null,
                tdsAmount,
                netPayable: net,
            };
        });

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    summary: {
                        totalTaxableAmount: totalTaxable,
                        totalGstAmount: totalGst,
                        totalTdsAmount: totalTds,
                        netPayable,
                        totalOrders: userAgg.reduce((s, u) => s + (u.orderCount || 0), 0),
                        tdsConfigured,
                        configuredTdsRate,
                    },
                    items: paginatedItems,
                    total: totalItems,
                    page: numericPage,
                    pages: Math.ceil(totalItems / numericLimit) || 1,
                    view,
                    tdsConfigured,
                    configuredTdsRate,
                },
                'User-wise TDS report fetched.'
            )
        );
    }

    // Default: view === 'vendor'
    const vendorAgg = await Order.aggregate([
        { $match: orderMatch },
        { $unwind: '$vendorItems' },
        ...(vendorId
            ? [
                  {
                      $match: {
                          'vendorItems.vendorId': mongoose.Types.ObjectId.isValid(vendorId)
                              ? new mongoose.Types.ObjectId(vendorId)
                              : vendorId,
                      },
                  },
              ]
            : []),
        {
            $group: {
                _id: '$vendorItems.vendorId',
                vendorName: { $first: '$vendorItems.vendorName' },
                orderIds: { $addToSet: '$_id' },
                taxableAmount: { $sum: { $ifNull: ['$vendorItems.subtotal', 0] } },
                gstAmount: { $sum: { $ifNull: ['$vendorItems.tax', 0] } },
            },
        },
        {
            $lookup: {
                from: 'vendors',
                localField: '_id',
                foreignField: '_id',
                as: 'vendorDoc',
            },
        },
        { $unwind: { path: '$vendorDoc', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1,
                vendorId: '$_id',
                vendorName: { $ifNull: ['$vendorName', '$vendorDoc.storeName', '$vendorDoc.name', 'Unknown Vendor'] },
                gstin: {
                    $ifNull: [
                        '$vendorDoc.wholesaleProfile.gstNumber',
                        'N/A'
                    ]
                },
                orderCount: { $size: '$orderIds' },
                taxableAmount: { $round: ['$taxableAmount', 2] },
                gstAmount: { $round: ['$gstAmount', 2] },
            },
        },
        { $sort: { taxableAmount: -1 } },
    ]);

    const totalItems = vendorAgg.length;
    const totalTaxable = Math.round(vendorAgg.reduce((s, v) => s + (v.taxableAmount || 0), 0) * 100) / 100;
    const totalGst = Math.round(vendorAgg.reduce((s, v) => s + (v.gstAmount || 0), 0) * 100) / 100;
    const totalTds = tdsConfigured ? Math.round(totalTaxable * (configuredTdsRate / 100) * 100) / 100 : null;
    const netPayable = tdsConfigured
        ? Math.round((totalTaxable + totalGst - totalTds) * 100) / 100
        : Math.round((totalTaxable + totalGst) * 100) / 100;

    const paginatedItems = vendorAgg.slice(skip, skip + numericLimit).map((v) => {
        const tdsAmount = tdsConfigured ? Math.round(v.taxableAmount * (configuredTdsRate / 100) * 100) / 100 : null;
        const net = tdsConfigured
            ? Math.round((v.taxableAmount + v.gstAmount - tdsAmount) * 100) / 100
            : Math.round((v.taxableAmount + v.gstAmount) * 100) / 100;
        return {
            ...v,
            tdsRate: tdsConfigured ? `${configuredTdsRate}%` : null,
            tdsAmount,
            netPayable: net,
        };
    });

    res.status(200).json(
        new ApiResponse(
            200,
            {
                summary: {
                    totalTaxableAmount: totalTaxable,
                    totalGstAmount: totalGst,
                    totalTdsAmount: totalTds,
                    netPayable,
                    totalOrders: vendorAgg.reduce((s, v) => s + (v.orderCount || 0), 0),
                    tdsConfigured,
                    configuredTdsRate,
                },
                items: paginatedItems,
                total: totalItems,
                page: numericPage,
                pages: Math.ceil(totalItems / numericLimit) || 1,
                view,
                tdsConfigured,
                configuredTdsRate,
            },
            'Vendor-wise TDS report fetched.'
        )
    );
});

