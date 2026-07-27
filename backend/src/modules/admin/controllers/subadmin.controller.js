import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Admin from '../../../models/Admin.model.js';
import AdminActivityLog from '../../../models/AdminActivityLog.model.js';
import { ALL_PERMISSIONS, PERMISSION_DEPENDENCIES } from '../../../constants/permissions.js';

/**
 * Ensures permissions array has all required dependencies automatically included.
 * e.g. If 'orders.update' is present, 'orders.view' is added automatically.
 */
const sanitizePermissionsWithDependencies = (permissions = []) => {
    const permSet = new Set(permissions.filter((p) => ALL_PERMISSIONS.includes(p)));

    // Auto-resolve dependencies
    let changed = true;
    while (changed) {
        changed = false;
        for (const p of Array.from(permSet)) {
            const requiredDep = PERMISSION_DEPENDENCIES[p];
            if (requiredDep && !permSet.has(requiredDep)) {
                permSet.add(requiredDep);
                changed = true;
            }
        }
    }
    return Array.from(permSet);
};

// GET /api/admin/subadmins
export const getAllSubAdmins = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, status, role } = req.query;

    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (status) filter.status = String(status).toLowerCase();
    if (role) filter.role = String(role).toLowerCase();

    if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const [admins, total] = await Promise.all([
        Admin.find(filter)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Admin.countDocuments(filter),
    ]);

    const stats = {
        total,
        superadmins: await Admin.countDocuments({ role: 'superadmin' }),
        subadmins: await Admin.countDocuments({ role: 'subadmin' }),
        active: await Admin.countDocuments({ status: 'active' }),
        inactive: await Admin.countDocuments({ status: 'inactive' }),
    };

    res.status(200).json(
        new ApiResponse(
            200,
            {
                admins,
                stats,
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.ceil(total / numericLimit) || 1,
                },
            },
            'Sub Admins fetched successfully.'
        )
    );
});

// GET /api/admin/subadmins/:id
export const getSubAdminById = asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.params.id).select('-password').lean();
    if (!admin) throw new ApiError(404, 'Admin not found.');

    res.status(200).json(new ApiResponse(200, admin, 'Admin details fetched.'));
});

// POST /api/admin/subadmins
export const createSubAdmin = asyncHandler(async (req, res) => {
    const { name, email, phone, password, role = 'subadmin', status = 'active', permissions = [] } = req.body;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const existing = await Admin.findOne({ email: normalizedEmail });
    if (existing) throw new ApiError(409, 'An admin account with this email already exists.');

    // STRICT SINGLE SUPER ADMIN ENFORCEMENT:
    // Only one Super Admin account can exist in the system.
    if (role === 'superadmin') {
        const superAdminCount = await Admin.countDocuments({ role: 'superadmin' });
        if (superAdminCount >= 1) {
            throw new ApiError(400, 'Only one Super Admin account is allowed in the system. All newly created accounts must be Sub Admins.');
        }
    }

    const targetRole = role === 'superadmin' ? 'superadmin' : 'subadmin';
    const sanitizedPermissions = sanitizePermissionsWithDependencies(permissions);

    const subAdmin = await Admin.create({
        name: String(name || '').trim(),
        email: normalizedEmail,
        password,
        phone: String(phone || '').trim(),
        role: targetRole,
        status: status === 'inactive' ? 'inactive' : 'active',
        isActive: status !== 'inactive',
        permissions: targetRole === 'superadmin' ? ALL_PERMISSIONS : sanitizedPermissions,
    });

    // Audit log
    await AdminActivityLog.create({
        performedBy: req.user.id,
        targetAdmin: subAdmin._id,
        action: 'subadmin_created',
        details: {
            name: subAdmin.name,
            email: subAdmin.email,
            role: subAdmin.role,
            status: subAdmin.status,
            permissions: subAdmin.permissions,
            permissionsCount: subAdmin.permissions.length,
        },
        ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
    });

    const result = subAdmin.toObject();
    delete result.password;

    res.status(201).json(new ApiResponse(201, result, 'Sub Admin created successfully.'));
});

// PUT /api/admin/subadmins/:id
export const updateSubAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, phone, status, permissions } = req.body;

    const admin = await Admin.findById(id);
    if (!admin) throw new ApiError(404, 'Admin not found.');

    // Prevent modifying Super Admin accounts via subadmin management
    if (admin.role === 'superadmin') {
        throw new ApiError(403, 'Super Admin accounts cannot be edited or modified.');
    }

    if (String(admin._id) === String(req.user.id)) {
        throw new ApiError(400, 'You cannot modify your own account permissions or status here.');
    }

    const oldPermissions = admin.permissions || [];
    const sanitizedPermissions = sanitizePermissionsWithDependencies(permissions);
    const addedPermissions = sanitizedPermissions.filter((p) => !oldPermissions.includes(p));
    const removedPermissions = oldPermissions.filter((p) => !sanitizedPermissions.includes(p));

    admin.name = String(name || admin.name).trim();
    if (phone !== undefined) admin.phone = String(phone || '').trim();
    if (status) {
        admin.status = status === 'inactive' ? 'inactive' : 'active';
        admin.isActive = admin.status === 'active';
    }
    admin.permissions = sanitizedPermissions;

    await admin.save();

    // Audit log
    await AdminActivityLog.create({
        performedBy: req.user.id,
        targetAdmin: admin._id,
        action: 'subadmin_updated',
        details: {
            name: admin.name,
            email: admin.email,
            status: admin.status,
            permissions: admin.permissions,
            permissionsCount: admin.permissions.length,
            addedPermissions,
            removedPermissions,
        },
        ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
    });

    const result = admin.toObject();
    delete result.password;

    res.status(200).json(new ApiResponse(200, result, 'Sub Admin updated successfully.'));
});

// PATCH /api/admin/subadmins/:id/status
export const toggleSubAdminStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const admin = await Admin.findById(id);
    if (!admin) throw new ApiError(404, 'Admin not found.');

    if (admin.role === 'superadmin') {
        throw new ApiError(403, 'Super Admin account status cannot be toggled.');
    }

    if (String(admin._id) === String(req.user.id)) {
        throw new ApiError(400, 'You cannot disable your own Super Admin account.');
    }

    admin.status = status === 'inactive' ? 'inactive' : 'active';
    admin.isActive = admin.status === 'active';
    await admin.save();

    await AdminActivityLog.create({
        performedBy: req.user.id,
        targetAdmin: admin._id,
        action: 'status_toggled',
        details: { name: admin.name, email: admin.email, newStatus: admin.status },
        ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
    });

    res.status(200).json(
        new ApiResponse(200, { id: admin._id, status: admin.status }, `Sub Admin status updated to ${admin.status}.`)
    );
});

// POST /api/admin/subadmins/:id/reset-password
export const resetSubAdminPassword = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    const admin = await Admin.findById(id).select('+password');
    if (!admin) throw new ApiError(404, 'Admin not found.');

    if (admin.role === 'superadmin') {
        throw new ApiError(403, 'Super Admin passwords cannot be reset from Sub Admin management.');
    }

    if (String(admin._id) === String(req.user.id)) {
        throw new ApiError(400, 'Please use the profile settings page to change your own password.');
    }

    admin.password = password;
    admin.refreshTokenHash = undefined;
    admin.refreshTokenExpiresAt = undefined;
    await admin.save();

    await AdminActivityLog.create({
        performedBy: req.user.id,
        targetAdmin: admin._id,
        action: 'password_reset',
        details: { name: admin.name, targetEmail: admin.email },
        ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
    });

    res.status(200).json(new ApiResponse(200, null, 'Sub Admin password reset successfully.'));
});

// DELETE /api/admin/subadmins/:id
export const deleteSubAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const admin = await Admin.findById(id);
    if (!admin) throw new ApiError(404, 'Admin not found.');

    if (admin.role === 'superadmin') {
        throw new ApiError(403, 'Super Admin accounts cannot be deleted.');
    }

    if (String(admin._id) === String(req.user.id)) {
        throw new ApiError(400, 'You cannot delete your own Super Admin account.');
    }

    await Admin.findByIdAndDelete(id);

    await AdminActivityLog.create({
        performedBy: req.user.id,
        targetAdmin: admin._id,
        action: 'subadmin_deleted',
        details: { deletedEmail: admin.email, name: admin.name },
        ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
    });

    res.status(200).json(new ApiResponse(200, null, 'Sub Admin deleted successfully.'));
});

// GET /api/admin/subadmins/logs
export const getActivityLogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', action = '', performedBy = '' } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    const filter = {};
    if (action && action !== 'all') {
        filter.action = action;
    }
    if (performedBy && performedBy !== 'all') {
        filter.performedBy = performedBy;
    }

    const allLogsForFiltering = await AdminActivityLog.find(filter)
        .populate('performedBy', 'name email role')
        .populate('targetAdmin', 'name email role')
        .sort({ createdAt: -1 })
        .lean();

    let filtered = allLogsForFiltering;

    if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter((log) => {
            const perfName = log.performedBy?.name?.toLowerCase() || '';
            const perfEmail = log.performedBy?.email?.toLowerCase() || '';
            const targName = log.targetAdmin?.name?.toLowerCase() || '';
            const targEmail = log.targetAdmin?.email?.toLowerCase() || '';
            const deletedEmail = log.details?.deletedEmail?.toLowerCase() || '';
            const detailsStr = JSON.stringify(log.details || {}).toLowerCase();
            return (
                perfName.includes(q) ||
                perfEmail.includes(q) ||
                targName.includes(q) ||
                targEmail.includes(q) ||
                deletedEmail.includes(q) ||
                detailsStr.includes(q)
            );
        });
    }

    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedLogs = filtered.slice(startIndex, startIndex + limitNum);

    // Compute Stats
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const totalLogsCount = await AdminActivityLog.countDocuments({});
    const todayActionsCount = await AdminActivityLog.countDocuments({ createdAt: { $gte: startOfToday } });
    const createdCount = await AdminActivityLog.countDocuments({ action: 'subadmin_created' });
    const updatedCount = await AdminActivityLog.countDocuments({ action: 'subadmin_updated' });
    const deletedCount = await AdminActivityLog.countDocuments({ action: 'subadmin_deleted' });

    res.status(200).json(
        new ApiResponse(
            200,
            {
                logs: paginatedLogs,
                pagination: {
                    totalLogs: totalFiltered,
                    page: pageNum,
                    limit: limitNum,
                    totalPages,
                },
                stats: {
                    totalLogs: totalLogsCount,
                    todayActions: todayActionsCount,
                    createdCount,
                    updatedCount,
                    deletedCount,
                },
            },
            'Activity logs fetched successfully.'
        )
    );
});
