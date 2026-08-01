import Notification from '../models/Notification.model.js';

/**
 * Create a notification for a user/vendor/delivery/admin
 * @param {Object} options - { recipientId, recipientType, title, message, type, data }
 */
export const createNotification = async ({
    recipientId,
    recipientType,
    title,
    message,
    type = 'system',
    data = {},
    // Additive: existing callers omit it and get the previous behaviour exactly.
    priority = 'normal',
}) => {
    return Notification.create({ recipientId, recipientType, title, message, type, data, priority });
};

/**
 * Get unread notifications for a recipient
 */
export const getUnreadNotifications = async (recipientId, recipientType) => {
    return Notification.find({ recipientId, recipientType, isRead: false }).sort({ createdAt: -1 }).limit(20);
};

/**
 * Mark all notifications as read for a recipient
 */
export const markAllAsRead = async (recipientId, recipientType) => {
    return Notification.updateMany({ recipientId, recipientType, isRead: false }, { isRead: true });
};
