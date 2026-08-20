/**
 * Indian postal code (PIN) format and normalization helpers.
 */

export const INDIAN_PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

export const PINCODE_LENGTH = 6;

export const PINCODE_ERROR_MESSAGE = 'Enter a valid 6-digit pincode.';

/**
 * @param {*} value
 * @returns {boolean} true when the value is a well-formed Indian pincode
 */
export const isValidPincode = (value) =>
  INDIAN_PINCODE_PATTERN.test(String(value ?? '').trim());

/**
 * Strip non-digits and cap at 6 characters.
 * @param {*} value
 * @returns {string}
 */
export const normalizePincode = (value) =>
  String(value ?? '').replace(/\D/g, '').slice(0, PINCODE_LENGTH);

export default {
  INDIAN_PINCODE_PATTERN,
  PINCODE_LENGTH,
  PINCODE_ERROR_MESSAGE,
  isValidPincode,
  normalizePincode,
};
