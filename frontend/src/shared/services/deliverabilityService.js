import api from '../utils/api';
import { normalizePincode, isValidPincode, PINCODE_ERROR_MESSAGE } from '../utils/pincode';

const memoryCache = new Map();

/**
 * Check if a pincode is deliverable and whether COD is available.
 * 
 * @param {string} pincode 
 * @param {object} [options]
 * @param {string} [options.vendorId]
 * @param {string} [options.paymentMethod]
 * @returns {Promise<{
 *   status: 'deliverable'|'not_deliverable'|'unverified'|'invalid_format',
 *   deliverable: boolean,
 *   blocking: boolean,
 *   codAvailable: boolean|null,
 *   city: string|null,
 *   state: string|null,
 *   message: string|null
 * }>}
 */
export const checkPincodeDeliverability = async (pincode, options = {}) => {
  const normalized = normalizePincode(pincode);

  if (!isValidPincode(normalized)) {
    return {
      status: 'invalid_format',
      deliverable: false,
      blocking: true,
      codAvailable: null,
      city: null,
      state: null,
      message: PINCODE_ERROR_MESSAGE,
    };
  }

  const { vendorId, paymentMethod } = options;
  const cacheKey = `${normalized}:${vendorId || ''}:${paymentMethod || ''}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  try {
    const params = { pincode: normalized };
    if (vendorId) params.vendorId = vendorId;
    if (paymentMethod) params.paymentMethod = paymentMethod;

    const response = await api.get('/deliverability', { params });
    const verdict = response?.data?.data || response?.data || response;
    memoryCache.set(cacheKey, verdict);
    return verdict;
  } catch (error) {
    // If request fails due to network, return unverified (non-blocking)
    const fallback = {
      status: 'unverified',
      deliverable: true,
      blocking: false,
      codAvailable: null,
      city: null,
      state: null,
      message: 'Could not verify delivery with courier right now. You can proceed and we will confirm before dispatch.',
    };
    return fallback;
  }
};
