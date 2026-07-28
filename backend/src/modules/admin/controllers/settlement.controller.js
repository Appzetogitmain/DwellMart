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

    const settlement = await Settlement.findById(id);
    if (!settlement) {
        throw new ApiError(404, 'Settlement not found.');
    }

    if (settlement.status !== 'pending') {
        throw new ApiError(400, `Cannot approve settlement with status '${settlement.status}'.`);
    }

    // Mark settlement as completed
    settlement.status = 'completed';
    // If Admin passed in a transactionId (e.g. from a manual bank transfer)
    if (req.body.transactionId) {
        settlement.transactionId = req.body.transactionId;
    }
    await settlement.save();

    // Update associated commissions to 'paid'
    await Commission.updateMany(
        { _id: { $in: settlement.commissionIds } },
        { $set: { status: 'paid', paidAt: new Date() } }
    );

    // Notify the vendor
    const vendor = await Vendor.findById(settlement.vendorId);
    if (vendor) {
        const message = `Your payout request of ₹${settlement.amount} has been approved and processed!`;
        
        await createNotification({
            recipientId: vendor._id,
            recipientType: 'vendor',
            title: 'Payout Approved',
            message,
            type: 'system',
        });

        try {
            await sendEmail({
                to: vendor.email,
                subject: 'Payout Approved',
                text: message,
                html: `<p>${message}</p>`,
            });
        } catch (err) {
            console.warn(`Vendor payout email failed for ${vendor.email}: ${err.message}`);
        }
    }

    res.status(200).json(new ApiResponse(200, settlement, 'Settlement approved successfully.'));
});
