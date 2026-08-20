/**
 * Indian postal code (PIN) format.
 *
 * One definition, imported by the address validator, the order validator, the
 * serviceability service and the customer-facing lookup. A regex copied into
 * four files is four chances for them to disagree about what a valid pincode
 * is — and the one that disagrees is the one an attacker uses.
 *
 * WHAT THIS DOES AND DOES NOT CATCH
 * ─────────────────────────────────
 * Format only. `452101` is a perfectly well-formed pincode that does not exist
 * in the postal network, and this regex accepts it — as it should, because
 * "does this pincode exist and can the courier reach it" is a question only the
 * carrier can answer. That check lives in the serviceability layer.
 *
 * The job here is narrower and still necessary: before this existed the address
 * validator was `Joi.string().min(3).max(12)`, which accepted `HELLO`, `ABC`
 * and `<script>` into a field that gets printed on a shipping label.
 */

/**
 * Six digits, first digit 1–9.
 *
 * India has no pincode beginning with 0 — the leading digit is the postal
 * region (1 = Delhi/Haryana/Punjab … 8 = Bihar/Jharkhand, 9 = Army Post
 * Office), so a leading zero is always a typo or a fabrication.
 */
export const INDIAN_PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

export const PINCODE_LENGTH = 6;

/** Message shown to a customer. Names the rule rather than restating the regex. */
export const PINCODE_ERROR_MESSAGE = 'Enter a valid 6-digit pincode.';

/**
 * @param {*} value
 * @returns {boolean} true when the value is a well-formed Indian pincode
 */
export const isValidPincode = (value) =>
    INDIAN_PINCODE_PATTERN.test(String(value ?? '').trim());

/**
 * Strip everything that is not a digit and cap at six.
 *
 * Used by the input handler so a customer pasting "452 001" or "PIN-452001"
 * ends up with something usable rather than an error, and by the API so a
 * stray space does not fail an otherwise valid address.
 *
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
