import Notification from '../models/Notification.model.js';
import { dispatchPushNotification } from './push.service.js';
import { emitToRoom, emitToUserRoom } from '../socket.js';

/**
 * Unified notification dispatch service
 * 1. Persists notification record in MongoDB
 * 2. Emits Socket.IO real-time notification events
 * 3. Triggers Firebase FCM Push Notification
 */
export const createNotification = async ({
    recipientId,
    recipientType, // 'user' | 'vendor' | 'delivery' | 'admin'
    title,
    message,
    body,
    image = '',
    category = 'SYSTEM',
    type = 'system',
    priority = 'NORMAL',
    actionUrl = '',
    actionType = '',
    data = {},
    metadata = {},
}) => {
    try {
        const finalBody = body || message;
        const normalizedRecipientType = String(recipientType || 'user').toLowerCase();
        const normalizedType = String(type || 'system').toLowerCase();

        // P1-21 FIX: Admin broadcast notifications don't have a specific recipient ObjectId.
        // If recipientId is the literal string 'admin' or missing for admin-type notifications,
        // omit recipientId from the document (the schema now allows null for admin type).
        const isAdminBroadcast = normalizedRecipientType === 'admin';
        const resolvedRecipientId = isAdminBroadcast
            ? (recipientId && String(recipientId) !== 'admin' ? recipientId : undefined)
            : recipientId;

        // 1. Persist notification in MongoDB
        const notification = await Notification.create({
            ...(resolvedRecipientId ? { recipientId: resolvedRecipientId } : {}),
            recipientType: normalizedRecipientType,
            title,
            message: finalBody,
            body: finalBody,
            image,
            category: String(category).toUpperCase(),
            type: normalizedType,
            priority: String(priority).toUpperCase(),
            actionUrl,
            actionType,
            data: data instanceof Map ? data : new Map(Object.entries(data || {})),
            metadata,
            deliveredAt: new Date(),
        });

        // 2. Compute updated unread count
        const unreadCount = await getUnreadCount(recipientId, normalizedRecipientType);

        const socketPayload = {
            notification: notification.toObject(),
            unreadCount,
        };

        // 3. Emit real-time Socket.IO event
        try {
            if (normalizedRecipientType === 'admin') {
                emitToRoom('admin', 'notification:new', socketPayload);
                emitToRoom('admin', 'notification:count', { unreadCount, recipientType: 'admin' });
            } else {
                emitToUserRoom(recipientId, normalizedRecipientType, 'notification:new', socketPayload);
                emitToUserRoom(recipientId, normalizedRecipientType, 'notification:count', { unreadCount, recipientType: normalizedRecipientType });
            }
        } catch (socketErr) {
            console.warn(`[Notification Socket Warning]: ${socketErr.message}`);
        }

        // 4. Dispatch FCM Push Notification async (never blocks flow)
        dispatchPushNotification({
            recipientId,
            recipientType: normalizedRecipientType,
            title,
            body: finalBody,
            image,
            data: {
                notificationId: String(notification._id),
                type: normalizedType,
                category: String(category).toUpperCase(),
                actionUrl,
                actionType,
                ...Object.fromEntries(Object.entries(data || {})),
            },
        }).catch((pushErr) => {
            console.warn(`[Notification Push Warning]: ${pushErr.message}`);
        });

        return notification;
    } catch (error) {
        console.error('[Notification Service Error]:', error.message);
        throw error;
    }
};

/**
 * Get total unread count for a recipient
 */
export const getUnreadCount = async (recipientId, recipientType) => {
    if (recipientType === 'admin') {
        return Notification.countDocuments({ recipientType: 'admin', isRead: false });
    }
    return Notification.countDocuments({ recipientId, recipientType, isRead: false });
};

/**
 * Fetch paginated notifications for a recipient
 */
export const getUserNotifications = async ({ recipientId, recipientType, page = 1, limit = 20, isRead, category, type }) => {
    const query = { recipientType };
    if (recipientType !== 'admin') {
        query.recipientId = recipientId;
    }

    if (typeof isRead === 'boolean') {
        query.isRead = isRead;
    }
    if (category && category !== 'all') {
        query.category = String(category).toUpperCase();
    }
    if (type && type !== 'all') {
        query.type = String(type).toLowerCase();
    }

    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(numericLimit).lean(),
        Notification.countDocuments(query),
        getUnreadCount(recipientId, recipientType),
    ]);

    return {
        notifications,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit) || 1,
        unreadCount,
    };
};

/**
 * Get unread notifications for a recipient (Backward compatibility)
 */
export const getUnreadNotifications = async (recipientId, recipientType) => {
    const query = { recipientType, isRead: false };
    if (recipientType !== 'admin') query.recipientId = recipientId;
    return Notification.find(query).sort({ createdAt: -1 }).limit(20).lean();
};

/**
 * Mark specific notification as read
 */
export const markAsRead = async (notificationId, recipientId, recipientType) => {
    const query = { _id: notificationId };
    if (recipientType !== 'admin') query.recipientId = recipientId;

    const updated = await Notification.findOneAndUpdate(
        query,
        { $set: { isRead: true, readAt: new Date() } },
        { new: true }
    );

    if (updated) {
        const unreadCount = await getUnreadCount(recipientId, recipientType);
        try {
            if (recipientType === 'admin') {
                emitToRoom('admin', 'notification:read', { notificationId, unreadCount });
                emitToRoom('admin', 'notification:count', { unreadCount, recipientType: 'admin' });
            } else {
                emitToUserRoom(recipientId, recipientType, 'notification:read', { notificationId, unreadCount });
                emitToUserRoom(recipientId, recipientType, 'notification:count', { unreadCount, recipientType });
            }
        } catch {}
    }

    return updated;
};

/**
 * Mark all notifications as read for a recipient
 */
export const markAllAsRead = async (recipientId, recipientType) => {
    const query = { recipientType, isRead: false };
    if (recipientType !== 'admin') query.recipientId = recipientId;

    const result = await Notification.updateMany(query, { $set: { isRead: true, readAt: new Date() } });
    const unreadCount = await getUnreadCount(recipientId, recipientType);

    try {
        if (recipientType === 'admin') {
            emitToRoom('admin', 'notification:count', { unreadCount: 0, recipientType: 'admin' });
        } else {
            emitToUserRoom(recipientId, recipientType, 'notification:count', { unreadCount: 0, recipientType });
        }
    } catch {}

    return result;
};

/**
 * Delete a single notification
 */
export const deleteNotification = async (notificationId, recipientId, recipientType) => {
    const query = { _id: notificationId };
    if (recipientType !== 'admin') query.recipientId = recipientId;

    const result = await Notification.findOneAndDelete(query);
    if (result) {
        const unreadCount = await getUnreadCount(recipientId, recipientType);
        try {
            if (recipientType === 'admin') {
                emitToRoom('admin', 'notification:delete', { notificationId, unreadCount });
            } else {
                emitToUserRoom(recipientId, recipientType, 'notification:delete', { notificationId, unreadCount });
            }
        } catch {}
    }
    return result;
};

/**
 * Clear all notifications for a recipient
 */
export const clearAllNotifications = async (recipientId, recipientType) => {
    const query = { recipientType };
    if (recipientType !== 'admin') query.recipientId = recipientId;

    const result = await Notification.deleteMany(query);
    try {
        if (recipientType === 'admin') {
            emitToRoom('admin', 'notification:count', { unreadCount: 0, recipientType: 'admin' });
        } else {
            emitToUserRoom(recipientId, recipientType, 'notification:count', { unreadCount: 0, recipientType });
        }
    } catch {}

    return result;
};
