import rateLimit from 'express-rate-limit';

const buildKey = (req) => {
    const clientId = String(req.headers['x-client-id'] || 'anonymous').trim();
    return `${clientId}:${req.ip}`;
};

const createLimiter = ({ windowMs, max, message }) => rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: buildKey,
    message: { success: false, message },
});

export const integrationReadRateLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 600 : 5000,
    message: 'Too many integration read requests. Please retry shortly.',
});

export const integrationWriteRateLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 300 : 2000,
    message: 'Too many integration write requests. Please retry shortly.',
});
