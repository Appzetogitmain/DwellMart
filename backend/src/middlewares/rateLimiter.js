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

// OTP resend limiter
export const otpLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: { success: false, message: 'Too many OTP requests, please wait a minute.' },
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

