import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Route imports
import publicRoutes from './routes/public.routes.js';
import quickCommerceRoutes from './routes/quickCommerce.routes.js';
import { subscriptionRouter } from './routes/subscription.routes.js';
import userRoutes from './modules/user/routes/user.routes.js';
import adminRoutes from './modules/admin/routes/admin.routes.js';
import vendorRoutes from './modules/vendor/routes/vendor.routes.js';
import deliveryRoutes from './modules/delivery/routes/delivery.routes.js';
import integrationRoutes from './modules/integrations/routes/integration.routes.js';
import translationRoutes from './routes/translationRoutes.js';
import supportRoutes from './routes/support.routes.js';
import bulkUploadRoutes from './routes/bulkUpload.routes.js';
import paymentRouter from './routes/payment.routes.js';
import notificationRoutes from './modules/notifications/routes/notification.routes.js';
import deviceTokenRoutes from './modules/notifications/routes/deviceToken.routes.js';

// Config imports
import { getTransactionSupport } from './config/db.js';
import { collectEnvViolations } from './config/env.js';

// Middleware imports
import requestIdMiddleware from './middlewares/requestId.js';
import { apiLimiter } from './middlewares/rateLimiter.js';
import { resolveExperience } from './middlewares/resolveExperience.js';
import errorHandler from './middlewares/errorHandler.js';
import notFound from './middlewares/notFound.js';

const app = express();
app.use(requestIdMiddleware);
app.set('trust proxy', 1);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../uploads');
const deliveryDocsRoot = path.resolve(uploadsRoot, 'delivery-docs');

const isValidDeliveryDocToken = (relativePath, rawToken) => {
    if (!rawToken) return false;
    const [expRaw, providedSignature] = String(rawToken).split('.');
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= Date.now() || !providedSignature) return false;

    // Read the secret lazily and with no literal fallback. A hardcoded default
    // here would be a known key for signing access to rider Aadhaar and licence
    // documents. Absent secret => deny, never a guessable signature.
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('CONFIG_VIOLATION key=JWT_SECRET reason="required to verify delivery document tokens"');
        return false;
    }

    const payload = `${relativePath}|${exp}`;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    if (providedSignature.length !== expectedSignature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature));
};

// ─── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(mongoSanitize());
/**
 * CORS allowlist.
 *
 * Driven by `CORS_ALLOWED_ORIGINS` (comma-separated) so an environment can be
 * changed without a deploy. The previous list hardcoded a Vercel preview
 * domain, which stayed trusted in production indefinitely.
 *
 * Localhost origins are only trusted outside production.
 */
const IS_PRODUCTION_ENV = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const allowedOrigins = [
    process.env.CLIENT_URL,
    ...String(process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ...(IS_PRODUCTION_ENV
        ? []
        : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001']),
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

// Compress JSON responses to reduce payload transfer time.
app.use(compression());

// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    },
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Rate Limiting ───────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Shopping Experience Resolution ──────────────────────────────────────────
app.use('/api', resolveExperience);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.status(200).send('API running');
});

app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
    });
});

/**
 * Readiness probe — distinct from liveness above.
 *
 * `/health` answers "is the process up". `/ready` answers "can this instance
 * serve traffic correctly", which additionally requires a live database and a
 * topology that supports transactions. A load balancer should drain on this,
 * not on `/health`.
 *
 * Deliberately reports no connection strings, secrets or violation details —
 * only counts and states — because it is reachable without authentication.
 */
app.get('/ready', async (req, res) => {
    const dbState = mongoose.connection?.readyState;
    const dbConnected = dbState === 1;

    let transactions = 'unknown';
    if (dbConnected) {
        try {
            const support = await getTransactionSupport();
            transactions = support.supportsTransactions ? 'supported' : 'unsupported';
        } catch {
            transactions = 'unknown';
        }
    }

    const configViolations = collectEnvViolations().length;
    const ready = dbConnected && transactions === 'supported' && configViolations === 0;

    res.status(ready ? 200 : 503).json({
        success: ready,
        db: dbConnected ? 'connected' : 'disconnected',
        transactions,
        configViolations,
        timestamp: new Date().toISOString(),
    });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use(
    '/uploads/delivery-docs',
    (req, res, next) => {
        const relativePath = `/uploads/delivery-docs${req.path}`;
        const token = req.query.docToken;
        if (!isValidDeliveryDocToken(relativePath, token)) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        next();
    },
    express.static(deliveryDocsRoot, { fallthrough: false })
);

/**
 * Directories under /uploads that are NEVER publicly served.
 *
 *   delivery-docs — rider Aadhaar and driving licences. Reachable only through
 *                   the signed, expiring token route registered above.
 *   tmp           — the staging area for files on their way to Cloudinary.
 *                   Serving it turned an uploaded file into a live URL on this
 *                   origin, which is the payload half of the stored-XSS chain
 *                   (the other half was the client-controlled file extension,
 *                   now fixed in middlewares/upload.js).
 */
const PRIVATE_UPLOAD_DIRS = ['/delivery-docs/', '/tmp/'];

app.use(
    '/uploads',
    (req, res, next) => {
        if (PRIVATE_UPLOAD_DIRS.some((dir) => req.path.startsWith(dir))) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        next();
    },
    express.static(uploadsRoot, {
        // Never let a stored file be interpreted as a script or document by the
        // browser. Defence in depth behind the extension and content checks.
        setHeaders: (res) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
        },
    })
);
app.use('/api/payments', paymentRouter);
app.use('/api/products', bulkUploadRoutes);
app.use('/api/quick', quickCommerceRoutes);
app.use('/api', publicRoutes);
app.use('/api/subscription', subscriptionRouter);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/v1/translate', translationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/device-tokens', deviceTokenRoutes);
app.use('/api/support', supportRoutes);

// ─── Error Handling ──────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
