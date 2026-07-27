import mongoose from 'mongoose';

export const SUPPORT_REASONS_MAP = {
    customer: [
        'ORDER_ISSUE',
        'PAYMENT',
        'REFUND',
        'ACCOUNT',
        'DELIVERY',
        'RETURN',
        'TECHNICAL',
        'OTHER',
    ],
    vendor: [
        'PRODUCT',
        'SUBSCRIPTION',
        'SETTLEMENT',
        'COMMISSION',
        'VERIFICATION',
        'TECHNICAL',
        'OTHER',
    ],
    delivery: [
        'ASSIGNMENT',
        'COD',
        'PAYMENT',
        'ROUTE',
        'TECHNICAL',
        'OTHER',
    ],
};

const ALL_REASONS = Array.from(
    new Set([
        ...SUPPORT_REASONS_MAP.customer,
        ...SUPPORT_REASONS_MAP.vendor,
        ...SUPPORT_REASONS_MAP.delivery,
    ])
);

const supportConversationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: 'userModel',
        },
        userRole: {
            type: String,
            required: true,
            enum: ['customer', 'vendor', 'delivery'],
            index: true,
        },
        userModel: {
            type: String,
            required: true,
            enum: ['User', 'Vendor', 'DeliveryBoy'],
        },
        reason: {
            type: String,
            required: true,
            enum: ALL_REASONS,
            index: true,
        },
        description: {
            type: String,
            default: '',
            trim: true,
        },
        status: {
            type: String,
            enum: ['open', 'in_progress', 'resolved', 'closed'],
            default: 'open',
            index: true,
        },
        lastMessage: {
            type: String,
            default: '',
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        unreadAdmin: {
            type: Number,
            default: 0,
        },
        unreadUser: {
            type: Number,
            default: 0,
        },
        isClosed: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    { timestamps: true }
);

// Compound indexes for optimized querying
supportConversationSchema.index({ user: 1, userRole: 1, status: 1 });
supportConversationSchema.index({ status: 1, userRole: 1 });
supportConversationSchema.index({ user: 1, reason: 1, status: 1 });

const SupportConversation = mongoose.model('SupportConversation', supportConversationSchema);
export default SupportConversation;
