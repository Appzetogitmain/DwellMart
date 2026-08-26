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
        targetVendor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
        },
        action: {
            type: String,
            required: true,
            enum: [
                // Sub-admin management
                'subadmin_created',
                'subadmin_updated',
                'status_toggled',
                'password_reset',
                'subadmin_deleted',
                // Rider wallet & payouts — every action that moves money, or
                // changes where money can go, is recorded here.
                'rider_withdrawal_approved',
                'rider_withdrawal_rejected',
                'rider_withdrawal_paid',
                'rider_withdrawal_failed',
                'rider_wallet_adjusted',
                'rider_wallet_rebuilt',
                'rider_payout_blocked',
                'rider_payout_unblocked',
                'rider_payout_details_verified',
                'rider_rate_card_created',
                'rider_rate_card_superseded',
                'rider_cash_adjusted',
                // Vendor account/channel governance
                'vendor_status_updated',
                'vendor_channel_status_updated',
                'vendor_classification_updated',
                'vendor_quick_commerce_updated',
                'vendor_hard_deleted',
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
adminActivityLogSchema.index({ targetVendor: 1, createdAt: -1 });

const AdminActivityLog = mongoose.model('AdminActivityLog', adminActivityLogSchema);
export default AdminActivityLog;
