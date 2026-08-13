/**
 * Structured logger with redaction.
 *
 * Two problems this exists to solve:
 *
 *   1. `requestId` middleware has always assigned a correlation id and set the
 *      X-Request-ID header, but nothing ever put that id into a log line — so a
 *      customer report could not be traced to the requests behind it.
 *
 *   2. Several call sites logged whole objects. `checkout.controller.js` logged
 *      the entire cart validation result, which carries the customer's items;
 *      the webhook handler logged gateway payloads. Log aggregation is a
 *      long-lived, widely-readable store, so anything sensitive that reaches it
 *      is effectively published.
 *
 * Output is JSON when `LOG_FORMAT=json` (for aggregation) and human-readable
 * otherwise, so local development is unaffected.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const configuredLevel = () => {
    const raw = String(process.env.LOG_LEVEL || '').toLowerCase();
    if (raw in LEVELS) return LEVELS[raw];
    return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
        ? LEVELS.info
        : LEVELS.debug;
};

const asJson = () => String(process.env.LOG_FORMAT || '').toLowerCase() === 'json';

/**
 * Keys whose values must never be logged.
 *
 * Secrets, credentials and direct personal identifiers. Matched
 * case-insensitively on the key, so `cashfreeSecretKey` and `secret_key` are
 * both caught.
 */
const REDACTED_KEYS = [
    'password', 'newpassword', 'currentpassword', 'confirmpassword',
    'token', 'accesstoken', 'refreshtoken', 'apikey', 'apikeyhash',
    'secret', 'secretkey', 'clientsecret', 'webhooksecret',
    'cashfreesecretkey', 'authorization', 'cookie',
    'otp', 'deliveryotphash', 'deliveryotpdebug',
    'accountnumber', 'ifsc', 'ifsccode', 'upiid',
    'phone', 'email', 'address', 'shippingaddress', 'guestinfo',
    'aadhar', 'aadhaar', 'drivinglicense', 'pan',
];

const shouldRedact = (key) => {
    const k = String(key).toLowerCase().replace(/[^a-z]/g, '');
    return REDACTED_KEYS.some((r) => k === r || k.endsWith(r));
};

/**
 * Recursively replace sensitive values with a marker.
 * Depth-bounded: a deeply nested or cyclic object must not hang the logger.
 */
export const redact = (value, depth = 0) => {
    if (depth > 6) return '[depth-limit]';
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
        // Bounded: logging a 500-item cart is a payload problem, not a record.
        return value.slice(0, 20).map((v) => redact(v, depth + 1));
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = shouldRedact(k) ? '[redacted]' : redact(v, depth + 1);
        }
        return out;
    }
    return value;
};

const emit = (level, message, context = {}) => {
    if (LEVELS[level] > configuredLevel()) return;

    const safeContext = redact(context);
    const record = {
        level,
        message: String(message),
        timestamp: new Date().toISOString(),
        ...safeContext,
    };

    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

    if (asJson()) {
        sink(JSON.stringify(record));
        return;
    }

    const requestId = safeContext.requestId ? ` [${safeContext.requestId}]` : '';
    const extras = Object.keys(safeContext).filter((k) => k !== 'requestId');
    const suffix = extras.length ? ` ${JSON.stringify(Object.fromEntries(extras.map((k) => [k, safeContext[k]])))}` : '';
    sink(`${level.toUpperCase()}${requestId} ${message}${suffix}`);
};

export const logger = {
    error: (message, context) => emit('error', message, context),
    warn: (message, context) => emit('warn', message, context),
    info: (message, context) => emit('info', message, context),
    debug: (message, context) => emit('debug', message, context),

    /**
     * Bind a request's correlation id so every line from that request can be
     * tied together, and to the reference shown on a customer's error screen.
     */
    forRequest: (req) => {
        const requestId = req?.requestId || null;
        const bind = (level) => (message, context = {}) =>
            emit(level, message, { requestId, ...context });
        return {
            error: bind('error'),
            warn: bind('warn'),
            info: bind('info'),
            debug: bind('debug'),
        };
    },
};

export default logger;
