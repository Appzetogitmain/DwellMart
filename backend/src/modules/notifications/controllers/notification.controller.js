import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import * as notificationService from '../../../services/notification.service.js';

const resolveRecipientContext = (req) => {
    const user = req.user || {};
    const rawRole = String(user.role || '').toLowerCase();

    if (rawRole === 'admin' || rawRole === 'superadmin') {
        return { recipientId: user.id || user._id, recipientType: 'admin' };
    }
    if (rawRole === 'vendor') {
        return { recipientId: user.id || user._id, recipientType: 'vendor' };
    }
    if (rawRole === 'delivery' || rawRole === 'driver') {
        return { recipientId: user.id || user._id, recipientType: 'delivery' };
    }

    return { recipientId: user.id || user._id, recipientType: 'user' };
};

// GET /api/notifications
export const getNotifications = asyncHandler(async (req, res) => {
    const { recipientId, recipientType } = resolveRecipientContext(req);
    const { page = 1, limit = 20, isRead, category, type } = req.query;

    const parsedIsRead = isRead === 'true' ? true : isRead === 'false' ? false : undefined;

    const result = await notificationService.getUserNotifications({
        recipientId,
        recipientType,
        page,
        limit,
        isRead: parsedIsRead,
        category,
        type,
    });

    res.status(200).json(new ApiResponse(200, result, 'Notifications fetched successfully.'));
});

// GET /api/notifications/unread-count
export const getUnreadCount = asyncHandler(async (req, res) => {
    const { recipientId, recipientType } = resolveRecipientContext(req);
    const count = await notificationService.getUnreadCount(recipientId, recipientType);
    res.status(200).json(new ApiResponse(200, { unreadCount: count }, 'Unread count fetched.'));
});

// PATCH /api/notifications/:id/read
export const markAsRead = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { recipientId, recipientType } = resolveRecipientContext(req);

    const updated = await notificationService.markAsRead(id, recipientId, recipientType);
    if (!updated) throw new ApiError(404, 'Notification not found or access denied.');

    res.status(200).json(new ApiResponse(200, updated, 'Notification marked as read.'));
});

// PATCH /api/notifications/read-all
export const markAllAsRead = asyncHandler(async (req, res) => {
    const { recipientId, recipientType } = resolveRecipientContext(req);
    await notificationService.markAllAsRead(recipientId, recipientType);
    res.status(200).json(new ApiResponse(200, null, 'All notifications marked as read.'));
});

// DELETE /api/notifications/:id
export const deleteNotification = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { recipientId, recipientType } = resolveRecipientContext(req);

    const deleted = await notificationService.deleteNotification(id, recipientId, recipientType);
    if (!deleted) throw new ApiError(404, 'Notification not found.');

    res.status(200).json(new ApiResponse(200, null, 'Notification deleted successfully.'));
});

// DELETE /api/notifications/clear-all
export const clearAllNotifications = asyncHandler(async (req, res) => {
    const { recipientId, recipientType } = resolveRecipientContext(req);
    await notificationService.clearAllNotifications(recipientId, recipientType);
    res.status(200).json(new ApiResponse(200, null, 'All notifications cleared.'));
});

// POST /api/notifications/test-push
export const sendTestPushNotification = asyncHandler(async (req, res) => {
    const { recipientId, recipientType } = resolveRecipientContext(req);
    const userName = req.user?.name || 'Valued User';

    const notif = await notificationService.createNotification({
        recipientId,
        recipientType,
        category: 'SUCCESS',
        type: 'system',
        priority: 'HIGH',
        title: '🎉 Welcome to DwellMart!',
        message: `Hello ${userName}! Your Push Notification & Realtime Notification System is working perfectly.`,
        actionUrl: '/notifications',
        data: { test: 'true' },
    });

    res.status(200).json(new ApiResponse(200, notif, 'Test push notification sent successfully.'));
});
