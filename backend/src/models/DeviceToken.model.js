import mongoose from 'mongoose';

const deviceTokenSchema = new mongoose.Schema(
    {
        recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        recipientType: {
            type: String,
            enum: ['user', 'vendor', 'delivery', 'admin'],
            required: true,
            index: true,
        },
        deviceType: {
            type: String,
            enum: ['web', 'android', 'ios'],
            default: 'web',
        },
        platform: { type: String, default: 'browser' },
        appVersion: { type: String, default: '1.0.0' },
        browser: { type: String },
        fcmToken: { type: String, required: true, unique: true, index: true },
        isActive: { type: Boolean, default: true, index: true },
        lastSeen: { type: Date, default: Date.now },
        lastUsed: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

deviceTokenSchema.index({ recipientId: 1, recipientType: 1, isActive: 1 });

const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);
export default DeviceToken;
