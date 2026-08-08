/**
 * Admin Push Broadcast Controller
 *
 * Sends FCM push notifications + creates in-app Notification records for
 * a targeted audience (all, customers, vendors, delivery, or everyone).
 *
 * FCM dispatch path:
 *   1. Resolve recipient IDs by target group
 *   2. Collect all active DeviceTokens for those recipients
 *   3. Send ONE FCM multicast (sendMulticastPushNotification) — avoids duplicates
 *   4. Bulk-insert Notification records (one per recipient) for in-app display
 *   5. Emit Socket.IO notification:new + notification:count per recipient
 *   6. Return delivery statistics
 *
 * IMPORTANT: We do NOT call createNotification() per recipient because that
 * would trigger a second FCM dispatch per recipient. Instead we split the
 * two concerns:
 *   - FCM: one multicast to all tokens
 *   - In-app DB + Socket: direct bulk insert + socket emit
 */

import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Notification from '../../../models/Notification.model.js';
import DeviceToken from '../../../models/DeviceToken.model.js';
import User from '../../../models/User.model.js';
import Vendor from '../../../models/Vendor.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import { sendMulticastPushNotification } from '../../../services/firebase.service.js';
import { emitToUserRoom, emitToRoom } from '../../../socket.js';

// ─── Resolve recipient IDs by target ─────────────────────────────────────────

const resolveRecipients = async (target) => {
    const results = []; // [{ recipientId, recipientType }]

    if (target === 'customers' || target === 'all') {
        const users = await User.find({ isActive: { $ne: false } })
            .select('_id')
            .lean();
        users.forEach((u) => results.push({ recipientId: u._id, recipientType: 'user' }));
    }

    if (target === 'vendors' || target === 'all') {
        const vendors = await Vendor.find({ status: 'approved' })
            .select('_id')
            .lean();
        vendors.forEach((v) => results.push({ recipientId: v._id, recipientType: 'vendor' }));
    } else if (target === 'retail-vendors') {
        const vendors = await Vendor.find({ status: 'approved', vendorType: 'retail' })
            .select('_id')
            .lean();
        vendors.forEach((v) => results.push({ recipientId: v._id, recipientType: 'vendor' }));
    } else if (target === 'quick-commerce-vendors') {
        const vendors = await Vendor.find({ status: 'approved', vendorType: 'quick_commerce' })
            .select('_id')
            .lean();
        vendors.forEach((v) => results.push({ recipientId: v._id, recipientType: 'vendor' }));
    } else if (target === 'wholesale-vendors') {
        const vendors = await Vendor.find({ status: 'approved', vendorType: 'wholesale' })
            .select('_id')
            .lean();
        vendors.forEach((v) => results.push({ recipientId: v._id, recipientType: 'vendor' }));
    }

    if (target === 'delivery' || target === 'all') {
        const deliveryBoys = await DeliveryBoy.find({
            isActive: true,
            applicationStatus: 'approved',
        })
            .select('_id')
            .lean();
        deliveryBoys.forEach((d) =>
            results.push({ recipientId: d._id, recipientType: 'delivery' })
        );
    }

    return results;
};

// POST /api/admin/notifications/broadcast-push
export const broadcastPush = asyncHandler(async (req, res) => {
    const {
        title,
        message,
        target = 'all',
        image = '',
        category = 'MARKETING',
        priority = 'NORMAL',
        actionUrl = '',
        metadata = {},
    } = req.body;

    if (!title || !message) {
        throw new ApiError(400, 'title and message are required.');
    }

    const validTargets = [
        'all',
        'customers',
        'vendors',
        'retail-vendors',
        'quick-commerce-vendors',
        'wholesale-vendors',
        'delivery',
    ];
    if (!validTargets.includes(target)) {
        throw new ApiError(400, `target must be one of: ${validTargets.join(', ')}`);
    }

    // 1. Resolve all recipients for the chosen target
    const recipients = await resolveRecipients(target);
    if (recipients.length === 0) {
        return res.status(200).json(
            new ApiResponse(200, {
                success: true,
                recipients: 0,
                tokensFound: 0,
                fcmSent: 0,
                fcmFailed: 0,
                inAppCreated: 0,
            }, 'No active recipients found for this target.')
        );
    }

    const recipientIds = recipients.map((r) => r.recipientId);

    // 2. Find all active device tokens for these recipients
    const tokenDocs = await DeviceToken.find({
        recipientId: { $in: recipientIds },
        isActive: true,
    })
        .select('fcmToken recipientId recipientType')
        .lean();

    const tokens = tokenDocs.map((t) => t.fcmToken).filter(Boolean);

    // 3. Send ONE FCM multicast (only if tokens exist)
    let fcmSent = 0;
    let fcmFailed = 0;
    let fcmErrors = [];

    if (tokens.length > 0) {
        const fcmResult = await sendMulticastPushNotification({
            tokens,
            title,
            body: message,
            image,
            data: {
                category: String(category).toUpperCase(),
                priority: String(priority).toUpperCase(),
                actionUrl: actionUrl || '',
                image: image || '',
                source: 'admin_broadcast',
            },
        });
        fcmSent = fcmResult.successCount || 0;
        fcmFailed = fcmResult.failureCount || 0;
        fcmErrors = fcmResult.fcmErrors || [];
    }

    // 4. Bulk-insert one Notification record per recipient for in-app display
    const normalizedCategory = String(category).toUpperCase();
    const normalizedPriority = String(priority).toUpperCase();
    const normalizedType = 'system'; // broadcast is always a 'system' type notification

    const notificationDocs = recipients.map(({ recipientId, recipientType }) => ({
        recipientId,
        recipientType,
        title,
        message,
        body: message,
        image: image || '',
        category: normalizedCategory,
        type: normalizedType,
        priority: normalizedPriority,
        actionUrl,
        metadata: { ...metadata, broadcastTarget: target, sentBy: String(req.user?._id || '') },
        isRead: false,
        deliveredAt: new Date(),
    }));

    let inAppCreated = 0;
    try {
        const inserted = await Notification.insertMany(notificationDocs, { ordered: false });
        inAppCreated = inserted.length;

        // 5. Emit Socket.IO notification:new per recipient (fire-and-forget)
        setImmediate(async () => {
            try {
                for (const doc of inserted) {
                    const socketPayload = { notification: doc.toObject ? doc.toObject() : doc, unreadCount: 1 };
                    if (doc.recipientType === 'admin') {
                        emitToRoom('admin', 'notification:new', socketPayload);
                        emitToRoom('admin', 'notification:count', { unreadCount: 1 });
                    } else {
                        emitToUserRoom(
                            doc.recipientId,
                            doc.recipientType,
                            'notification:new',
                            socketPayload
                        );
                        emitToUserRoom(doc.recipientId, doc.recipientType, 'notification:count', {
                            unreadCount: 1,
                        });
                    }
                }
            } catch (socketErr) {
                console.warn('[Broadcast] Socket emit error:', socketErr.message);
            }
        });
    } catch (insertErr) {
        // insertMany with ordered:false continues past individual errors
        // inAppCreated stays 0 — not a fatal failure for the broadcast itself
        console.warn('[Broadcast] In-app notification insert partial failure:', insertErr.message);
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                success: true,
                recipients: recipients.length,
                tokensFound: tokens.length,
                fcmSent,
                fcmFailed,
                ...(fcmErrors.length > 0 ? { fcmErrors } : {}),
                inAppCreated,
            },
            'Push notification broadcast completed.'
        )
    );
});
