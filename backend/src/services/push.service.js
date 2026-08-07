import DeviceToken from '../models/DeviceToken.model.js';
import { sendMulticastPushNotification } from './firebase.service.js';

/**
 * Dispatch Push Notification to all registered active devices of a recipient
 */
export const dispatchPushNotification = async ({ recipientId, recipientType, title, body, data = {}, image = '' }) => {
    try {
        if (!recipientId || !recipientType) return { sent: false, reason: 'missing_recipient' };

        const devices = await DeviceToken.find({
            recipientId,
            recipientType,
            isActive: true,
        }).select('fcmToken');

        if (!devices || devices.length === 0) {
            return { sent: false, count: 0, reason: 'no_active_tokens' };
        }

        const tokens = devices.map((d) => d.fcmToken).filter(Boolean);
        const result = await sendMulticastPushNotification({
            tokens,
            title,
            body,
            data,
            image,
        });

        // Touch lastUsed date for targeted active tokens
        await DeviceToken.updateMany(
            { fcmToken: { $in: tokens }, isActive: true },
            { $set: { lastUsed: new Date() } }
        );

        return { sent: true, ...result };
    } catch (error) {
        console.error(`[Push Service] Failed to send push to ${recipientType}:${recipientId}:`, error.message);
        return { sent: false, error: error.message };
    }
};
