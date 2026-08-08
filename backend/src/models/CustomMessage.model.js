import mongoose from 'mongoose';

const customMessageSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
        type: {
            type: String,
            enum: ['welcome', 'order', 'promotional', 'reminder'],
            required: true,
            default: 'welcome',
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true,
        },
        category: {
            type: String,
            enum: ['ORDER', 'SYSTEM', 'MARKETING', 'PROMOTION', 'INFO', 'WARNING'],
            default: 'SYSTEM',
        },
        priority: {
            type: String,
            enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
            default: 'NORMAL',
        },
        actionUrl: {
            type: String,
            default: '',
        },
        image: {
            type: String,
            default: '',
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            index: true,
        },
    },
    { timestamps: true }
);

customMessageSchema.index({ type: 1, status: 1 });
customMessageSchema.index({ createdAt: -1 });

const CustomMessage = mongoose.model('CustomMessage', customMessageSchema);
export default CustomMessage;
