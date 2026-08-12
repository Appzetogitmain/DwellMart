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

