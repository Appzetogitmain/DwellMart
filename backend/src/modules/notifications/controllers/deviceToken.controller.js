import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import DeviceToken from '../../../models/DeviceToken.model.js';

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

// POST /api/device-tokens/register
export const registerToken = asyncHandler(async (req, res) => {
    const { fcmToken, token, platform = 'web' } = req.body;
    const targetToken = fcmToken || token;

    if (!targetToken) throw new ApiError(400, 'fcmToken is required.');

    // Normalize platform to either 'web' or 'app'
    const rawPlatform = String(platform).toLowerCase();
    const normalizedPlatform = ['app', 'mobile', 'ios', 'android'].includes(rawPlatform) ? 'app' : 'web';
    const deviceType = normalizedPlatform === 'app' ? 'android' : 'web';

    const { recipientId, recipientType } = resolveRecipientContext(req);

    const tokenDoc = await DeviceToken.findOneAndUpdate(
        { fcmToken: targetToken },
        {
            $set: {
                recipientId,
                recipientType,
                deviceType,
                platform: normalizedPlatform,
                isActive: true,
                lastSeen: new Date(),
                lastUsed: new Date(),
            },
        },
        { upsert: true, new: true }
    );

    res.status(200).json(new ApiResponse(200, tokenDoc, 'Device token registered successfully.'));
});

// POST /api/device-tokens/unregister
export const unregisterToken = asyncHandler(async (req, res) => {
    const { fcmToken } = req.body;
    const { recipientId, recipientType } = resolveRecipientContext(req);

    if (fcmToken) {
        await DeviceToken.deleteMany({ fcmToken });
    } else if (recipientId) {
        await DeviceToken.deleteMany({ recipientId, recipientType });
    }

    res.status(200).json(new ApiResponse(200, null, 'Device token unregistered and deleted successfully.'));
});
