import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Order from '../../../models/Order.model.js';

export const getBusinessOverview = asyncHandler(async (req, res) => {
    const vendorId = new mongoose.Types.ObjectId(req.user.id);
    const rows = await Order.aggregate([
        {
            $match: {
                'vendorItems.vendorId': vendorId,
                isDeleted: { $ne: true },
                // Cancelled and returned orders are not revenue. `analytics/overview`
                // already excluded them, so the two vendor-facing surfaces
                // reported different totals for the same account.
                status: { $nin: ['cancelled', 'returned', 'refunded'] },
            },
        },
        { $unwind: '$vendorItems' },
        { $match: { 'vendorItems.vendorId': vendorId, 'vendorItems.status': { $ne: 'cancelled' } } },
        { $group: {
            _id: { $ifNull: ['$fulfillmentType', { $ifNull: ['$orderType', 'retail'] }] },
            revenue: { $sum: { $ifNull: ['$vendorItems.subtotal', 0] } },
            orderIds: { $addToSet: '$_id' },
            customerIds: { $addToSet: '$userId' },
        } },
    ]);
    const channels = {
        retail: { revenue: 0, orders: 0, customers: 0 },
        wholesale: { revenue: 0, orders: 0, customers: 0 },
        quick_commerce: { revenue: 0, orders: 0, customers: 0 },
    };
    const allCustomers = new Set();
    // Per-channel customer sets, so two $group keys collapsing into the same
    // bucket (e.g. a legacy 'marketplace' value alongside 'retail') merge
    // instead of the second silently overwriting the first.
    const channelCustomers = { retail: new Set(), wholesale: new Set(), quick_commerce: new Set() };
    const channelOrders = { retail: new Set(), wholesale: new Set(), quick_commerce: new Set() };
    for (const row of rows) {
        const channel = channels[row._id] ? row._id : 'retail';
        channels[channel].revenue += Number(row.revenue || 0);
        row.orderIds.filter(Boolean).forEach((id) => channelOrders[channel].add(String(id)));
        row.customerIds.filter(Boolean).forEach((id) => {
            channelCustomers[channel].add(String(id));
            allCustomers.add(String(id));
        });
    }
    for (const channel of Object.keys(channels)) {
        channels[channel].orders = channelOrders[channel].size;
        channels[channel].customers = channelCustomers[channel].size;
    }
    const totals = Object.values(channels).reduce((sum, item) => ({
        revenue: sum.revenue + item.revenue,
        orders: sum.orders + item.orders,
        customers: allCustomers.size,
    }), { revenue: 0, orders: 0, customers: 0 });
    res.status(200).json(new ApiResponse(200, { totals, channels, generatedAt: new Date() }, 'Business overview fetched.'));
});

