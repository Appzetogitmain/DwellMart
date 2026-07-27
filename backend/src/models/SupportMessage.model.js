import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
    {
        url: { type: String, required: true },
        filename: { type: String, required: true },
        fileType: { type: String, default: 'image' },
        size: { type: Number, default: 0 },
    },
    { _id: false }
);

const supportMessageSchema = new mongoose.Schema(
    {
        conversation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SupportConversation',
            required: true,
            index: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        senderRole: {
            type: String,
            required: true,
            enum: ['customer', 'vendor', 'delivery', 'admin', 'system'],
            index: true,
        },
        message: {
            type: String,
            default: '',
        },
        attachments: [attachmentSchema],
        messageType: {
            type: String,
            enum: ['text', 'image', 'document', 'system'],
            default: 'text',
        },
        isSystemMessage: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
            default: null,
        },
        edited: {
            type: Boolean,
            default: false,
        },
        deletedFor: [
            {
                type: mongoose.Schema.Types.ObjectId,
            },
        ],
    },
    { timestamps: true }
);

supportMessageSchema.index({ conversation: 1, createdAt: 1 });

const SupportMessage = mongoose.model('SupportMessage', supportMessageSchema);
export default SupportMessage;
