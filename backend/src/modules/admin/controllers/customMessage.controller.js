/**
 * Admin Custom Message (Notification Template) Controller
 * Full CRUD for persistent MongoDB-backed notification templates.
 */

import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import CustomMessage from '../../../models/CustomMessage.model.js';

// GET /api/admin/notifications/custom-messages
export const listCustomMessages = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, type, status } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (type && type !== 'all') filter.type = type;
    if (status && status !== 'all') filter.status = status;
    if (search && String(search).trim()) {
        const regex = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ title: regex }, { content: regex }];
    }

    const [messages, total] = await Promise.all([
        CustomMessage.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .populate('createdBy', 'name email')
            .lean(),
        CustomMessage.countDocuments(filter),
    ]);

    res.status(200).json(
        new ApiResponse(200, {
            messages,
            total,
            page: numericPage,
            pages: Math.ceil(total / numericLimit) || 1,
        }, 'Custom messages fetched.')
    );
});

// POST /api/admin/notifications/custom-messages
export const createCustomMessage = asyncHandler(async (req, res) => {
    const { title, content, type, status, category, priority, actionUrl, image, metadata } = req.body;

    if (!title || !content || !type) {
        throw new ApiError(400, 'title, content, and type are required.');
    }

    const message = await CustomMessage.create({
        title: String(title).trim(),
        content: String(content).trim(),
        type,
        status: status || 'active',
        category: category ? String(category).toUpperCase() : 'SYSTEM',
        priority: priority ? String(priority).toUpperCase() : 'NORMAL',
        actionUrl: actionUrl || '',
        image: image || '',
        metadata: metadata || {},
        createdBy: req.user?._id || null,
    });

    res.status(201).json(new ApiResponse(201, message, 'Custom message created.'));
});

// PUT /api/admin/notifications/custom-messages/:id
export const updateCustomMessage = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, content, type, status, category, priority, actionUrl, image, metadata } = req.body;

    const updateFields = {};
    if (title !== undefined) updateFields.title = String(title).trim();
    if (content !== undefined) updateFields.content = String(content).trim();
    if (type !== undefined) updateFields.type = type;
    if (status !== undefined) updateFields.status = status;
    if (category !== undefined) updateFields.category = String(category).toUpperCase();
    if (priority !== undefined) updateFields.priority = String(priority).toUpperCase();
    if (actionUrl !== undefined) updateFields.actionUrl = actionUrl;
    if (image !== undefined) updateFields.image = image;
    if (metadata !== undefined) updateFields.metadata = metadata;

    const message = await CustomMessage.findByIdAndUpdate(
        id,
        { $set: updateFields },
        { new: true, runValidators: true }
    );

    if (!message) throw new ApiError(404, 'Custom message not found.');

    res.status(200).json(new ApiResponse(200, message, 'Custom message updated.'));
});

// DELETE /api/admin/notifications/custom-messages/:id
export const deleteCustomMessage = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const message = await CustomMessage.findByIdAndDelete(id);
    if (!message) throw new ApiError(404, 'Custom message not found.');
    res.status(200).json(new ApiResponse(200, null, 'Custom message deleted.'));
});

// PATCH /api/admin/notifications/custom-messages/:id/toggle
export const toggleCustomMessageStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const message = await CustomMessage.findById(id);
    if (!message) throw new ApiError(404, 'Custom message not found.');

    message.status = message.status === 'active' ? 'inactive' : 'active';
    await message.save();

    res.status(200).json(new ApiResponse(200, message, `Custom message ${message.status}.`));
});
