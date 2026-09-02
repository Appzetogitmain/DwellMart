import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Admin from '../../../models/Admin.model.js';
import { generateTokens } from '../../../utils/generateToken.js';
import { calculateSidebarModules } from '../../../constants/permissions.js';
import {
    clearRefreshSession,
    decodeRefreshTokenOrThrow,
    persistRefreshSession,
    rotateRefreshSession,
} from '../../../services/refreshToken.service.js';

// POST /api/admin/auth/login
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const admin = await Admin.findOne({ email: normalizedEmail }).select('+password');
    if (!admin) throw new ApiError(401, 'Invalid credentials.');

    // Enforce Active status
    if (admin.status === 'inactive' || !admin.isActive) {
        throw new ApiError(403, 'Your account has been disabled.');
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) throw new ApiError(401, 'Invalid credentials.');

    admin.lastLoginAt = new Date();
    await admin.save({ validateBeforeSave: false });

    const role = admin.role || 'subadmin';
    const permissions = Array.isArray(admin.permissions) ? admin.permissions : [];
    const sidebarModules = calculateSidebarModules(role, permissions);

    const tokenRole = role === 'superadmin' ? 'superadmin' : 'admin';
    const { accessToken, refreshToken } = generateTokens({ id: admin._id, role: tokenRole, email: admin.email });
    await persistRefreshSession(admin, refreshToken);

    res.status(200).json(
        new ApiResponse(
            200,
            {
                accessToken,
                refreshToken,
                admin: {
                    id: admin._id,
                    _id: admin._id,
                    name: admin.name,
                    email: admin.email,
                    phone: admin.phone || '',
                    role: admin.role,
                    status: admin.status || 'active',
                    permissions,
                    sidebarModules,
                    avatar: admin.avatar || '',
                    lastLoginAt: admin.lastLoginAt,
                },
                permissions,
                sidebarModules,
            },
            'Admin login successful.'
        )
    );
});

// POST /api/admin/auth/refresh
export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    const admin = await Admin.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt isActive status role permissions');

    if (!admin) throw new ApiError(401, 'Invalid refresh token.');
    if (admin.status === 'inactive' || !admin.isActive) {
        throw new ApiError(403, 'Your account has been disabled.');
    }

    const payloadRole = admin.role === 'superadmin' ? 'superadmin' : 'admin';
    const tokens = await rotateRefreshSession(
        admin,
        { id: admin._id, role: payloadRole, email: admin.email },
        refreshToken
    );

    return res.status(200).json(new ApiResponse(200, tokens, 'Session refreshed successfully.'));
});

// POST /api/admin/auth/logout
export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        try {
            const decoded = decodeRefreshTokenOrThrow(refreshToken);
            const admin = await Admin.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt');
            if (admin?.refreshTokenHash) {
                await clearRefreshSession(admin);
            }
        } catch {
            // Keep logout idempotent.
        }
    }

    return res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

// GET /api/admin/auth/profile
export const getProfile = asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.user.id);
    if (!admin) throw new ApiError(404, 'Admin not found.');

    if (admin.status === 'inactive' || !admin.isActive) {
        throw new ApiError(403, 'Your account has been disabled.');
    }

    const role = admin.role || 'subadmin';
    const permissions = Array.isArray(admin.permissions) ? admin.permissions : [];
    const sidebarModules = calculateSidebarModules(role, permissions);

    res.status(200).json(
        new ApiResponse(
            200,
            {
                ...admin.toObject({ virtuals: true }),
                sidebarModules,
            },
            'Profile fetched.'
        )
    );
});

// PUT /api/admin/auth/change-password
export const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.user.id;

    const admin = await Admin.findById(adminId).select('+password +refreshTokenHash +refreshTokenExpiresAt');
    if (!admin) throw new ApiError(404, 'Admin not found.');

    if (admin.status === 'inactive' || !admin.isActive) {
        throw new ApiError(403, 'Your account has been disabled.');
    }

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
        throw new ApiError(400, 'Current password is incorrect.');
    }

    const isSame = await admin.comparePassword(newPassword);
    if (isSame) {
        throw new ApiError(400, 'New password must be different from your current password.');
    }

    admin.password = newPassword;
    await admin.save();

    // Invalidate existing refresh tokens so other stale sessions expire
    await clearRefreshSession(admin);

    res.status(200).json(
        new ApiResponse(200, null, 'Password changed successfully.')
    );
});
