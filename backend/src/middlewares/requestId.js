import crypto from 'crypto';

/**
 * Middleware that assigns a unique requestId (Correlation ID) to every incoming request.
 * Attaches req.requestId and sets the X-Request-ID header on responses.
 */
export const requestIdMiddleware = (req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomBytes(4).toString('hex');
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
};

export default requestIdMiddleware;
