import ApiError from '../utils/ApiError.js';
import Admin from '../models/Admin.model.js';

/**
 * Ensures user is authenticated as Super Admin or Sub Admin
 */
export const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return next(new ApiError(401, 'Authentication required.'));
    }
    const role = String(req.user.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'superadmin' && role !== 'subadmin') {
        return next(new ApiError(403, 'Access denied. Admin role required.'));
    }
    next();
};

/**
 * Enforces Super Admin role only
 */
export const requireSuperAdmin = async (req, res, next) => {
    if (!req.user?.id) {
        return next(new ApiError(401, 'Authentication required.'));
    }
    try {
        const admin = await Admin.findById(req.user.id).select('role status isActive').lean();
        if (!admin) {
            return next(new ApiError(401, 'Admin account not found.'));
        }
        if (admin.status === 'inactive' || !admin.isActive) {
            return next(new ApiError(403, 'Your account has been disabled.'));
        }
        if (admin.role !== 'superadmin') {
            return next(new ApiError(403, 'Access denied. Only Super Admin can access this resource.'));
        }
        next();
    } catch (err) {
        next(err);
    }
};

/**
 * Checks single permission requirement
 */
export const checkPermission = (requiredPermission) => async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return next(new ApiError(401, 'Authentication required.'));
        }

        const admin = await Admin.findById(req.user.id).select('role permissions status isActive').lean();
        if (!admin) {
            return next(new ApiError(401, 'Admin account not found.'));
        }

        if (admin.status === 'inactive' || !admin.isActive) {
            return next(new ApiError(403, 'Your account has been disabled.'));
        }

        // Superadmin bypasses all permission checks
        if (admin.role === 'superadmin') {
            return next();
        }

        const userPermissions = Array.isArray(admin.permissions) ? admin.permissions : [];
        if (!userPermissions.includes(requiredPermission)) {
            return next(
                new ApiError(
                    403,
                    `Access denied. Required permission: ${requiredPermission}`
                )
            );
        }

        next();
    } catch (err) {
        next(err);
    }
};

/**
 * Checks if admin has AT LEAST ONE of the specified permissions
 */
export const checkAnyPermission = (...permissions) => async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return next(new ApiError(401, 'Authentication required.'));
        }

        const admin = await Admin.findById(req.user.id).select('role permissions status isActive').lean();
        if (!admin) {
            return next(new ApiError(401, 'Admin account not found.'));
        }

        if (admin.status === 'inactive' || !admin.isActive) {
            return next(new ApiError(403, 'Your account has been disabled.'));
        }

        if (admin.role === 'superadmin') {
            return next();
        }

        const userPermissions = Array.isArray(admin.permissions) ? admin.permissions : [];
        const hasAny = permissions.some((p) => userPermissions.includes(p));

        if (!hasAny) {
            return next(
                new ApiError(
                    403,
                    `Access denied. Requires at least one permission: ${permissions.join(', ')}`
                )
            );
        }

        next();
    } catch (err) {
        next(err);
    }
};

/**
 * Permission that depends on the settings category being addressed.
 *
 * `GET/PUT /admin/settings/:category` is one route serving every category, so a
 * single token could not express "may manage Quick Commerce settings". The
 * frontend already gated its Quick Commerce settings screen on
 * `quickcommerce.settings.manage` while the API behind it checked only
 * `settings.view` / `settings.edit` — the UI looked restricted and the API was
 * not.
 *
 * Grants access when the admin holds EITHER the category-specific token OR the
 * generic one, so existing grants are unaffected.
 *
 * @param {Record<string,string>} categoryTokens category → extra token
 * @param {string} fallbackToken token accepted for any category
 */
export const checkSettingsCategoryPermission = (categoryTokens, fallbackToken) =>
    async (req, res, next) => {
        try {
            if (!req.user?.id) {
                return next(new ApiError(401, 'Authentication required.'));
            }

            const admin = await Admin.findById(req.user.id)
                .select('role permissions status isActive')
                .lean();
            if (!admin) return next(new ApiError(401, 'Admin account not found.'));
            if (admin.status === 'inactive' || !admin.isActive) {
                return next(new ApiError(403, 'Your account has been disabled.'));
            }
            if (admin.role === 'superadmin') return next();

            const held = new Set(Array.isArray(admin.permissions) ? admin.permissions : []);
            const category = String(req.params?.category || '');
            const categoryToken = categoryTokens[category];

            if (held.has(fallbackToken)) return next();
            if (categoryToken && held.has(categoryToken)) return next();

            const required = categoryToken
                ? `${categoryToken} or ${fallbackToken}`
                : fallbackToken;
            return next(new ApiError(403, `Access denied. Required permission: ${required}`));
        } catch (err) {
            return next(err);
        }
    };

/**
 * Checks if admin has ALL of the specified permissions
 */
export const checkAllPermissions = (...permissions) => async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return next(new ApiError(401, 'Authentication required.'));
        }

        const admin = await Admin.findById(req.user.id).select('role permissions status isActive').lean();
        if (!admin) {
            return next(new ApiError(401, 'Admin account not found.'));
        }

        if (admin.status === 'inactive' || !admin.isActive) {
            return next(new ApiError(403, 'Your account has been disabled.'));
        }

        if (admin.role === 'superadmin') {
            return next();
        }

        const userPermissions = Array.isArray(admin.permissions) ? admin.permissions : [];
        const hasAll = permissions.every((p) => userPermissions.includes(p));

        if (!hasAll) {
            return next(
                new ApiError(
                    403,
                    `Access denied. Required all permissions: ${permissions.join(', ')}`
                )
            );
        }

        next();
    } catch (err) {
        next(err);
    }
};
