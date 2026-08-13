import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import PickupLocation from '../../../models/PickupLocation.model.js';

/**
 * Vendor pickup locations.
 *
 * Every handler is scoped to `req.user.id` — a vendor can only ever read or
 * mutate their own locations, and the id is taken from the token rather than
 * the request body.
 */

/**
 * Promote one location to default inside a transaction, demoting any other.
 * A partial unique index enforces the invariant at the database level; this
 * keeps the write ordered so the index never rejects a legitimate change.
 */
const setDefaultWithin = async (session, vendorId, locationId) => {
    await PickupLocation.updateMany(
        { vendorId, _id: { $ne: locationId }, isDefault: true },
        { $set: { isDefault: false } },
        { session }
    );
    await PickupLocation.updateOne({ _id: locationId, vendorId }, { $set: { isDefault: true } }, { session });
};

// GET /api/vendor/pickup-locations
export const listPickupLocations = asyncHandler(async (req, res) => {
    const locations = await PickupLocation.find({ vendorId: req.user.id })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean();

    res.status(200).json(new ApiResponse(200, { locations, total: locations.length }, 'Pickup locations fetched.'));
});

// POST /api/vendor/pickup-locations
export const createPickupLocation = asyncHandler(async (req, res) => {
    const { name, address = {}, phone, email, operatingHours, isDefault } = req.body;

    if (!String(name || '').trim()) {
        throw new ApiError(400, 'A location name is required.');
    }
    if (!String(address?.city || '').trim() || !String(address?.zipCode || '').trim()) {
        throw new ApiError(400, 'City and postal code are required for a pickup location.');
    }

    const existingCount = await PickupLocation.countDocuments({ vendorId: req.user.id });
    // The first location a vendor creates is their default — otherwise nothing
    // is deliverable-from until they remember to set one.
    const shouldBeDefault = isDefault === true || existingCount === 0;

    const session = await mongoose.startSession();
    let created = null;
    try {
        await session.withTransaction(async () => {
            const [doc] = await PickupLocation.create([{
                vendorId: req.user.id,
                name: String(name).trim(),
                address: {
                    street: address.street || '',
                    city: address.city || '',
                    state: address.state || '',
                    zipCode: address.zipCode || '',
                    country: address.country || 'India',
                },
                phone: phone || '',
                email: email || '',
                isActive: true,
                isDefault: false, // promoted below so the index is never violated
                ...(operatingHours ? { operatingHours } : {}),
            }], { session });

            if (shouldBeDefault) await setDefaultWithin(session, req.user.id, doc._id);
            created = doc;
        });
    } finally {
        await session.endSession();
    }

    const fresh = await PickupLocation.findById(created._id).lean();
    res.status(201).json(new ApiResponse(201, fresh, 'Pickup location created.'));
});

// PUT /api/vendor/pickup-locations/:id
export const updatePickupLocation = asyncHandler(async (req, res) => {
    const { name, address, phone, email, operatingHours, isActive, isDefault } = req.body;

    const location = await PickupLocation.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!location) throw new ApiError(404, 'Pickup location not found.');

    if (name !== undefined) location.name = String(name).trim();
    if (phone !== undefined) location.phone = phone;
    if (email !== undefined) location.email = email;
    if (operatingHours !== undefined) location.operatingHours = operatingHours;
    if (address !== undefined) {
        location.address = {
            street: address.street ?? location.address?.street ?? '',
            city: address.city ?? location.address?.city ?? '',
            state: address.state ?? location.address?.state ?? '',
            zipCode: address.zipCode ?? location.address?.zipCode ?? '',
            country: address.country ?? location.address?.country ?? 'India',
        };
    }

    // A vendor must not be able to deactivate their only active location and be
    // left with nowhere to fulfil from.
    if (isActive === false && location.isActive) {
        const otherActive = await PickupLocation.countDocuments({
            vendorId: req.user.id,
            _id: { $ne: location._id },
            isActive: true,
        });
        if (otherActive === 0) {
            throw new ApiError(400, 'You must keep at least one active pickup location.');
        }
        location.isActive = false;
        location.isDefault = false;
    } else if (isActive === true) {
        location.isActive = true;
    }

    await location.save();

    if (isDefault === true) {
        if (!location.isActive) {
            throw new ApiError(400, 'An inactive location cannot be the default.');
        }
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await setDefaultWithin(session, req.user.id, location._id);
            });
        } finally {
            await session.endSession();
        }
    }

    const fresh = await PickupLocation.findById(location._id).lean();
    res.status(200).json(new ApiResponse(200, fresh, 'Pickup location updated.'));
});

// PATCH /api/vendor/pickup-locations/:id/default
export const setDefaultPickupLocation = asyncHandler(async (req, res) => {
    const location = await PickupLocation.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!location) throw new ApiError(404, 'Pickup location not found.');
    if (!location.isActive) throw new ApiError(400, 'An inactive location cannot be the default.');

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await setDefaultWithin(session, req.user.id, location._id);
        });
    } finally {
        await session.endSession();
    }

    const fresh = await PickupLocation.findById(location._id).lean();
    res.status(200).json(new ApiResponse(200, fresh, 'Default pickup location updated.'));
});

// DELETE /api/vendor/pickup-locations/:id
export const deletePickupLocation = asyncHandler(async (req, res) => {
    const location = await PickupLocation.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!location) throw new ApiError(404, 'Pickup location not found.');

    const remaining = await PickupLocation.countDocuments({
        vendorId: req.user.id,
        _id: { $ne: location._id },
    });
    if (remaining === 0) {
        throw new ApiError(400, 'You must keep at least one pickup location.');
    }

    const wasDefault = location.isDefault;
    await PickupLocation.deleteOne({ _id: location._id, vendorId: req.user.id });

    // Never leave a vendor with no default.
    if (wasDefault) {
        const next = await PickupLocation.findOne({ vendorId: req.user.id, isActive: true }).sort({ createdAt: 1 });
        if (next) await PickupLocation.updateOne({ _id: next._id }, { $set: { isDefault: true } });
    }

    res.status(200).json(new ApiResponse(200, null, 'Pickup location deleted.'));
});

/**
 * POST /api/vendor/pickup-locations/import
 *
 * One-time migration path for locations a vendor created while the screen was
 * localStorage-only. Without this their existing configuration is silently
 * discarded the moment the real API ships.
 */
export const importPickupLocations = asyncHandler(async (req, res) => {
    const incoming = Array.isArray(req.body?.locations) ? req.body.locations : [];
    if (incoming.length === 0) {
        throw new ApiError(400, 'No locations supplied for import.');
    }

    const existingCount = await PickupLocation.countDocuments({ vendorId: req.user.id });
    if (existingCount > 0) {
        // Importing over server-side data would duplicate or overwrite it.
        return res.status(200).json(
            new ApiResponse(200, { imported: 0, skipped: incoming.length }, 'Pickup locations already exist; import skipped.')
        );
    }

    const docs = incoming.slice(0, 50).map((loc, index) => ({
        vendorId: req.user.id,
        name: String(loc?.name || `Location ${index + 1}`).trim(),
        address: {
            street: loc?.address?.street || '',
            city: loc?.address?.city || '',
            state: loc?.address?.state || '',
            zipCode: loc?.address?.zipCode || '',
            country: loc?.address?.country && loc.address.country !== 'USA' ? loc.address.country : 'India',
        },
        phone: loc?.phone || '',
        email: loc?.email || '',
        isActive: loc?.isActive !== false,
        isDefault: false,
        ...(loc?.operatingHours ? { operatingHours: loc.operatingHours } : {}),
    }));

    const created = await PickupLocation.insertMany(docs);
    if (created.length > 0) {
        await PickupLocation.updateOne({ _id: created[0]._id }, { $set: { isDefault: true } });
    }

    res.status(201).json(new ApiResponse(201, { imported: created.length }, 'Pickup locations imported.'));
});
