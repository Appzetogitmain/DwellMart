import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import User from '../../../models/User.model.js';
import Commission from '../../../models/Commission.model.js';
import Product from '../../../models/Product.model.js';
import { createNotification } from '../../../services/notification.service.js';
import {
    claimRider,
    releaseRider,
    retryAssignment,
} from '../../../services/riderAssignment.service.js';
import { pointToLatLng } from '../../../services/quickCommerce.service.js';
import Vendor from '../../../models/Vendor.model.js';
import { EXPERIENCES } from '../../../constants/experiences.js';
import { QUICK_COMMERCE_ASSIGNMENT_STATUS } from '../../../constants/quickCommerce.js';

/**
 * GET /api/admin/orders/quick-commerce/unassigned
 *
 * The escalation queue. Quick Commerce orders that found no rider land here so
 * an operator can intervene — the whole point of recording `escalated` as a
 * state rather than inferring it from a null `deliveryBoyId`.
 */
export const getUnassignedQuickCommerceOrders = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));

    const filter = {
        experience: EXPERIENCES.QUICK_COMMERCE,
        isDeleted: { $ne: true },
        deliveryBoyId: null,
        'quickCommerce.assignment.status': QUICK_COMMERCE_ASSIGNMENT_STATUS.ESCALATED,
        status: { $nin: ['delivered', 'cancelled', 'returned'] },
    };

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .sort({ createdAt: 1 }) // oldest first — longest-waiting customer first
            .skip((page - 1) * limit)
            .limit(limit)
            .select('orderId createdAt total status quickCommerce vendorItems.vendorId vendorItems.vendorName shippingAddress.city')
            .lean(),
        Order.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        orders,
        total,
        page,
        pages: Math.ceil(total / limit) || 1,
    }, 'Unassigned Quick Commerce orders fetched.'));
});

/**
 * POST /api/admin/orders/:id/retry-assignment
 *
 * Re-run automatic assignment for an escalated order. Cheaper for an operator
 * than picking a rider by hand, and uses the identical claim path.
 */
export const retryQuickCommerceAssignment = asyncHandler(async (req, res) => {
    const idFilter = [{ orderId: req.params.id }];
    if (/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
        idFilter.push({ _id: req.params.id });
    }

    const order = await Order.findOne({ $or: idFilter, isDeleted: { $ne: true } })
        .select('orderId userId experience deliveryBoyId vendorItems.vendorId status');
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.experience !== EXPERIENCES.QUICK_COMMERCE) {
        throw new ApiError(400, 'This is not a Quick Commerce order.');
    }
    if (order.deliveryBoyId) {
        throw new ApiError(409, 'This order already has a delivery partner.');
    }
    if (['delivered', 'cancelled', 'returned'].includes(String(order.status))) {
        throw new ApiError(409, `Cannot assign delivery for ${order.status} order.`);
    }

    const vendorId = order.vendorItems?.[0]?.vendorId;
    const vendor = vendorId
        ? await Vendor.findById(vendorId).select('quickCommerceProfile.location').lean()
        : null;
    const pickup = pointToLatLng(vendor?.quickCommerceProfile?.location);
    if (!pickup) {
        throw new ApiError(409, 'The store has no delivery location configured.');
    }

    const result = await retryAssignment(order._id, pickup);

    res.status(200).json(new ApiResponse(200, {
        assigned: result.assigned,
        rider: result.rider
            ? { id: String(result.rider._id), name: result.rider.name, phone: result.rider.phone }
            : null,
    }, result.assigned
        ? 'Delivery partner assigned.'
        : 'No delivery partner is available right now. The order remains in the queue.'));
});

// GET /api/admin/orders
export const getAllOrders = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20, search, startDate, endDate, userId } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;
    const filter = { isDeleted: { $ne: true } };

    if (status && status !== 'all') filter.status = status;
    if (String(req.query.assignableOnly || '') === 'true' && !filter.status) {
        filter.status = { $in: ['pending', 'processing', 'shipped'] };
    }
    if (search) {
        const regex = new RegExp(search, 'i');
        const matchedUsers = await User.find({
            $or: [{ name: regex }, { email: regex }, { phone: regex }]
        }).select('_id').limit(200).lean();
        const matchedUserIds = matchedUsers.map((u) => u._id);

        filter.$or = [
            { orderId: regex },
            { 'shippingAddress.name': regex },
            { 'shippingAddress.email': regex },
            ...(matchedUserIds.length > 0 ? [{ userId: { $in: matchedUserIds } }] : []),
        ];
    }
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (req.query.vendorId) {
        filter['vendorItems.vendorId'] = req.query.vendorId;
    }
    if (userId) {
        filter.userId = userId;
    }
    if (String(req.query.onlyUnassigned || '') === 'true') {
        filter.deliveryBoyId = null;
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .populate('userId', 'name email phone')
            .populate('deliveryBoyId', 'name phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        orders,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit),
    }, 'Orders fetched.'));
});

// GET /api/admin/orders/:id
export const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    })
        .populate('userId', 'name email phone')
        .populate('deliveryBoyId', 'name phone email vehicleType vehicleNumber')
        .populate('items.productId', 'name images price')
        .lean();

    if (!order) throw new ApiError(404, 'Order not found.');
    res.status(200).json(new ApiResponse(200, order, 'Order fetched.'));
});

// PATCH /api/admin/orders/:id/status
export const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    }).populate('userId', 'name email');

    if (!order) throw new ApiError(404, 'Order not found.');

    const previousStatus = String(order.status || '').toLowerCase();
    const nextStatus = String(status || '').toLowerCase();

    const allowedTransitions = {
        pending: ['processing', 'cancelled'],
        processing: ['shipped', 'cancelled'],
        shipped: ['delivered', 'cancelled', 'returned'],
        delivered: ['returned'],
        cancelled: [],
        returned: [],
    };

    if (previousStatus !== nextStatus) {
        const nextAllowed = allowedTransitions[previousStatus] || [];
        if (!nextAllowed.includes(nextStatus)) {
            throw new ApiError(409, `Cannot move order from ${previousStatus} to ${nextStatus}.`);
        }
    }

    order.status = nextStatus;
    if (nextStatus === 'delivered') {
        order.deliveredAt = new Date();
        order.cancelledAt = null;
    } else if (nextStatus === 'cancelled') {
        order.cancelledAt = new Date();
    } else if (nextStatus === 'returned') {
        order.cancelledAt = null;
    } else {
        order.deliveredAt = null;
        order.cancelledAt = null;
    }

    if (nextStatus === 'processing') {
        order.vendorItems = (order.vendorItems || []).map((vi) => {
            const current = String(vi?.status || 'pending');
            if (current === 'cancelled' || current === 'delivered') return vi;
            return { ...vi.toObject(), status: 'processing' };
        });
    }
    if (nextStatus === 'shipped') {
        order.vendorItems = (order.vendorItems || []).map((vi) => {
            const current = String(vi?.status || 'pending');
            if (current === 'cancelled' || current === 'delivered') return vi;
            return { ...vi.toObject(), status: 'shipped' };
        });
    }
    if (nextStatus === 'delivered') {
        order.vendorItems = (order.vendorItems || []).map((vi) => {
            const current = String(vi?.status || 'pending');
            if (current === 'cancelled') return vi;
            return { ...vi.toObject(), status: 'delivered' };
        });
    }
    if (nextStatus === 'cancelled') {
        order.vendorItems = (order.vendorItems || []).map((vi) => {
            const current = String(vi?.status || 'pending');
            if (current === 'delivered') return vi;
            return { ...vi.toObject(), status: 'cancelled' };
        });
    }

    if (nextStatus === 'cancelled' && previousStatus !== 'cancelled' && ['pending', 'processing', 'shipped'].includes(previousStatus)) {
        for (const item of order.items || []) {
            const product = await Product.findById(item.productId);
            if (!product) continue;
            
            product.stockQuantity += Number(item.quantity || 0);
            
            // Restore variant specific stock if applicable
            if (item.variantKey && product.variants?.stockMap) {
                const currentVariantStock = product.variants.stockMap.get(item.variantKey) || 0;
                product.variants.stockMap.set(item.variantKey, currentVariantStock + Number(item.quantity || 0));
            }
            
            if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
            else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
            else product.stock = 'in_stock';
            await product.save();
        }
    }

    await order.save();

    if (nextStatus === 'cancelled') {
        // Reverse vendor earnings visibility for this order.
        // Keep it idempotent by only updating commissions not already cancelled.
        await Commission.updateMany(
            {
                orderId: order._id,
                status: { $ne: 'cancelled' },
            },
            {
                $set: {
                    status: 'cancelled',
                    paidAt: null,
                    settlementId: null,
                },
            }
        );
    }

    const notificationTasks = [];

    if (order.userId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Order status updated',
                message: `Your order ${order.orderId} is now ${status}.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
                },
            })
        );
    }

    const vendorIds = [
        ...new Set(
            (order.vendorItems || [])
                .map((item) => String(item?.vendorId || '').trim())
                .filter(Boolean)
        ),
    ];

    vendorIds.forEach((vendorId) => {
        notificationTasks.push(
            createNotification({
                recipientId: vendorId,
                recipientType: 'vendor',
                title: 'Order status updated by admin',
                message: `Order ${order.orderId} was updated to ${status} by admin.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
                },
            })
        );
    });

    if (order.deliveryBoyId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.deliveryBoyId,
                recipientType: 'delivery',
                title: 'Assigned order updated',
                message: `Order ${order.orderId} is now ${status}.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
                },
            })
        );
    }

    if (notificationTasks.length > 0) {
        await Promise.allSettled(notificationTasks);
    }

    res.status(200).json(new ApiResponse(200, order, 'Order status updated.'));
});

// PATCH /api/admin/orders/:id/assign-delivery
export const assignDeliveryBoy = asyncHandler(async (req, res) => {
    const { deliveryBoyId } = req.body;
    if (!deliveryBoyId) throw new ApiError(400, 'deliveryBoyId is required.');

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId).select('name isActive applicationStatus');
    if (!deliveryBoy) throw new ApiError(404, 'Delivery boy not found.');
    if (!deliveryBoy.isActive) throw new ApiError(400, 'Delivery boy is inactive.');
    if (deliveryBoy.applicationStatus !== 'approved') {
        throw new ApiError(400, 'Delivery boy is not approved.');
    }

    const filter = {
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    };
    const order = await Order.findOne(filter);
    if (!order) throw new ApiError(404, 'Order not found.');

    if (['cancelled', 'returned', 'delivered'].includes(String(order.status))) {
        throw new ApiError(409, `Cannot assign delivery for ${order.status} order.`);
    }

    const previousDeliveryBoyId = order.deliveryBoyId ? String(order.deliveryBoyId) : '';
    const isReassigned = previousDeliveryBoyId && previousDeliveryBoyId !== String(deliveryBoyId);

    // Quick Commerce riders carry one order at a time, so a manual assignment
    // must take the same atomic claim the automatic path takes — otherwise an
    // admin can hand a rider a second order while they are mid-delivery.
    if (order.experience === EXPERIENCES.QUICK_COMMERCE) {
        const claimed = await claimRider(deliveryBoyId, order._id);
        if (!claimed) {
            throw new ApiError(409, `${deliveryBoy.name} is not available for a Quick Commerce order right now.`);
        }
        if (previousDeliveryBoyId && previousDeliveryBoyId !== String(deliveryBoyId)) {
            // Free the rider being replaced.
            await releaseRider(previousDeliveryBoyId, order._id);
        }
        order.quickCommerce = order.quickCommerce || {};
        order.quickCommerce.assignment = {
            ...(order.quickCommerce.assignment?.toObject?.() || order.quickCommerce.assignment || {}),
            status: QUICK_COMMERCE_ASSIGNMENT_STATUS.ASSIGNED,
            assignedAt: new Date(),
            lastAttemptAt: new Date(),
        };
    }

    order.deliveryBoyId = deliveryBoyId;
    if (order.status === 'pending') {
        order.status = 'processing';
        // Keep vendor-facing status in sync with order lifecycle.
        order.vendorItems = (order.vendorItems || []).map((vi) => {
            const current = String(vi?.status || 'pending');
            if (current === 'cancelled' || current === 'delivered') return vi;
            return { ...vi.toObject(), status: 'processing' };
        });
    }
    await order.save();

    await createNotification({
        recipientId: deliveryBoy._id,
        recipientType: 'delivery',
        title: isReassigned ? 'Order reassigned' : 'New order assigned',
        message: `${order.orderId} has been ${isReassigned ? 'reassigned to you' : 'assigned to you'}.`,
        type: 'order',
        data: {
            orderId: String(order.orderId),
            reassigned: isReassigned ? 'true' : 'false',
            assignedAt: new Date().toISOString(),
        },
    });

    const assignmentTasks = [];
    if (order.userId) {
        assignmentTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: isReassigned ? 'Delivery partner updated' : 'Delivery assigned',
                message: `Order ${order.orderId} has a delivery partner assigned.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    deliveryBoyId: String(deliveryBoy._id),
                },
            })
        );
    }

    const vendorIds = [
        ...new Set(
            (order.vendorItems || [])
                .map((item) => String(item?.vendorId || '').trim())
                .filter(Boolean)
        ),
    ];
    vendorIds.forEach((vendorId) => {
        assignmentTasks.push(
            createNotification({
                recipientId: vendorId,
                recipientType: 'vendor',
                title: isReassigned ? 'Delivery reassigned' : 'Delivery assigned',
                message: `Order ${order.orderId} has been assigned to a delivery partner.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    deliveryBoyId: String(deliveryBoy._id),
                },
            })
        );
    });

    if (assignmentTasks.length > 0) {
        await Promise.allSettled(assignmentTasks);
    }

    res.status(200).json(new ApiResponse(200, order, 'Delivery boy assigned.'));
});

// DELETE /api/admin/orders/:id
export const deleteOrder = asyncHandler(async (req, res) => {
    const order = await Order.findOneAndUpdate(
        {
            $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
            isDeleted: { $ne: true },
        },
        {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user?.id || null,
        },
        { new: true }
    );
    if (!order) throw new ApiError(404, 'Order not found.');
    res.status(200).json(new ApiResponse(200, null, 'Order archived.'));
});

// POST /api/admin/orders/:id/delivery-override
export const deliveryOverride = asyncHandler(async (req, res) => {
    const { action, reason } = req.body;
    const allowedActions = ['retry', 'refund', 'return_to_store'];
    if (!allowedActions.includes(action)) {
        throw new ApiError(400, `Action must be one of: ${allowedActions.join(', ')}`);
    }

    const order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    });
    if (!order) throw new ApiError(404, 'Order not found.');

    order.adminOverride = {
        action,
        reason: String(reason || 'Admin override applied').trim(),
        adminId: req.user.id,
        timestamp: new Date(),
    };

    if (action === 'retry') {
        order.status = 'processing';
        if (order.quickCommerce) order.quickCommerce.status = 'retry_scheduled';
    } else if (action === 'refund' || action === 'return_to_store') {
        order.status = 'returned';
        if (order.quickCommerce) order.quickCommerce.status = 'delivery_failed';
        order.paymentStatus = 'refunded';
    }

    await order.save();
    res.status(200).json(new ApiResponse(200, order, `Admin override '${action}' applied successfully.`));
});
