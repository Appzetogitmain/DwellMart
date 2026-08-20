import rateLimit from 'express-rate-limit';

// General API rate limiter (increased limits to allow smooth browsing & polling across all 4 modules)
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 1500 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
});

// Auth endpoints limiter (increased to prevent lockouts during active usage/testing)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 30 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts, please try again in 15 minutes.' },
});

/**
 * Withdrawal creation limiter.
 *
 * Separate from `apiLimiter` because a money-moving endpoint needs a far
 * tighter ceiling than general browsing. Layered under, not instead of, the
 * per-rider daily velocity cap enforced in the withdrawal service — this bounds
 * automated hammering, that bounds a compromised account.
 */
export const withdrawalLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: process.env.NODE_ENV === 'production' ? 10 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many withdrawal attempts. Please try again later.' },
});

// OTP resend limiter (per IP)
export const otpLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: { success: false, message: 'Too many OTP requests, please wait a minute.' },
});

/**
 * OTP limiter keyed on the ACCOUNT rather than the caller's IP.
 *
 * `otpLimiter` bounds one client hammering the endpoint. It does not bound the
 * case that matters once OTPs cost money: a distributed caller, or simply a
 * user behind a rotating mobile IP, requesting codes for the same account over
 * and over. Every one of those is a billed WhatsApp message and a fresh code
 * that invalidates the last one the real user is mid-way through typing.
 *
 * Layered UNDER the per-IP limiter, never instead of it — the two bound
 * different abuses and both apply.
 *
 * Keyed on the submitted email because that is what every OTP endpoint
 * receives; the phone is not supplied by the caller and cannot be trusted as a
 * key even where it is. Falls back to the IP when no identifier is present, so
 * a malformed request cannot slip past unbounded.
 */
export const otpPerAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 5 : 50,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // OTP endpoints identify the account by email OR by mobile number
        // depending on the flow — vendor and delivery registration are
        // phone-first. Keying on only one of them silently degrades this
        // limiter into a second per-IP limiter for the other half.
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (email) return `otp:email:${email}`;

        const phone = String(req.body?.phone || '').replace(/\D/g, '');
        if (phone) return `otp:phone:${phone.slice(-10)}`;

        return `otp-ip:${req.ip}`;
    },
    // A rejected request must not consume the account's budget for a code it
    // never received.
    skipFailedRequests: true,
    message: {
        success: false,
        message: 'Too many verification codes requested for this account. Please wait 15 minutes or use the code already sent to you.',
    },
});

/**
 * Translation limiter.
 *
 * `/api/v1/translate` is public and unauthenticated by design — the storefront
 * translates before a visitor logs in — but it is backed by a metered Google
 * Cloud Translate key, so the only thing standing between an anonymous caller
 * and an unbounded bill is this limit.
 */
export const translationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 60 : 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many translation requests, please slow down.' },
});

/**
 * Coupon validation limiter — bounds code brute-forcing against a public
 * endpoint that reveals whether a code is valid.
 */
export const couponValidateLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 30 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many coupon attempts. Please try again later.' },
});

/** Public write endpoints (contact, feedback) — bounds spam row creation. */
export const publicWriteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 10 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many submissions. Please try again later.' },
});

/**
 * Pincode deliverability lookups.
 *
 * Every miss fans out to DTDC, who rate-limit us. Generous enough that a
 * customer correcting a typo several times is never blocked, tight enough that
 * the endpoint cannot be used to enumerate the postal network on our quota.
 * Most requests are cache hits and never reach the carrier at all.
 */
export const deliverabilityLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 60 : 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many delivery checks. Please try again in a few minutes.' },
});
