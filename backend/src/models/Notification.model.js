import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        recipientType: { type: String, enum: ['user', 'vendor', 'delivery', 'admin'], required: true, index: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        body: { type: String },
        image: { type: String },
        category: {
            type: String,
            enum: [
                'SUCCESS',
                'INFO',
                'WARNING',
                'ERROR',
                'PROMOTION',
                'SYSTEM',
                'ORDER',
                'PAYMENT',
                'RETURN',
                'REFUND',
                'SETTLEMENT',
                'DELIVERY',
                'SUPPORT',
                'MARKETING',
            ],
            default: 'SYSTEM',
            index: true,
        },
        type: {
            type: String,
            enum: ['order', 'payment', 'system', 'promotion', 'bulk_order', 'return', 'refund', 'settlement', 'delivery', 'support', 'vendor_approval', 'test_push', 'welcome_test'],
            default: 'system',
        },
        priority: {
            type: String,
            enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL', 'normal', 'urgent'],
            default: 'NORMAL',
            index: true,
        },
        actionUrl: { type: String },
        actionType: { type: String },
        isRead: { type: Boolean, default: false, index: true },
        readAt: { type: Date },
        deliveredAt: { type: Date },
        clickedAt: { type: Date },
        acknowledgedAt: { type: Date },
        escalatedAt: { type: Date },
        metadata: { type: mongoose.Schema.Types.Mixed },
        data: { type: Map, of: String }, // extra metadata
    },
    { timestamps: true }
);

// Backs the escalation sweep: unacknowledged urgent alerts, oldest first.
notificationSchema.index({ priority: 1, acknowledgedAt: 1, createdAt: 1 });
// PERF-5: Recipient inbox query — the most frequent read pattern.
// Supports: GET /notifications?recipientId=X&recipientType=Y&isRead=false
notificationSchema.index({ recipientId: 1, recipientType: 1, isRead: 1, createdAt: -1 });
// Supports type-filtered queries (e.g. urgent order alerts by type)
notificationSchema.index({ recipientId: 1, type: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
