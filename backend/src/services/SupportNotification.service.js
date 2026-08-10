import mongoose from 'mongoose';
import Notification from '../models/Notification.model.js';
import { emitToRoom, emitToUserRoom } from '../socket.js';
import { dispatchPushNotification } from './push.service.js';

/**
 * Creates and persists a support notification in DB and emits real-time socket events
 */
export const notifySupportActivity = async ({
    recipientId,
    recipientType, // 'user' (customer), 'vendor', 'delivery', 'admin'
    title,
    message,
    type = 'support',
    data = {},
    socketEvent = 'notification',
}) => {
    try {
        let savedNotification = null;
        
        // Ensure recipientId exists even for admin notifications so Mongoose validation succeeds
        const targetRecipientId = recipientId || new mongoose.Types.ObjectId('000000000000000000000000');

        savedNotification = await Notification.create({
            recipientId: targetRecipientId,
            recipientType,
            title,
            message,
            type,
            data: new Map(Object.entries(data)),
        });

        const notifObj = savedNotification ? savedNotification.toObject() : { title, message, data };
        const payload = {
            notification: notifObj,
            title,
            message,
            data,
            timestamp: new Date(),
        };

        if (recipientType === 'admin') {
            emitToRoom('admin', socketEvent, payload);
            emitToRoom('admin', 'notification:new', payload);
            emitToRoom('admin', 'notification_count', { type: 'admin' });
        } else if (recipientId && recipientType) {
            emitToUserRoom(recipientId, recipientType, socketEvent, payload);
            emitToUserRoom(recipientId, recipientType, 'notification:new', payload);
            emitToUserRoom(recipientId, recipientType, 'notification_count', { type: recipientType });

            // Push Notification to device via FCM
            dispatchPushNotification({
                recipientId,
                recipientType,
                title,
                body: message,
                data: {
                    ...data,
                    type,
                    title,
                    message,
                },
            }).catch((err) => console.error('[SupportNotification] FCM push error:', err.message));
        }

        return savedNotification;
    } catch (error) {
        console.error('Error sending support notification:', error);
        return null;
    }
};

export const getUnreadNotificationCount = async (recipientId, recipientType) => {
    try {
        if (recipientType === 'admin') {
            return await Notification.countDocuments({
                $or: [{ recipientType: 'admin' }, { recipientId }],
                isRead: false,
            });
        }
        if (!recipientId) return 0;
        return await Notification.countDocuments({
            recipientId,
            recipientType,
            isRead: false,
        });
    } catch (error) {
        return 0;
    }
};
