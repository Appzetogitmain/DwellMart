import SupportConversation, { SUPPORT_REASONS_MAP } from '../models/SupportConversation.model.js';
import SupportMessage from '../models/SupportMessage.model.js';
import ApiError from '../utils/ApiError.js';
import { notifySupportActivity } from './SupportNotification.service.js';
import { emitToRoom } from '../socket.js';

const ROLE_MODEL_MAP = {
    customer: 'User',
    vendor: 'Vendor',
    delivery: 'DeliveryBoy',
};

const SYSTEM_THANK_YOU_MESSAGE = `Thank you for contacting DwellMart Support.

Your support request has been received successfully.

Our support team will review your request and get back to you as soon as possible.

You will receive a notification whenever there is an update on your conversation.`;

/**
 * Creates a new support conversation with automatic Thank-You system message
 */
export const createConversationService = async ({
    userId,
    userRole, // 'customer', 'vendor', 'delivery'
    reason,
    description = '',
}) => {
    const normalizedRole = String(userRole || '').toLowerCase();
    const userModel = ROLE_MODEL_MAP[normalizedRole];
    if (!userModel) {
        throw new ApiError(400, 'Invalid user role for support conversation.');
    }

    if (!reason) {
        throw new ApiError(400, 'Support reason is required.');
    }

    const uppercaseReason = String(reason).toUpperCase().trim();
    const allowedReasons = SUPPORT_REASONS_MAP[normalizedRole] || [];

    if (!allowedReasons.includes(uppercaseReason)) {
        throw new ApiError(400, `Invalid support reason for ${normalizedRole}.`);
    }

    const trimmedDescription = String(description || '').trim();

    if (uppercaseReason === 'OTHER') {
        if (!trimmedDescription || trimmedDescription.length < 20) {
            throw new ApiError(
                400,
                'Description is required for "Other" support reason and must be at least 20 characters long.'
            );
        }
    }

    // Check for existing active conversation for same user and reason
    const existingActive = await SupportConversation.findOne({
        user: userId,
        userRole: normalizedRole,
        reason: uppercaseReason,
        status: { $in: ['open', 'in_progress'] },
    });

    if (existingActive) {
        throw new ApiError(
            400,
            'You already have an active support conversation for this issue. Please continue in the existing conversation.'
        );
    }

    // Create Conversation
    const conversation = await SupportConversation.create({
        user: userId,
        userRole: normalizedRole,
        userModel,
        reason: uppercaseReason,
        description: trimmedDescription,
        status: 'open',
        unreadAdmin: 1,
        unreadUser: 0,
        lastMessage: SYSTEM_THANK_YOU_MESSAGE.slice(0, 100) + '...',
        lastMessageAt: new Date(),
    });

    // Create System Thank You Message
    const systemMessage = await SupportMessage.create({
        conversation: conversation._id,
        sender: userId,
        senderRole: 'system',
        message: SYSTEM_THANK_YOU_MESSAGE,
        messageType: 'system',
        isSystemMessage: true,
    });

    const populatedConversation = await SupportConversation.findById(conversation._id)
        .populate('user', 'name email storeName phone fullName avatar logo profileImage')
        .lean();

    // Real-Time Socket Event
    emitToRoom('admin', 'conversation_created', { conversation: populatedConversation, message: systemMessage });
    emitToRoom(`conversation_${conversation._id}`, 'receive_message', systemMessage);

    // Notify Admins
    await notifySupportActivity({
        recipientType: 'admin',
        title: `New Support Request`,
        message: `New support ticket created by ${normalizedRole.toUpperCase()}.`,
        type: 'system',
        data: { conversationId: String(conversation._id), role: normalizedRole },
        socketEvent: 'notification',
    });

    return { conversation: populatedConversation, message: systemMessage };
};

/**
 * Sends a message in a conversation and updates lastMessageAt for real-time list reordering
 */
export const sendMessageService = async ({
    conversationId,
    senderId,
    senderRole, // 'customer', 'vendor', 'delivery', 'admin'
    message = '',
    attachments = [],
}) => {
    const conversation = await SupportConversation.findById(conversationId);
    if (!conversation) {
        throw new ApiError(404, 'Support conversation not found.');
    }

    const normalizedSenderRole = String(senderRole || '').toLowerCase();

    // Closed conversation read-only check
    if ((conversation.status === 'closed' || conversation.isClosed) && normalizedSenderRole !== 'admin') {
        throw new ApiError(400, 'This conversation is closed and read-only. Please contact support to open a new query.');
    }

    const trimmedMessage = String(message || '').trim();
    if (!trimmedMessage && (!attachments || attachments.length === 0)) {
        throw new ApiError(400, 'Message text or attachment is required.');
    }

    let messageType = 'text';
    if (attachments && attachments.length > 0) {
        const hasDoc = attachments.some((att) => att.fileType === 'document' || att.filename?.endsWith('.pdf'));
        messageType = hasDoc ? 'document' : 'image';
    }

    const newMessage = await SupportMessage.create({
        conversation: conversationId,
        sender: senderId,
        senderRole: normalizedSenderRole,
        message: trimmedMessage,
        attachments,
        messageType,
        isSystemMessage: false,
    });

    const previewText = trimmedMessage
        ? trimmedMessage.slice(0, 80)
        : attachments.length > 0
        ? `📎 Attachment (${attachments.length})`
        : 'New message';

    conversation.lastMessage = previewText;
    conversation.lastMessageAt = new Date(); // Updates lastMessageAt for list reordering

    if (normalizedSenderRole === 'admin') {
        conversation.unreadUser += 1;
        if (conversation.status === 'open') {
            conversation.status = 'in_progress';
        }
    } else {
        conversation.unreadAdmin += 1;
    }

    await conversation.save();

    const populatedConversation = await SupportConversation.findById(conversation._id)
        .populate('user', 'name email storeName phone fullName avatar logo profileImage')
        .lean();

    // Broadcast Message & Updated Conversation (for list reordering) via Socket.IO
    emitToRoom(`conversation_${conversationId}`, 'receive_message', newMessage);
    emitToRoom('admin', 'conversation_updated', populatedConversation);
    emitToRoom(`user_${conversation.user}`, 'conversation_updated', populatedConversation);

    // Notify Recipient
    if (normalizedSenderRole === 'admin') {
        const recipientType = conversation.userRole === 'customer' ? 'user' : conversation.userRole;
        await notifySupportActivity({
            recipientId: conversation.user,
            recipientType,
            title: 'DwellMart Support Reply',
            message: `Admin replied: "${previewText}"`,
            type: 'system',
            data: { conversationId: String(conversation._id) },
            socketEvent: 'notification',
        });
    } else {
        await notifySupportActivity({
            recipientType: 'admin',
            title: `Message from ${normalizedSenderRole.toUpperCase()}`,
            message: `New message: "${previewText}"`,
            type: 'system',
            data: { conversationId: String(conversation._id), role: normalizedSenderRole },
            socketEvent: 'notification',
        });
    }

    return newMessage;
};

/**
 * Updates conversation status (Open -> In Progress -> Resolved -> Closed)
 */
export const updateStatusService = async ({ conversationId, status, adminId }) => {
    const allowed = ['open', 'in_progress', 'resolved', 'closed'];
    if (!allowed.includes(status)) {
        throw new ApiError(400, 'Invalid conversation status.');
    }

    const conversation = await SupportConversation.findById(conversationId);
    if (!conversation) {
        throw new ApiError(404, 'Support conversation not found.');
    }

    conversation.status = status;
    conversation.isClosed = status === 'closed';
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // Create System Message
    const formattedStatus = status.replace('_', ' ').toUpperCase();
    const systemMessage = await SupportMessage.create({
        conversation: conversation._id,
        sender: adminId,
        senderRole: 'system',
        message: `Conversation status updated to ${formattedStatus}.`,
        messageType: 'system',
        isSystemMessage: true,
    });

    const populatedConversation = await SupportConversation.findById(conversation._id)
        .populate('user', 'name email storeName phone fullName avatar logo profileImage')
        .lean();

    emitToRoom(`conversation_${conversationId}`, 'receive_message', systemMessage);
    emitToRoom(`conversation_${conversationId}`, 'conversation_updated', populatedConversation);
    emitToRoom('admin', 'conversation_updated', populatedConversation);

    // Notify User on status change (resolved / closed / in_progress)
    const recipientType = conversation.userRole === 'customer' ? 'user' : conversation.userRole;
    await notifySupportActivity({
        recipientId: conversation.user,
        recipientType,
        title: 'Support Status Update',
        message: `Your support request status changed to ${formattedStatus}.`,
        type: 'system',
        data: { conversationId: String(conversation._id), status },
        socketEvent: 'notification',
    });

    return populatedConversation;
};

/**
 * Marks conversation messages as read
 */
export const markReadService = async ({ conversationId, userId, role }) => {
    const conversation = await SupportConversation.findById(conversationId);
    if (!conversation) {
        throw new ApiError(404, 'Support conversation not found.');
    }

    const normalizedRole = String(role || '').toLowerCase();
    const readAtDate = new Date();

    if (normalizedRole === 'admin' || normalizedRole === 'superadmin') {
        conversation.unreadAdmin = 0;
        await SupportMessage.updateMany(
            { conversation: conversationId, senderRole: { $ne: 'admin' }, readAt: null },
            { readAt: readAtDate }
        );
    } else {
        conversation.unreadUser = 0;
        await SupportMessage.updateMany(
            { conversation: conversationId, senderRole: 'admin', readAt: null },
            { readAt: readAtDate }
        );
    }

    await conversation.save();

    const populatedConversation = await SupportConversation.findById(conversation._id)
        .populate('user', 'name email storeName phone fullName avatar logo profileImage')
        .lean();

    emitToRoom(`conversation_${conversationId}`, 'mark_read', { conversationId, role: normalizedRole });
    emitToRoom('admin', 'conversation_updated', populatedConversation);
    emitToRoom(`user_${conversation.user}`, 'conversation_updated', populatedConversation);

    return { success: true };
};
