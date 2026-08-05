import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import SupportConversation from '../models/SupportConversation.model.js';
import SupportMessage from '../models/SupportMessage.model.js';
import {
    createConversationService,
    sendMessageService,
    updateStatusService,
    markReadService,
} from '../services/support.service.js';

const normalizeRole = (role) => {
    const raw = String(role || '').toLowerCase();
    if (raw === 'superadmin') return 'admin';
    if (raw === 'user') return 'customer';
    return raw;
};

// POST /api/support/conversations
export const createConversation = asyncHandler(async (req, res) => {
    const { reason, description } = req.body;
    const userRole = normalizeRole(req.user.role);

    const result = await createConversationService({
        userId: req.user.id,
        userRole,
        reason,
        description,
    });

    res.status(201).json(new ApiResponse(201, result, 'Support conversation created successfully.'));
});

// GET /api/support/conversations
export const getConversations = asyncHandler(async (req, res) => {
    const userRole = normalizeRole(req.user.role);
    const { page = 1, limit = 30, status, role, search } = req.query;

    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Math.min(100, Number(limit) || 30));
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};

    if (userRole !== 'admin' && userRole !== 'superadmin') {
        filter.user = req.user.id;
        filter.userRole = userRole;
    } else {
        if (role) filter.userRole = String(role).toLowerCase();
        if (status) {
            const statusKey = String(status).toLowerCase();
            filter.status = statusKey;
        }
    }

    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        filter.$or = [{ reason: regex }, { description: regex }, { lastMessage: regex }];
    }

    const [conversations, total] = await Promise.all([
        SupportConversation.find(filter)
            .populate('user', 'name email storeName phone fullName avatar logo profileImage')
            .sort({ lastMessageAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        SupportConversation.countDocuments(filter),
    ]);

    res.status(200).json(
        new ApiResponse(
            200,
            {
                conversations,
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.ceil(total / numericLimit) || 1,
                },
            },
            'Support conversations fetched.'
        )
    );
});

// GET /api/support/conversations/:id
export const getConversationById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userRole = normalizeRole(req.user.role);

    const conversation = await SupportConversation.findById(id)
        .populate('user', 'name email storeName phone fullName avatar logo profileImage')
        .lean();

    if (!conversation) {
        throw new ApiError(404, 'Support conversation not found.');
    }

    // Access check
    if (userRole !== 'admin' && userRole !== 'superadmin') {
        if (String(conversation.user?._id || conversation.user) !== String(req.user.id)) {
            throw new ApiError(403, 'Access denied. You can only view your own support conversations.');
        }
    }

    const messages = await SupportMessage.find({
        conversation: id,
        deletedFor: { $ne: req.user.id },
    })
        .sort({ createdAt: 1 })
        .lean();

    // Auto mark as read
    await markReadService({ conversationId: id, userId: req.user.id, role: userRole });

    res.status(200).json(
        new ApiResponse(
            200,
            {
                conversation,
                messages,
            },
            'Support conversation details fetched.'
        )
    );
});

// POST /api/support/conversations/:id/messages
export const sendMessage = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { message, attachments = [] } = req.body;
    const senderRole = normalizeRole(req.user.role);

    // Access check
    const conversation = await SupportConversation.findById(id).lean();
    if (!conversation) {
        throw new ApiError(404, 'Support conversation not found.');
    }

    if (senderRole !== 'admin' && senderRole !== 'superadmin') {
        if (String(conversation.user) !== String(req.user.id)) {
            throw new ApiError(403, 'Access denied. You can only send messages in your own conversation.');
        }
    }

    const newMessage = await sendMessageService({
        conversationId: id,
        senderId: req.user.id,
        senderRole,
        message,
        attachments,
    });

    res.status(201).json(new ApiResponse(201, newMessage, 'Message sent successfully.'));
});

// PATCH /api/support/conversations/:id/status
export const updateStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const updated = await updateStatusService({
        conversationId: id,
        status,
        adminId: req.user.id,
    });

    res.status(200).json(new ApiResponse(200, updated, 'Conversation status updated successfully.'));
});

// PATCH /api/support/conversations/:id/read
export const markAsRead = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userRole = normalizeRole(req.user.role);

    const result = await markReadService({
        conversationId: id,
        userId: req.user.id,
        role: userRole,
    });

    res.status(200).json(new ApiResponse(200, result, 'Conversation marked as read.'));
});

// GET /api/support/unread-count
export const getUnreadCount = asyncHandler(async (req, res) => {
    const userRole = normalizeRole(req.user.role);
    let totalUnread = 0;

    if (userRole === 'admin' || userRole === 'superadmin') {
        const result = await SupportConversation.aggregate([
            { $group: { _id: null, total: { $sum: '$unreadAdmin' } } },
        ]);
        totalUnread = result[0]?.total || 0;
    } else {
        const result = await SupportConversation.aggregate([
            { $match: { user: req.user.id, userRole } },
            { $group: { _id: null, total: { $sum: '$unreadUser' } } },
        ]);
        totalUnread = result[0]?.total || 0;
    }

    res.status(200).json(new ApiResponse(200, { unreadCount: totalUnread }, 'Unread count fetched.'));
});

// DELETE /api/support/conversations/:id/messages/:messageId
export const deleteMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;

    const message = await SupportMessage.findById(messageId);
    if (!message) {
        throw new ApiError(404, 'Message not found.');
    }

    message.deletedFor.push(req.user.id);
    await message.save();

    res.status(200).json(new ApiResponse(200, null, 'Message deleted successfully.'));
});

// POST /api/support/upload-attachment
export const uploadAttachment = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(400, 'No file uploaded.');
    }

    const isPdf = req.file.mimetype === 'application/pdf';
    const isImage = req.file.mimetype.startsWith('image/');

    if (!isPdf && !isImage) {
        throw new ApiError(400, 'Invalid file type. Only JPG, PNG, WEBP, and PDF files are allowed.');
    }

    const fileUrl = `/uploads/tmp/${req.file.filename}`;
    const fileType = isPdf ? 'document' : 'image';

    const attachment = {
        url: fileUrl,
        filename: req.file.originalname,
        fileType,
        size: req.file.size,
    };

    res.status(200).json(new ApiResponse(200, attachment, 'Attachment uploaded successfully.'));
});
