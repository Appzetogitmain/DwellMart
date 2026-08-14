import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Product from '../../../models/Product.model.js';
import Order from '../../../models/Order.model.js';
import mongoose from 'mongoose';
import { channelToProductFlag } from '../../../constants/vendorChannels.js';

export const getInventoryReport = asyncHandler(async (req, res) => {
    const { lowStockOnly } = req.query;
    const vendorObjectId = new mongoose.Types.ObjectId(req.user.id);

    const productFlag = channelToProductFlag(req.vendorWorkspace);
    const products = await Product.find({ vendorId: req.user.id, [productFlag]: true, isDeleted: { $ne: true } })
        .select('name price stockQuantity lowStockThreshold')
        .lean();

    const reportMap = {};
    for (const product of products) {
        const id = String(product._id);
        const stockQuantity = Number(product.stockQuantity || 0);
        const price = Number(product.price || 0);
        const lowStockThreshold = Number(product.lowStockThreshold || 10);
        reportMap[id] = {
            id,
            name: product.name,
            currentStock: stockQuantity,
            price,
            stockValue: stockQuantity * price,
            sold: 0,
            lowStockThreshold,
        };
    }

    const soldRows = await Order.aggregate([
        {
            $match: {
                'vendorItems.vendorId': vendorObjectId,
                status: { $nin: ['cancelled', 'returned'] },
                isDeleted: { $ne: true },
                $or: [
                    { fulfillmentType: req.vendorWorkspace },
                    { orderType: req.vendorWorkspace },
                    { 'vendorItems.orderType': req.vendorWorkspace },
                ],
            },
        },
        { $unwind: '$vendorItems' },
        {
            $match: {
                'vendorItems.vendorId': vendorObjectId,
                'vendorItems.status': { $ne: 'cancelled' },
            },
        },
        { $unwind: '$vendorItems.items' },
        {
            $group: {
                _id: '$vendorItems.items.productId',
                sold: { $sum: { $ifNull: ['$vendorItems.items.quantity', 1] } },
            },
        },
    ]);

    for (const row of soldRows) {
        const productId = String(row?._id || '');
        if (!productId || !reportMap[productId]) continue;
        reportMap[productId].sold = Number(row?.sold || 0);
    }

    let rows = Object.values(reportMap);
    if (String(lowStockOnly).toLowerCase() === 'true') {
        rows = rows.filter(
            (row) => row.currentStock <= Number(row.lowStockThreshold || 10)
        );
    }

    rows.sort((a, b) => a.name.localeCompare(b.name));

    const summary = {
        totalProducts: rows.length,
        totalStockValue: rows.reduce((sum, row) => sum + row.stockValue, 0),
        totalUnitsSold: rows.reduce((sum, row) => sum + row.sold, 0),
        lowStockItems: rows.filter(
            (row) =>
                row.currentStock > 0 &&
                row.currentStock <= Number(row.lowStockThreshold || 10)
        ).length,
    };

    res.status(200).json(
        new ApiResponse(
            200,
            { rows, summary },
            'Inventory report fetched.'
        )
    );
});
