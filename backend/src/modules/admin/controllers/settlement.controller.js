import asyncHandler from '../../../utils/asyncHandler.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import Settlement from '../../../models/Settlement.model.js';
import Commission from '../../../models/Commission.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendEmail } from '../../../services/email.service.js';

// GET /api/admin/settlements
export const getSettlements = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status = 'all' } = req.query;
    const numericPage = Math.max(1, parseInt(page, 10) || 1);
    const numericLimit = Math.max(1, parseInt(limit, 10) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (status && status !== 'all') {
        filter.status = status;
    }

    const [settlements, total] = await Promise.all([
        Settlement.find(filter)
            .populate('vendorId', 'name email storeName bankDetails')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Settlement.countDocuments(filter)
    ]);

    res.status(200).json(
        new ApiResponse(
            200,
            {
                settlements,
                total,
                page: numericPage,
                pages: Math.ceil(total / numericLimit)
            },
            'Settlements fetched successfully.'
        )
    );
});

// PUT /api/admin/settlements/:id/approve
export const approveSettlement = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { transactionId } = req.body;

    const settlement = await Settlement.findById(id);
    if (!settlement) {
        throw new ApiError(404, 'Settlement not found.');
    }

    if (settlement.status !== 'pending') {
        throw new ApiError(400, `Cannot approve settlement with status '${settlement.status}'.`);
    }

    const utr = String(transactionId || '').trim();
    if (!utr || utr.length < 3) {
        throw new ApiError(400, 'Bank UTR / Transaction Reference ID is required to approve payout.');
    }

    // Mark settlement as completed
    settlement.status = 'completed';
    settlement.approvedAt = new Date();
    settlement.transactionId = utr;
    await settlement.save();

    // Update associated commissions to 'paid'
    await Commission.updateMany(
        { _id: { $in: settlement.commissionIds } },
        { $set: { status: 'paid', paidAt: new Date() } }
    );

    // Notify the vendor
    const vendor = await Vendor.findById(settlement.vendorId);
    if (vendor) {
        const utrNote = settlement.transactionId ? ` (UTR Ref: ${settlement.transactionId})` : '';
        const message = `Your payout request of ₹${settlement.amount} has been approved and processed${utrNote}!`;
        
        await createNotification({
            recipientId: vendor._id,
            recipientType: 'vendor',
            title: 'Payout Approved',
            message,
            type: 'system',
        }).catch((err) => console.warn(`Vendor notification warning: ${err.message}`));

        try {
            await sendEmail({
                to: vendor.email,
                subject: 'Payout Approved & Processed',
                text: message,
                html: `<p>${message}</p>`,
            });
        } catch (err) {
            console.warn(`Vendor payout email failed for ${vendor.email}: ${err.message}`);
        }
    }

    res.status(200).json(new ApiResponse(200, settlement, 'Settlement approved successfully.'));
});

// PUT /api/admin/settlements/:id/reject
export const rejectSettlement = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    const rejectionReason = String(reason || '').trim();
    if (!rejectionReason || rejectionReason.length < 3) {
        throw new ApiError(400, 'Rejection reason is required (at least 3 characters).');
    }

    const settlement = await Settlement.findById(id);
    if (!settlement) {
        throw new ApiError(404, 'Settlement not found.');
    }

    if (settlement.status !== 'pending') {
        throw new ApiError(400, `Cannot reject settlement with status '${settlement.status}'.`);
    }

    // Mark settlement as rejected
    settlement.status = 'rejected';
    settlement.rejectionReason = rejectionReason;
    settlement.rejectedAt = new Date();
    await settlement.save();

    // Revert associated commissions back to 'pending' so funds become withdrawable again!
    await Commission.updateMany(
        { _id: { $in: settlement.commissionIds } },
        { $set: { status: 'pending', settlementId: null } }
    );

    // Notify the vendor
    const vendor = await Vendor.findById(settlement.vendorId);
    if (vendor) {
        const message = `Your payout request of ₹${settlement.amount} was rejected. Reason: ${rejectionReason}`;
        
        await createNotification({
            recipientId: vendor._id,
            recipientType: 'vendor',
            title: 'Payout Request Rejected',
            message,
            type: 'system',
        }).catch((err) => console.warn(`Vendor notification warning: ${err.message}`));

        try {
            await sendEmail({
                to: vendor.email,
                subject: 'Payout Request Rejected',
                text: message,
                html: `<p>${message}</p>`,
            });
        } catch (err) {
            console.warn(`Vendor payout email failed for ${vendor.email}: ${err.message}`);
        }
    }

    res.status(200).json(new ApiResponse(200, settlement, 'Settlement rejected successfully. Funds returned to vendor withdrawable balance.'));
});
