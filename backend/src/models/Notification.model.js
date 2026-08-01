import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        recipientType: { type: String, enum: ['user', 'vendor', 'delivery', 'admin'], required: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: {
            type: String,
            enum: ['order', 'payment', 'system', 'promotion', 'bulk_order'],
            default: 'system',
        },
        isRead: { type: Boolean, default: false, index: true },
        /**
         * Operational urgency.
         *
         * Marketplace notifications are informational; a Quick Commerce
         * new-order alert is operational — minutes matter. `urgent` is what the
         * vendor UI keys off to make an alert persistent and audible, and what
         * the escalation sweep looks for.
         *
         * Defaults to `normal`, so every existing notification is unchanged.
         */
        priority: {
            type: String,
            enum: ['normal', 'urgent'],
            default: 'normal',
            index: true,
        },
        /**
         * Explicit acknowledgement, distinct from `isRead`.
         *
         * `isRead` means "the list was opened"; acknowledgement means "a human
         * accepted responsibility for this". Only the latter can safely stop an
         * escalation.
         */
        acknowledgedAt: { type: Date },
        escalatedAt: { type: Date },
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
