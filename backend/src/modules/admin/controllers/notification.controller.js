import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Notification from '../../../models/Notification.model.js';

// GET /api/admin/notifications
export const getAdminNotifications = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, type } = req.query;
    const skip = (page - 1) * limit;

    // Filter for admin notifications
    // recipientType is 'admin' OR recipientId matches the admin's ID (if targeting specific admin)
    // For now, we'll assume a general 'admin' type or checks against the logged-in admin's ID if we had multiple admins.
    // Given the model, we can look for recipientType: 'admin' OR specific admin ID.

    const filter = {
        $or: [
            { recipientType: 'admin' },
            { recipientId: req.user.id, recipientType: 'admin' }
        ]
    };

    if (type) {
        filter.type = type;
    }

    const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

    const total = await Notification.countDocuments(filter);

    // Count unread
    const unreadCount = await Notification.countDocuments({ ...filter, isRead: false });

    res.status(200).json(new ApiResponse(200, {
        notifications,
        total,
        unreadCount,
        page: Number(page),
        pages: Math.ceil(total / limit)
    }, 'Notifications fetched.'));
});

// PUT /api/admin/notifications/:id/read
export const markAsRead = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Scoped to admin notifications. Previously `findByIdAndUpdate(id, ...)`
    // with no filter, so an admin — or a sub-admin holding only dashboard.view —
    // could mark any customer's, vendor's or rider's notification as read.
    const notification = await Notification.findOneAndUpdate(
        { _id: id, recipientType: 'admin' },
        { isRead: true },
        { new: true }
    );

    if (!notification) {
        throw new ApiError(404, 'Notification not found.');
    }

    res.status(200).json(new ApiResponse(200, notification, 'Notification marked as read.'));
});

// PUT /api/admin/notifications/read-all
export const markAllAsRead = asyncHandler(async (req, res) => {
    // Mark all 'admin' type notifications as read, or tailored to this user
    const filter = {
        $or: [
            { recipientType: 'admin' },
            { recipientId: req.user.id, recipientType: 'admin' }
        ],
        isRead: false
    };

    await Notification.updateMany(filter, { isRead: true });

    res.status(200).json(new ApiResponse(200, null, 'All notifications marked as read.'));
});
