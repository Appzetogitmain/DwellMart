/**
 * Vendor Eligibility Helper
 * Centralized utility for checking if a vendor can receive orders,
 * browse catalog items, or operate on the platform.
 */

export const ACTIVE_VENDOR_STATUSES = ['approved'];

/**
 * Check if a vendor model or plain vendor object is eligible to take orders.
 * @param {Object} vendor 
 * @returns {boolean}
 */
export const isVendorEligibleForOrders = (vendor) => {
    if (!vendor) return false;
    return ACTIVE_VENDOR_STATUSES.includes(vendor.status);
};

/**
 * Get human-readable and specific reason why a vendor is not eligible.
 * @param {Object} vendor 
 * @param {string} [productName]
 * @returns {string}
 */
export const getVendorIneligibleReason = (vendor, productName = '') => {
    const prefix = productName ? `${productName}: ` : '';
    if (!vendor) {
        return `${prefix}seller account no longer exists.`;
    }

    switch (vendor.status) {
        case 'pending':
            return `${prefix}seller account is awaiting approval.`;
        case 'suspended':
            return `${prefix}seller account has been suspended.`;
        case 'rejected':
            return `${prefix}seller account has been rejected.`;
        default:
            return `${prefix}seller account is currently inactive.`;
    }
};
