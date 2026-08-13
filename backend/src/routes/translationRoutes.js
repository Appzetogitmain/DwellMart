import express from 'express';
import { translateText, translateBatch, translateObject } from '../controllers/translationController.js';
import { translationLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router();

// Deliberately public — the storefront translates for anonymous visitors — but
// rate limited, because these endpoints call a metered Google Cloud Translate
// key and previously had no ceiling beyond the global API limiter.
router.post('/', translationLimiter, translateText);
router.post('/batch', translationLimiter, translateBatch);
router.post('/object', translationLimiter, translateObject);

export default router;
