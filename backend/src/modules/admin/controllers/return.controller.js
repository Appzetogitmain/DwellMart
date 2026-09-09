import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Order from '../../../models/Order.model.js';
import User from '../../../models/User.model.js';
import Product from '../../../models/Product.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { parsePagination } from '../../../utils/pagination.js';

const enrichReturnItems = (request) => {
    const orderItems = Array.isArray(request?.orderId?.items) ? request.orderId.items : [];
    const returnItems = Array.isArray(request?.items) ? request.items : [];

    return returnItems.map((item) => {
        const productId = String(item?.productId || '');
        const matchedOrderItem = orderItems.find(
            (orderItem) => String(orderItem?.productId || '') === productId
        );

        return {
            ...item,
            name: item?.name || matchedOrderItem?.name || 'Unknown Product',
            price: Number(item?.price ?? matchedOrderItem?.price ?? 0),
            image: item?.image || matchedOrderItem?.image || '',
        };
    });
};

const normalizeReturnRequest = (request) => ({
    ...request._doc,
    id: request._id,
    customer: request.userId
        ? {
            name: request.userId.name,
            email: request.userId.email,
            phone: request.userId.phone
        }
        : { name: 'Guest', email: 'N/A' },
    orderId: request.orderId?.orderId || 'N/A',
    orderRefId: request.orderId?._id || null,
    requestDate: request.createdAt,
    items: enrichReturnItems(request),
});

/**
 * @desc    Get all return requests with filtering and pagination
 * @route   GET /api/admin/return-requests
 * @access  Private (Admin)
 */
export const getAllReturnRequests = asyncHandler(async (req, res) => {
    const { search = '', status, startDate, endDate } = req.query;
    const { page, limit, skip, calculatePages } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 1000 });

    const filter = {};

    if (status && status !== 'all') {
        filter.status = status;
    }
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    // Search by return id, order number, customer fields, and reason text
    if (search) {
        const regex = new RegExp(search, 'i');
        const isObjectId = search.match(/^[0-9a-fA-F]{24}$/);

        const [matchedOrders, matchedUsers] = await Promise.all([
            Order.find({ orderId: regex }).select('_id').lean(),
            User.find({
                $or: [{ name: regex }, { email: regex }, { phone: regex }]
            }).select('_id').limit(200).lean(),
        ]);

        const matchedOrderIds = matchedOrders.map((o) => o._id);
        const matchedUserIds = matchedUsers.map((u) => u._id);

        const orFilters = [
            { reason: regex },
            { 'items.name': regex },
            ...(matchedOrderIds.length > 0 ? [{ orderId: { $in: matchedOrderIds } }] : []),
            ...(matchedUserIds.length > 0 ? [{ userId: { $in: matchedUserIds } }] : []),
        ];

        if (isObjectId) {
            orFilters.push({ _id: search }, { orderId: search });
        }

        if (orFilters.length > 0) {
            filter.$or = orFilters;
        }
    }

    const returnRequests = await ReturnRequest.find(filter)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const total = await ReturnRequest.countDocuments(filter);

    // Normalize data for frontend
    const normalizedRequests = returnRequests.map(normalizeReturnRequest);

    res.status(200).json(
        new ApiResponse(200, {
            returnRequests: normalizedRequests,
            pagination: {
                total,
                page,
                limit,
                pages: calculatePages(total)
            }
        }, 'Return requests fetched successfully')
    );
});

/**
 * @desc    Get return request detail
 * @route   GET /api/admin/return-requests/:id
 * @access  Private (Admin)
 */
export const getReturnRequestById = asyncHandler(async (req, res) => {
    const request = await ReturnRequest.findById(req.params.id)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total createdAt items')
        .populate('vendorId', 'shopName email');

    if (!request) {
        throw new ApiError(404, 'Return request not found');
    }

    // Normalize
    const normalized = normalizeReturnRequest(request);

    res.status(200).json(
        new ApiResponse(200, normalized, 'Return request details fetched successfully')
    );
});

/**
 * @desc    Update return request status
 * @route   PATCH /api/admin/return-requests/:id/status
 * @access  Private (Admin)
 */
export const updateReturnRequestStatus = asyncHandler(async (req, res) => {
    const { status, adminNote, refundStatus } = req.body;

    const request = await ReturnRequest.findById(req.params.id)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total items');

    if (!request) {
        throw new ApiError(404, 'Return request not found');
    }

    const allowedStatuses = ['pending', 'approved', 'processing', 'rejected', 'completed'];
    const allowedRefundStatuses = ['pending', 'processed', 'failed'];
    const statusTransitions = {
        pending: ['approved', 'rejected'],
        approved: ['processing', 'completed'],
        processing: ['completed'],
        rejected: [],
        completed: [],
    };
    const refundTransitions = {
        pending: ['processed', 'failed'],
        failed: ['processed'],
        processed: [],
    };

    if (status && !allowedStatuses.includes(status)) {
        throw new ApiError(400, `Status must be one of: ${allowedStatuses.join(', ')}`);
    }
    if (refundStatus && !allowedRefundStatuses.includes(refundStatus)) {
        throw new ApiError(400, `Refund status must be one of: ${allowedRefundStatuses.join(', ')}`);
    }

    const nextStatus = status || request.status;
    const nextRefundStatus = refundStatus || request.refundStatus;
    const nextAdminNote = adminNote !== undefined ? adminNote : request.adminNote;
    const statusUnchanged = !status || status === request.status;
    const refundUnchanged = !refundStatus || refundStatus === request.refundStatus;
    const adminNoteUnchanged = adminNote === undefined || adminNote === request.adminNote;
    if (statusUnchanged && refundUnchanged && adminNoteUnchanged) {
        const normalizedNoop = {
            ...request._doc,
            id: request._id,
            customer: request.userId ? {
                name: request.userId.name,
                email: request.userId.email,
                phone: request.userId.phone
            } : { name: 'Guest', email: 'N/A' },
            orderId: request.orderId?.orderId || 'N/A',
            requestDate: request.createdAt
        };
        return res.status(200).json(new ApiResponse(200, normalizedNoop, 'No changes applied.'));
    }

    if (status && status !== request.status) {
        const allowedNext = statusTransitions[request.status] || [];
        if (!allowedNext.includes(status)) {
            throw new ApiError(409, `Cannot move return request from ${request.status} to ${status}.`);
        }
    }

    const currentRefundStatus = request.refundStatus || 'pending';
    if (refundStatus && refundStatus !== request.refundStatus) {
        const allowedRefundNext = refundTransitions[currentRefundStatus] || [];
        if (!allowedRefundNext.includes(refundStatus)) {
            throw new ApiError(409, `Cannot move refund status from ${currentRefundStatus} to ${refundStatus}.`);
        }
    }

    request.status = nextStatus;
    request.adminNote = nextAdminNote;
    if (refundStatus) request.refundStatus = nextRefundStatus;

    await request.save();

    // Return lifecycle side-effects:
    // - On approval, mark linked order as returned (if not terminal).
    // - On completion, restore stock for requested items once.
    if (status === 'approved' || status === 'completed') {
        const linkedOrderId = request.orderId?._id || request.orderId;
        if (linkedOrderId) {
            const order = await Order.findById(linkedOrderId);
            if (order && order.isDeleted !== true) {
                if (status === 'approved' && !['cancelled', 'returned'].includes(order.status)) {
                    order.status = 'returned';
                    await order.save();
                }

                if (status === 'completed') {
                    const stockRestores = (request.items || []).map(async (item) => {
                        const qty = Number(item?.quantity || 0);
                        if (!item?.productId || qty <= 0) return;
                        const product = await Product.findById(item.productId);
                        if (!product) return;

                        product.stockQuantity += qty;
                        if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
                        else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
                        else product.stock = 'in_stock';
                        await product.save();
                    });
                    await Promise.all(stockRestores);
                }
            }
        }
    }

    const notificationTasks = [];
    if (request.userId?._id) {
        notificationTasks.push(
            createNotification({
                recipientId: request.userId._id,
                recipientType: 'user',
                title: 'Return request updated',
                message: `Your return request for order ${request.orderId?.orderId || request.orderId} is now ${request.status}.`,
                type: 'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId: String(request.orderId?.orderId || request.orderId || ''),
                    status: String(request.status || ''),
                    refundStatus: String(request.refundStatus || ''),
                },
            })
        );
    }

    if (request.vendorId) {
        notificationTasks.push(
            createNotification({
                recipientId: request.vendorId,
                recipientType: 'vendor',
                title: 'Return request updated by admin',
                message: `Return request for order ${request.orderId?.orderId || request.orderId} is now ${request.status}.`,
                type: 'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId: String(request.orderId?.orderId || request.orderId || ''),
                    status: String(request.status || ''),
                    refundStatus: String(request.refundStatus || ''),
                },
            })
        );
    }

    if (notificationTasks.length > 0) {
        await Promise.allSettled(notificationTasks);
    }

    const normalized = normalizeReturnRequest(request);

    res.status(200).json(new ApiResponse(200, normalized, 'Return request status updated successfully'));
});
