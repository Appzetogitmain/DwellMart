import ApiError from './ApiError.js';

/**
 * Catalog access scope for bulk import/export.
 *
 * The bulk handlers are mounted three times — under `/api/admin/products`
 * (permission-guarded), `/api/vendor/products` (vendor-guarded) and
 * `/api/products` (authentication only). They previously decided scope with
 * `if (user.role === 'vendor') ... else if (targetVendorId) ...`, which falls
 * through to an UNFILTERED query for every other role. A customer or delivery
 * rider therefore received the entire platform catalogue, including every
 * vendor's email address and cost prices.
 *
 * Scope is resolved here, once, and fails closed: a role that is neither vendor
 * nor admin gets no access at all rather than global access.
 */

const ADMIN_ROLES = new Set(['admin', 'superadmin', 'subadmin']);

/**
 * @param {object} user            req.user
 * @param {string|null} targetVendorId  vendor the caller wants to act on behalf of
 * @returns {{ isAdmin: boolean, vendorId: string|null, crossVendor: boolean }}
 */
export const resolveCatalogScope = (user, targetVendorId = null) => {
    const role = String(user?.role || '').toLowerCase();

    if (role === 'vendor') {
        // A vendor is always pinned to their own catalogue. `targetVendorId` is
        // ignored rather than honoured — accepting it would let one vendor act
        // on another's products.
        return { isAdmin: false, vendorId: String(user.id), crossVendor: false };
    }

    if (ADMIN_ROLES.has(role)) {
        const scoped = targetVendorId ? String(targetVendorId) : null;
        return { isAdmin: true, vendorId: scoped, crossVendor: !scoped };
    }

    throw new ApiError(403, 'You do not have access to catalog import or export.');
};

/**
 * Mongo filter for the resolved scope.
 * `{}` is returned only for an admin who deliberately requested every vendor.
 */
export const catalogScopeFilter = (scope) => (scope.vendorId ? { vendorId: scope.vendorId } : {});

/**
 * Assert the caller may read or mutate a specific import job.
 *
 * `checkJobStatus` and `cancelJobHandler` had no ownership logic whatsoever, so
 * any authenticated user could read another vendor's import progress and cancel
 * their running import.
 */
export const assertJobAccess = (user, jobRecord) => {
    if (!jobRecord) throw new ApiError(404, 'Import job not found.');

    const role = String(user?.role || '').toLowerCase();
    if (ADMIN_ROLES.has(role)) return;

    const isOwningVendor = String(jobRecord.vendorId || '') === String(user?.id || '');
    const isUploader = String(jobRecord.uploadedBy?.id || '') === String(user?.id || '');

    if (!isOwningVendor && !isUploader) {
        // 404 rather than 403: whether a given job id exists is not information
        // an unrelated caller needs.
        throw new ApiError(404, 'Import job not found.');
    }
};
