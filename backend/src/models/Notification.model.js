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
        data: { type: Map, of: String }, // extra metadata
    },
    { timestamps: true }
);

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
