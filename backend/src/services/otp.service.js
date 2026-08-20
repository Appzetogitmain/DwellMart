/**
 * OTP generation and delivery.
 *
 * ONE code, ONE record, MANY channels
 * ───────────────────────────────────
 * WhatsApp and email carry the *same* generated code against the *same* stored
 * record. Generating a second code per channel would mean the two disagree and
 * only the last write verifies — the classic "the code you texted me doesn't
 * work" failure. Channel selection therefore happens strictly after generation
 * and never touches the stored value.
 *
 * Purposes
 * ────────
 * Two purposes exist and they persist to DIFFERENT fields, because the reset
 * flow has its own verified-then-consume state machine that account
 * verification does not:
 *
 *   VERIFICATION   -> otp / otpExpiry
 *   PASSWORD_RESET -> resetOtp / resetOtpExpiry (+ resetOtpVerified)
 *
 * Both are generated, expired and delivered here, so there is a single place
 * where "how long is a code good for" and "where does a code go" are decided.
 * Password reset previously inlined this in three controllers and seeded its
 * code from `Math.random()`, which is not a cryptographic source.
 *
 * Five minutes, deliberately
 * ──────────────────────────
 * The approved WhatsApp template `otp_temp` carries a five-minute validity
 * period: if WhatsApp cannot DELIVER within five minutes the message is
 * discarded upstream. A backend window longer than that would leave a code
 * technically valid long after its carrier gave up on it, so the two are held
 * equal on purpose. Delivery gaps are covered by email fallback and by an
 * explicit user-initiated resend — never by widening the window.
 */

import crypto from 'crypto';
import { sendEmail } from './email.service.js';
import whatsappConfig from '../config/whatsapp.js';
import { sendOtpMessage } from './whatsapp/whatsapp.client.js';
import { isValidE164, maskPhone } from '../utils/phone.js';

/** Kept equal to the `otp_temp` template validity. See the module note. */
export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const OTP_EXPIRY_MINUTES = OTP_EXPIRY_MS / 60000;

export const OtpPurpose = Object.freeze({
    VERIFICATION: 'verification',
    PASSWORD_RESET: 'password_reset',
});

export const OtpChannel = Object.freeze({
    WHATSAPP: 'whatsapp',
    EMAIL: 'email',
    NONE: 'none',
});

const isTruthy = (value) => ['true', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

// ─── Mock OTP (non-production only) ────────────────────────────────────────────

const isMockOTPEnabled = () => process.env.NODE_ENV !== 'production' && isTruthy(process.env.USE_MOCK_OTP);

const getMockOTP = () => {
    const mockOTP = String(process.env.MOCK_OTP || '').trim();
    if (!/^\d{6}$/.test(mockOTP)) {
        throw new Error('MOCK_OTP must be a 6-digit code when USE_MOCK_OTP=true');
    }
    return mockOTP;
};

export const isMockOTP = (otp) => isMockOTPEnabled() && String(otp || '').trim() === getMockOTP();

export const isOTPMatch = (savedOTP, submittedOTP) => (
    isMockOTP(submittedOTP) || String(savedOTP || '') === String(submittedOTP || '').trim()
);

// ─── Generation ────────────────────────────────────────────────────────────────

/**
 * A six-digit code from a cryptographic source.
 *
 * `crypto.randomInt` rather than `Math.random()`: the reset flow used the
 * latter, which is seeded predictably and is not safe for a credential that
 * grants a password change.
 */
const generateCode = () => (
    isMockOTPEnabled() ? getMockOTP() : crypto.randomInt(100000, 999999).toString()
);

// ─── Channel Eligibility ───────────────────────────────────────────────────────

/**
 * Decide whether this recipient may receive THIS purpose over WhatsApp.
 *
 * Registration and login verification accept an unverified number: sending the
 * code is precisely how that number becomes verified, so requiring verification
 * first would be circular.
 *
 * Password reset does not. A code that grants a password change must never go
 * to a number nobody has proven belongs to the account — otherwise a stale or
 * mistyped number entered at signup becomes an account-takeover path.
 *
 * @returns {{eligible: boolean, reason: string|null}}
 */
export const resolveWhatsAppEligibility = (recipient, purpose) => {
    if (!whatsappConfig.otpEnabled) {
        return { eligible: false, reason: whatsappConfig.unavailableReason() || 'channel_disabled' };
    }
    if (!isValidE164(recipient?.phoneE164)) {
        return { eligible: false, reason: 'no_valid_phone' };
    }
    if (purpose === OtpPurpose.PASSWORD_RESET && recipient?.phoneVerified !== true) {
        return { eligible: false, reason: 'phone_not_verified' };
    }
    return { eligible: true, reason: null };
};

// ─── Delivery ──────────────────────────────────────────────────────────────────

const emailSubject = (purpose) => (
    purpose === OtpPurpose.PASSWORD_RESET ? 'Password reset OTP' : 'Your verification code'
);

const emailBody = (purpose, code) => {
    const label = purpose === OtpPurpose.PASSWORD_RESET ? 'password reset OTP' : 'verification code';
    return {
        text: `Your ${label} is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
        html: `<p>Your ${label} is <strong>${code}</strong>. It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>`,
    };
};

const deliverEmail = async (recipient, purpose, code) => {
    if (!recipient?.email) return false;
    const body = emailBody(purpose, code);
    await sendEmail({
        to: recipient.email,
        subject: emailSubject(purpose),
        text: body.text,
        html: body.html,
    });
    return true;
};

/**
 * Should email be sent even when WhatsApp already succeeded?
 *
 * During rollout: yes. WhatsApp drops an undelivered message after five
 * minutes and, without the delivery webhook wired, nothing tells us it
 * happened. Email costs nothing and closes that hole. Turn off once delivery
 * receipts are live.
 */
const dualDeliveryEnabled = () => isTruthy(process.env.WHATSAPP_OTP_DUAL_DELIVERY ?? 'true');

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate, persist and deliver an OTP.
 *
 * Never throws on a delivery failure. An authentication flow that 500s because
 * an SMTP host or a WhatsApp vendor is unwell is a worse outage than a code
 * the user can request again, so every channel error is contained and reported
 * through the return value instead.
 *
 * @param {object} recipient  Mongoose User/Vendor/DeliveryBoy document
 * @param {string} type       purpose label, retained for logging
 * @param {object} [options]
 * @param {string} [options.purpose] OtpPurpose — defaults to VERIFICATION
 * @returns {Promise<{otp: string, channel: string, whatsappAttempted: boolean,
 *                    emailSent: boolean, failureReason: string|null}>}
 */
export const sendOTP = async (recipient, type = 'verification', options = {}) => {
    const purpose = options.purpose === OtpPurpose.PASSWORD_RESET
        ? OtpPurpose.PASSWORD_RESET
        : OtpPurpose.VERIFICATION;

    /**
     * Suppress the email copy entirely.
     *
     * Proving a phone number requires that the code could ONLY have arrived on
     * that phone. With the rollout's dual delivery on, the same code also lands
     * in the inbox, so verifying it proves nothing about the handset — someone
     * with email access alone would otherwise be able to mark an arbitrary
     * number as verified, and password reset trusts that flag.
     */
    const whatsappOnly = options.whatsappOnly === true;

    const code = generateCode();
    const expiry = new Date(Date.now() + OTP_EXPIRY_MS);

    // ONE record. Both channels verify against this and nothing else.
    if (purpose === OtpPurpose.PASSWORD_RESET) {
        recipient.resetOtp = code;
        recipient.resetOtpExpiry = expiry;
        recipient.resetOtpVerified = false;
    } else {
        recipient.otp = code;
        recipient.otpExpiry = expiry;
    }

    await recipient.save({ validateBeforeSave: false });

    if (isMockOTPEnabled()) {
        console.log(`[OTP] Mock ${type} OTP enabled (purpose=${purpose}).`);
        return {
            otp: code, channel: OtpChannel.EMAIL, whatsappAttempted: false,
            emailSent: false, failureReason: null,
        };
    }

    let channel = OtpChannel.NONE;
    let whatsappAttempted = false;
    let failureReason = null;

    // ── WhatsApp first, when this recipient and purpose allow it ──────────────
    const eligibility = resolveWhatsAppEligibility(recipient, purpose);
    if (eligibility.eligible) {
        whatsappAttempted = true;
        try {
            const result = await sendOtpMessage({
                phoneE164: recipient.phoneE164,
                code,
                callbackData: `otp_${purpose}_${recipient._id ?? ''}`,
            });
            if (result?.sent) channel = OtpChannel.WHATSAPP;
        } catch (err) {
            // Never rethrown: email is the fallback, and it is attempted below.
            failureReason = err?.reason || 'whatsapp_error';
            console.warn(
                `[OTP] WhatsApp delivery failed (purpose=${purpose}, `
                + `to=${maskPhone(recipient.phoneE164)}, reason=${failureReason})`
            );
        }
    } else {
        failureReason = eligibility.reason;
    }

    // ── Email: the fallback, and the rollout safety net ───────────────────────
    const shouldEmail = !whatsappOnly && (channel !== OtpChannel.WHATSAPP || dualDeliveryEnabled());
    let emailSent = false;

    if (shouldEmail) {
        try {
            emailSent = await deliverEmail(recipient, purpose, code);
            if (emailSent && channel === OtpChannel.NONE) channel = OtpChannel.EMAIL;
        } catch (err) {
            console.warn(`[OTP] Email delivery failed (purpose=${purpose}): ${err.message}`);
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[OTP] ${type} OTP generated but undeliverable (purpose=${purpose}).`);
            }
        }
    }

    /**
     * What this code can PROVE when it comes back verified.
     *
     * 'whatsapp' only when WhatsApp was the sole carrier — that is the single
     * case in which possession of the code demonstrates possession of the
     * number. Anything else proves only that the account holder read one of
     * their own channels.
     */
    const provenance = (channel === OtpChannel.WHATSAPP && !emailSent)
        ? OtpChannel.WHATSAPP
        : channel;

    if (purpose === OtpPurpose.VERIFICATION) {
        recipient.otpDeliveredVia = provenance;
        await recipient.save({ validateBeforeSave: false });
    }

    return { otp: code, channel, provenance, whatsappAttempted, emailSent, failureReason };
};

/**
 * Generate and deliver a PASSWORD RESET OTP.
 *
 * A thin, explicit wrapper so a call site cannot land on the reset path by
 * forgetting an options object — the two purposes write different fields and
 * enforce different WhatsApp rules.
 */
export const sendPhoneVerificationOTP = async (recipient) => (
    sendOTP(recipient, 'phone_verification', { purpose: OtpPurpose.VERIFICATION, whatsappOnly: true })
);

/**
 * Generate and deliver a PASSWORD RESET OTP.
 *
 * A thin, explicit wrapper so a call site cannot land on the reset path by
 * forgetting an options object — the two purposes write different fields and
 * enforce different WhatsApp rules.
 */
export const sendResetOTP = async (recipient, type = 'password_reset') => (
    sendOTP(recipient, type, { purpose: OtpPurpose.PASSWORD_RESET })
);

export default {
    sendOTP,
    sendResetOTP,
    sendPhoneVerificationOTP,
    isMockOTP,
    isOTPMatch,
    resolveWhatsAppEligibility,
    OtpPurpose,
    OtpChannel,
    OTP_EXPIRY_MS,
    OTP_EXPIRY_MINUTES,
};
