/**
 * Shipping data policy.
 *
 * Whether a NEW product must carry measured parcel data before it can be
 * created. Deliberately OFF by default and Settings-backed, for two reasons:
 *
 *   1. Requiring it immediately would make the existing catalogue uneditable —
 *      a vendor opening a five-year-old product to change its price would be
 *      forced to go and weigh it first.
 *   2. It only becomes reasonable once the admin missing-shipping report shows
 *      coverage is high, and that is an operational judgement rather than a
 *      deploy-time one.
 *
 * `vendorCapabilities.requiredFields` was the obvious place for this, but that
 * array is declared and enforced nowhere in the codebase — adding a value to it
 * would have looked like a policy change while doing nothing at all. This
 * module is wired into the create path instead, and tested in both states.
 *
 * Quick Commerce is exempt unconditionally. A rider-delivered product is never
 * declared to a courier, and forcing a dark-store operator to measure a bread
 * loaf for a courier that will never carry it is a tax on the wrong people.
 */

import Settings from '../../models/Settings.model.js';
import { SHIPPING_SETTINGS_KEY } from './unbookedOrderAlerts.service.js';
import { VendorChannels } from '../../constants/vendorChannels.js';

/**
 * Is measured shipping data mandatory for newly created products?
 * @returns {Promise<boolean>} false unless an operator has switched it on
 */
export const isShippingRequiredForNewProducts = async () => {
    try {
        const doc = await Settings.findOne({ key: SHIPPING_SETTINGS_KEY }).lean();
        return doc?.value?.requireShippingOnNewProducts === true;
    } catch {
        // A settings read failure must never block product creation.
        return false;
    }
};

/**
 * Does this product need parcel data at all?
 *
 * Only products that can actually reach a courier. A Quick-Commerce-only
 * product never does.
 */
export const isCourierEligibleWorkspace = (workspace) =>
    workspace === VendorChannels.RETAIL || workspace === VendorChannels.WHOLESALE;

/** Has a usable weight actually been supplied? */
export const hasMeasuredShipping = (shipping) => Number(shipping?.weight) > 0;

/**
 * Enforce the policy for one product creation.
 *
 * @param {object} payload  the product being created
 * @param {string} workspace the vendor workspace the request was made in
 * @throws {Error} when the policy is on and the data is absent
 */
export const assertShippingPolicy = async (payload, workspace) => {
    if (!isCourierEligibleWorkspace(workspace)) return;
    if (!(await isShippingRequiredForNewProducts())) return;
    if (hasMeasuredShipping(payload?.shipping)) return;

    const error = new Error(
        'A shipping weight is required for new retail and wholesale products. ' +
        'Enter the weight (and ideally the dimensions) in the Shipping section.'
    );
    error.statusCode = 400;
    throw error;
};

export default {
    isShippingRequiredForNewProducts,
    isCourierEligibleWorkspace,
    hasMeasuredShipping,
    assertShippingPolicy,
};
