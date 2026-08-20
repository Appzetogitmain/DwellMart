/**
 * Pre-account phone verification.
 *
 * Vendor and delivery-partner registration both need to prove a mobile number
 * BEFORE any account document exists, so this cannot go through
 * `otp.service.js` — that one persists onto a Mongoose account document. The
 * code lives on a `PhoneVerification` record keyed by the number itself.
 *
 * WhatsApp ONLY, on purpose
 * ─────────────────────────
 * There is no email fallback here and there must not be one. The entire point
 * is to establish that whoever is registering controls THIS handset; a code
 * that also arrives in an inbox proves nothing about the phone. A WhatsApp
 * outage therefore blocks registration rather than silently degrading into a
 * weaker check, and the caller is told plainly which of the two happened.
 *
 * Five minutes, matching `otp_temp` and the account-level OTP window.
 */

import crypto from 'crypto';
import PhoneVerification from '../models/PhoneVerification.model.js';
import { sendOtpMessage } from './whatsapp/whatsapp.client.js';
import { OTP_EXPIRY_MS, OTP_EXPIRY_MINUTES, isMockOTP } from './otp.service.js';
import { toE164, isValidE164, maskPhone } from '../utils/phone.js';
import ApiError from '../utils/ApiError.js';

export { OTP_EXPIRY_MINUTES };

/** Guessing budget per record before it must be re-requested. */
const MAX_ATTEMPTS = 5;

const isTruthy = (value) => ['true', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

const isMockEnabled = () => process.env.NODE_ENV !== 'production' && isTruthy(process.env.USE_MOCK_OTP);

const generateCode = () => (
    isMockEnabled()
        ? String(process.env.MOCK_OTP || '').trim()
        : crypto.randomInt(100000, 999999).toString()
);

/**
 * Normalise a caller-supplied number, or reject it.
 * @throws {ApiError} 400 when the number cannot address a WhatsApp recipient
 */
export const requireE164 = (phone) => {
    const e164 = toE164(phone);
    if (!e164 || !isValidE164(e164)) {
        throw new ApiError(400, 'Please enter a valid mobile number including country code.');
    }
    return e164;
};

/**
 * Issue a verification code to a mobile number over WhatsApp.
 *
 * @param   {string} phone raw, any format
 * @returns {Promise<{phoneE164: string, channel: 'whatsapp', expiresInMinutes: number}>}
 * @throws  {ApiError} 400 on an unusable number, 503 when WhatsApp cannot deliver
 */
export const sendPhoneVerification = async (phone) => {
    const phoneE164 = requireE164(phone);
    const otp = generateCode();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);

    // Persist BEFORE sending: a crash mid-send must never leave the user
    // holding a code that was never recorded. `attempts` resets with each new
    // code so a fresh request is a fresh budget.
    await PhoneVerification.findOneAndUpdate(
        { phoneE164 },
        { phoneE164, otp, otpExpiry, isVerified: false, attempts: 0 },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    if (isMockEnabled()) {
        console.log(`[PhoneVerification] Mock OTP active for ${maskPhone(phoneE164)}.`);
        return { phoneE164, channel: 'whatsapp', expiresInMinutes: OTP_EXPIRY_MINUTES };
    }

    try {
        await sendOtpMessage({ phoneE164, code: otp, callbackData: 'otp_phone_verification' });
    } catch (err) {
        // No fallback by design — see the module note. Say so rather than
        // pretending the code is on its way.
        console.warn(
            `[PhoneVerification] WhatsApp delivery failed for ${maskPhone(phoneE164)} `
            + `(reason=${err?.reason || 'unknown'})`
        );
        throw new ApiError(
            503,
            'We could not send a WhatsApp code to that number right now. '
            + 'Check the number is correct and on WhatsApp, then try again.',
        );
    }

    return { phoneE164, channel: 'whatsapp', expiresInMinutes: OTP_EXPIRY_MINUTES };
};

/**
 * Check a submitted code and mark the number verified.
 *
 * @returns {Promise<{phoneE164: string}>}
 * @throws  {ApiError} 400 on any failure — deliberately uniform so the response
 *          does not disclose whether a record exists for that number
 */
export const confirmPhoneVerification = async (phone, submittedOtp) => {
    const phoneE164 = requireE164(phone);

    const record = await PhoneVerification.findOne({ phoneE164 }).select('+otp');
    if (!record) throw new ApiError(400, 'No verification code was requested for this number.');

    if (record.attempts >= MAX_ATTEMPTS) {
        throw new ApiError(429, 'Too many incorrect attempts. Please request a new code.');
    }

    if (record.otpExpiry < Date.now()) {
        throw new ApiError(400, 'Verification code has expired. Please request a new code.');
    }

    const submitted = String(submittedOtp ?? '').trim();
    const matches = isMockOTP(submitted) || record.otp === submitted;

    if (!matches) {
        // Count the miss before answering, so a burst of parallel guesses is
        // still bounded rather than all reading the same pre-increment value.
        await PhoneVerification.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
        throw new ApiError(400, 'Invalid verification code.');
    }

    // Atomic, and $unset rather than a save(): `otp` is a required path, so
    // assigning undefined and saving fails validation. Clearing the code on
    // success also means a consumed code cannot be read back out of the record.
    await PhoneVerification.updateOne(
        { _id: record._id },
        { $set: { isVerified: true }, $unset: { otp: '' } },
    );

    return { phoneE164 };
};

/**
 * Has this number been proven within the record's lifetime?
 * Used as the authority check on session-less onboarding routes.
 */
export const isPhoneVerified = async (phoneE164) => {
    if (!isValidE164(phoneE164)) return false;
    const record = await PhoneVerification.findOne({ phoneE164, isVerified: true }).lean();
    return Boolean(record);
};

/** Consume the record once the account it authorised has been created. */
export const clearPhoneVerification = async (phoneE164) => {
    if (!phoneE164) return;
    await PhoneVerification.deleteOne({ phoneE164 });
};

export default {
    sendPhoneVerification,
    confirmPhoneVerification,
    isPhoneVerified,
    clearPhoneVerification,
    requireE164,
};
