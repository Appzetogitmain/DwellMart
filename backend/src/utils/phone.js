/**
 * Phone number normalisation.
 *
 * WhatsApp addresses recipients in E.164 (`+919876543210`). This codebase did
 * not: registration stored `String(phone).replace(/\D/g,'').slice(-10)`, which
 * discards the country code outright. Those stored values cannot address a
 * WhatsApp recipient on their own, so a dial code has to be re-attached, and
 * the only honest source for one is an explicit default rather than a guess
 * buried at the call site.
 *
 * `WHATSAPP_DEFAULT_COUNTRY_CODE` (default `+91`) supplies that dial code for
 * bare national numbers. A value that already carries a `+` is trusted as
 * written and never rewritten — overriding an explicit country code with an
 * assumed one is how a message is delivered to the wrong country.
 */

/** Dial codes accepted without a `+`, longest first so matching is unambiguous. */
const KNOWN_DIAL_CODES = ['971', '966', '977', '880', '94', '92', '91', '65', '60', '44', '1'];

/**
 * National-number lengths for the dial codes we can assert on. Used to tell
 * `919876543210` (a full Indian number) apart from a national number that
 * merely happens to start with `91`.
 */
const NATIONAL_LENGTH = { 91: 10, 1: 10, 44: 10, 971: 9, 65: 8 };

const MIN_E164_DIGITS = 8;
const MAX_E164_DIGITS = 15;

/** The dial code assumed for bare national numbers, digits only, no `+`. */
export const defaultDialCode = () => {
    const digits = String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '+91').replace(/\D/g, '');
    return digits || '91';
};

/**
 * Reduce any stored or user-supplied phone value to E.164.
 *
 * @param   {string} value      raw phone in any format
 * @param   {string} [dialCode] override for the assumed country code
 * @returns {string|null}       `+<digits>`, or null when the value is unusable
 */
export const toE164 = (value, dialCode = null) => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const hadPlus = raw.startsWith('+');

    // Strip an international `00` prefix first: `00919876543210` and
    // `+919876543210` are the same number written two different ways.
    let digits = raw.replace(/\D/g, '').replace(/^00/, '');
    if (!digits) return null;

    // Indian mobile numbers are routinely stored with a trunk `0`.
    if (!hadPlus && digits.length === 11 && digits.startsWith('0')) {
        digits = digits.slice(1);
    }

    const withinBounds = (d) => d.length >= MIN_E164_DIGITS && d.length <= MAX_E164_DIGITS;

    // An explicit `+` is authoritative. Never second-guess it.
    if (hadPlus) return withinBounds(digits) ? `+${digits}` : null;

    // Already carries a recognisable dial code AND is the right total length
    // for that country — otherwise it is a national number that coincidentally
    // starts with those digits.
    const matched = KNOWN_DIAL_CODES.find((code) => digits.startsWith(code));
    if (matched) {
        const expected = NATIONAL_LENGTH[matched];
        if (!expected || digits.length === matched.length + expected) {
            return withinBounds(digits) ? `+${digits}` : null;
        }
    }

    const combined = `${String(dialCode || defaultDialCode()).replace(/\D/g, '')}${digits}`;
    return withinBounds(combined) ? `+${combined}` : null;
};

export const isValidE164 = (value) => /^\+[1-9]\d{7,14}$/.test(String(value ?? '').trim());

/**
 * Split E.164 into the two halves Interakt's API requires.
 *
 * Interakt takes `countryCode` and `phoneNumber` as separate fields and its
 * documentation is explicit that the national part must not repeat the dial
 * code. This split is therefore not cosmetic: passing `+91` alongside
 * `919876543210` produces a message that is accepted and never delivered.
 *
 * @returns {{countryCode: string, phoneNumber: string}|null}
 */
export const splitE164 = (value) => {
    const e164 = toE164(value);
    if (!e164 || !isValidE164(e164)) return null;

    const digits = e164.slice(1);
    const matched = KNOWN_DIAL_CODES.find((code) => digits.startsWith(code));
    if (!matched) return null;

    const national = digits.slice(matched.length);
    if (!national) return null;

    return { countryCode: `+${matched}`, phoneNumber: national };
};

/**
 * Last-four form for operator-facing output.
 *
 * The structured logger already redacts any key named `phone`, but WhatsApp
 * failures are diagnosed by "which number did this go to", so there has to be
 * a form that is safe to write down.
 */
export const maskPhone = (value) => {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (digits.length < 4) return '(none)';
    return `••••${digits.slice(-4)}`;
};


/**
 * Derive both stored representations from one raw user-supplied value.
 *
 * `phone` keeps its existing national-only shape because other subsystems read
 * it directly — the Cashfree client, for one, requires a bare ten-digit Indian
 * number and would break if this started returning E.164. `phoneE164` is
 * derived from the ORIGINAL input, before that truncation, so the country code
 * survives even though `phone` still cannot carry it.
 *
 * @param   {string} raw
 * @returns {{phone: string|null, phoneE164: string|null}}
 */
export const buildPhoneFields = (raw) => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    const national = digits ? digits.slice(-10) : '';
    return {
        phone: national || null,
        phoneE164: toE164(raw),
    };
};

export default { toE164, isValidE164, splitE164, maskPhone, defaultDialCode, buildPhoneFields };
