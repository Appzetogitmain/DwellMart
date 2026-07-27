import mongoose from 'mongoose';

const adminActivityLogSchema = new mongoose.Schema(
    {
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            required: true,
        },
        targetAdmin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
        },
        action: {
            type: String,
            required: true,
            enum: [
                'subadmin_created',
                'subadmin_updated',
                'status_toggled',
                'password_reset',
                'subadmin_deleted',
            ],
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        ipAddress: {
            type: String,
            default: '',
        },
    },
    { timestamps: true }
);

adminActivityLogSchema.index({ createdAt: -1 });

const AdminActivityLog = mongoose.model('AdminActivityLog', adminActivityLogSchema);
export default AdminActivityLog;
