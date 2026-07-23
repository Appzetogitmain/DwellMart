import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Route imports
import publicRoutes from './routes/public.routes.js';
import {
    subscriptionRouter,
    stripeWebhookRouter,
    razorpayWebhookRouter,
} from './routes/subscription.routes.js';
import userRoutes from './modules/user/routes/user.routes.js';
import adminRoutes from './modules/admin/routes/admin.routes.js';
import vendorRoutes from './modules/vendor/routes/vendor.routes.js';
import deliveryRoutes from './modules/delivery/routes/delivery.routes.js';
import integrationRoutes from './modules/integrations/routes/integration.routes.js';
import translationRoutes from './routes/translationRoutes.js';

// Middleware imports
import { apiLimiter } from './middlewares/rateLimiter.js';
import errorHandler from './middlewares/errorHandler.js';
import notFound from './middlewares/notFound.js';

const app = express();
app.set('trust proxy', 1);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../uploads');
const deliveryDocsRoot = path.resolve(uploadsRoot, 'delivery-docs');
const stripeWebhookPaths = [
    '/api/webhooks/stripe',
    '/api/subscription/webhooks/stripe',
];
const razorpayWebhookPaths = [
    '/api/webhooks/razorpay',
    '/api/subscription/webhooks/razorpay',
];

const isValidDeliveryDocToken = (relativePath, rawToken) => {
    if (!rawToken) return false;
    const [expRaw, providedSignature] = String(rawToken).split('.');
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= Date.now() || !providedSignature) return false;

    const payload = `${relativePath}|${exp}`;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'delivery-doc-secret')
        .update(payload)
        .digest('hex');

    if (providedSignature.length !== expectedSignature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature));
};

// ─── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(mongoSanitize());
const allowedOrigins = [
    process.env.CLIENT_URL,
    'https://dwell-mart-3u11.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:3001'
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
app.use(stripeWebhookPaths, express.raw({ type: 'application/json' }), stripeWebhookRouter);
app.use(razorpayWebhookPaths, express.raw({ type: 'application/json' }), razorpayWebhookRouter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate Limiting ───────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

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

app.use(
    '/uploads',
    (req, res, next) => {
        if (req.path.startsWith('/delivery-docs/')) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        next();
    },
    express.static(uploadsRoot)
);
app.use('/api', publicRoutes);            // Public: products, categories, brands, coupons, banners
app.use('/api/subscription', subscriptionRouter);
app.use('/api/user', userRoutes);         // Customer: auth, addresses, wishlist, reviews, orders
app.use('/api/admin', adminRoutes);       // Admin: auth, vendors, orders, catalog, analytics
app.use('/api/vendor', vendorRoutes);     // Vendor: auth, products, orders, earnings
app.use('/api/delivery', deliveryRoutes); // Delivery: auth, orders
app.use('/api/integrations', integrationRoutes); // Partner Integrations: delivery provider APIs
app.use('/api/v1/translate', translationRoutes); // Public Translation

// ─── Error Handling ──────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
