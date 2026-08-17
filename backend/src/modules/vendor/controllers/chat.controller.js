import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import VendorChatThread from '../../../models/VendorChatThread.model.js';
import VendorChatMessage from '../../../models/VendorChatMessage.model.js';

const buildThreadSeedFromOrder = (order) => {
    const customerName =
        order?.shippingAddress?.name ||
        order?.guestInfo?.name ||
        'Customer';
    const customerEmail =
        order?.shippingAddress?.email ||
        order?.guestInfo?.email ||
        '';
    const customerPhone =
        order?.shippingAddress?.phone ||
        order?.guestInfo?.phone ||
        '';
    const orderDisplayId = order?.orderId || String(order?._id || '');

    return {
        orderDisplayId,
        customerUserId: order?.userId || null,
        customerName,
        customerEmail,
        customerPhone,
        status: 'active',
    };
};

const serializeMessage = (messageDoc) => ({
    id: messageDoc._id,
    sender: messageDoc.senderType,
    message: messageDoc.message,
    time: messageDoc.createdAt,
});

export const getVendorChatThreads = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;

    const recentOrders = await Order.find({ 'vendorItems.vendorId': vendorId })
        .sort({ createdAt: -1 })
        .limit(100)
        .select('_id orderId userId guestInfo shippingAddress createdAt')
        .lean();

    for (const order of recentOrders) {
        const seed = buildThreadSeedFromOrder(order);
        await VendorChatThread.updateOne(
            { vendorId, orderRef: order._id },
            {
                $setOnInsert: {
                    vendorId,
                    orderRef: order._id,
                    ...seed,
                    lastMessage: '',
                    lastActivity: order?.createdAt || new Date(),
                    unreadCount: 0,
                },
                $set: {
                    orderDisplayId: seed.orderDisplayId,
                    customerUserId: seed.customerUserId,
                    customerName: seed.customerName,
                    customerEmail: seed.customerEmail,
                    customerPhone: seed.customerPhone,
                },
            },
            { upsert: true }
        );
    }

    const threads = await VendorChatThread.find({ vendorId }).sort({ lastActivity: -1 });
    res.status(200).json(new ApiResponse(200, threads, 'Chat threads fetched.'));
});

export const getVendorChatMessages = asyncHandler(async (req, res) => {
    const thread = await VendorChatThread.findOne({
        _id: req.params.id,
        vendorId: req.user.id,
    });
    if (!thread) throw new ApiError(404, 'Chat thread not found.');

    const messages = await VendorChatMessage.find({ threadId: thread._id }).sort({ createdAt: 1 });

    res
        .status(200)
        .json(new ApiResponse(200, messages.map(serializeMessage), 'Chat messages fetched.'));
});

export const sendVendorChatMessage = asyncHandler(async (req, res) => {
    const message = String(req.body?.message || '').trim();
    if (!message) throw new ApiError(400, 'Message is required.');

    const thread = await VendorChatThread.findOne({
        _id: req.params.id,
        vendorId: req.user.id,
    });
    if (!thread) throw new ApiError(404, 'Chat thread not found.');

    const created = await VendorChatMessage.create({
        threadId: thread._id,
        senderType: 'vendor',
        senderId: req.user.id,
        message,
    });

    thread.lastMessage = message;
    thread.lastActivity = created.createdAt;
    await thread.save();

    res.status(201).json(new ApiResponse(201, serializeMessage(created), 'Message sent.'));
});

export const markVendorChatRead = asyncHandler(async (req, res) => {
    const thread = await VendorChatThread.findOne({
        _id: req.params.id,
        vendorId: req.user.id,
    });
    if (!thread) throw new ApiError(404, 'Chat thread not found.');

    thread.unreadCount = 0;
    if (thread.status !== 'resolved') thread.status = 'active';
    await thread.save();

    res.status(200).json(new ApiResponse(200, thread, 'Chat marked as read.'));
});

export const updateVendorChatStatus = asyncHandler(async (req, res) => {
    const status = String(req.body?.status || '').trim();
    if (!['active', 'resolved'].includes(status)) {
        throw new ApiError(400, 'Status must be active or resolved.');
    }

    const thread = await VendorChatThread.findOneAndUpdate(
        { _id: req.params.id, vendorId: req.user.id },
        { status },
        { new: true }
    );
    if (!thread) throw new ApiError(404, 'Chat thread not found.');

    res.status(200).json(new ApiResponse(200, thread, 'Chat status updated.'));
});
