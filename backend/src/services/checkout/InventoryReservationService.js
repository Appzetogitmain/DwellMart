/**
 * InventoryReservationService
 *
 * Manages the 3-phase stock lifecycle during enterprise checkout:
 *
 *   Phase 1  reserveStock()       — called at createCheckoutSession
 *   Phase 2  commitReservation()  — called inside the MongoDB transaction
 *                                   after payment webhook confirms success
 *   Cleanup  releaseReservation() — called on payment failure / session expiry
 *            sweepExpiredReservations() — cron job for stale holds
 *
 * Fulfillment-type timeouts:
 *   quick_commerce  → 10 minutes  (fast-moving QC inventory)
 *   retail          → 15 minutes
 *   wholesale       → 30 minutes
 *
 * Race condition protection:
 *   reserveStock uses findOneAndUpdate with a conditional $inc that only
 *   succeeds if availableStock (stockQuantity - reservedQuantity) >= quantity.
 *   This is atomic — no window between read and write.
 */

import mongoose from 'mongoose';
import InventoryReservation from '../../models/InventoryReservation.model.js';
import Product from '../../models/Product.model.js';

// ── Timeout constants (in minutes) ────────────────────────────────────────────

const RESERVATION_TTL_MINUTES = {
    quick_commerce: 10,
    retail:         15,
    wholesale:      30,
};

const getExpiresAt = (fulfillmentType) => {
    const minutes = RESERVATION_TTL_MINUTES[fulfillmentType] || 15;
    return new Date(Date.now() + minutes * 60 * 1000);
};

// ── Phase 1: Reserve stock ─────────────────────────────────────────────────────

/**
 * Reserve stock for all items in a cart, per-fulfillment-type timeout.
 *
 * Uses atomic $inc on Product.reservedQuantity with a conditional filter
 * to prevent over-reservation. If ANY product cannot be reserved
 * (insufficient available stock), throws with details.
 *
 * @param {Array}  items         — cart items [{ productId, quantity, fulfillmentType }]
 * @param {string} sessionId     — the CheckoutSession.sessionId
 * @param {Object} [dbSession]   — MongoDB session for transactions (optional)
 * @returns {Promise<InventoryReservation[]>}
 */
export const reserveStock = async (items, sessionId, dbSession = null) => {
    if (!items?.length) throw new Error('No items to reserve.');

    const reservations = [];
    const failures     = [];

    // Process all items. Collect failures rather than aborting on first error
    // so the frontend can show ALL unavailable items at once.
    for (const item of items) {
        const productId      = String(item.productId || item.id || '');
        const quantity       = Number(item.quantity  || 1);
        const fulfillmentType = String(item.fulfillmentType || 'retail').toLowerCase();
        const expiresAt      = getExpiresAt(fulfillmentType);

        // Atomic: only increment reservedQuantity if enough available stock exists.
        // availableStock = stockQuantity - reservedQuantity >= quantity
        const opts = dbSession ? { session: dbSession } : {};
        const updated = await Product.findOneAndUpdate(
            {
                _id: productId,
                $expr: {
                    $gte: [
                        { $subtract: ['$stockQuantity', { $ifNull: ['$reservedQuantity', 0] }] },
                        quantity,
                    ],
                },
            },
            { $inc: { reservedQuantity: quantity } },
            { new: false, ...opts }
        ).lean();

        if (!updated) {
            // Could not reserve — either OOS or insufficient available stock
            const product = await Product.findById(productId).select('name stockQuantity reservedQuantity').lean();
            const available = (product?.stockQuantity || 0) - (product?.reservedQuantity || 0);
            failures.push({
                productId,
                name:      product?.name || 'Unknown',
                requested: quantity,
                available: Math.max(0, available),
            });
            continue;
        }

        // Record the reservation document
        const reservationDoc = {
            sessionId,
            productId: new mongoose.Types.ObjectId(productId),
            vendorId:  updated.vendorId || null,
            quantity,
            fulfillmentType,
            status: 'reserved',
            expiresAt,
        };

        try {
            const [saved] = await InventoryReservation.create([reservationDoc], opts.session ? { session: opts.session } : {});
            reservations.push(saved);
        } catch (err) {
            // Duplicate session+product — already reserved. Idempotent → OK.
            if (err?.code === 11000) {
                reservations.push(reservationDoc);
            } else {
                // Unexpected error — roll back the $inc we just did
                await Product.findByIdAndUpdate(productId, { $inc: { reservedQuantity: -quantity } }, opts);
                failures.push({ productId, name: updated.name || 'Unknown', requested: quantity, available: 0, error: err.message });
            }
        }
    }

    if (failures.length > 0) {
        // Roll back any successful reservations we just made
        await releaseReservation(sessionId);
        const msg = failures
            .map((f) => `${f.name}: requested ${f.requested}, available ${f.available}`)
            .join(' | ');
        const err = new Error(`Stock reservation failed: ${msg}`);
        err.statusCode = 422;
        err.code       = 'INVENTORY_RESERVATION_FAILED';
        err.details    = failures;
        throw err;
    }

    return reservations;
};

// ── Phase 2: Commit reservation ────────────────────────────────────────────────

/**
 * Permanently deduct reserved stock. Called INSIDE the MongoDB transaction
 * after payment is confirmed (webhook success).
 *
 * Converts: reservedQuantity -= qty, stockQuantity -= qty
 * (net effect: reservedQuantity back to 0 for this session, stockQuantity down)
 *
 * @param {string}  sessionId  — the CheckoutSession.sessionId
 * @param {Object}  dbSession  — REQUIRED: the Mongoose session (inside transaction)
 */
export const commitReservation = async (sessionId, items = [], dbSession = null) => {
    // Handle overload where dbSession is passed as 2nd argument (commitReservation(sessionId, dbSession))
    if (items && !Array.isArray(items) && typeof items === 'object') {
        dbSession = items;
        items = [];
    }

    if (!dbSession) throw new Error('commitReservation requires a Mongoose dbSession (called inside transaction).');

    const reservations = await InventoryReservation.find(
        { sessionId, status: 'reserved' }
    ).session(dbSession).lean();

    if (reservations.length > 0) {
        // ── PATH A: Active Hold Present ─────────────────────────────────────
        const updatePromises = reservations.map((r) =>
            Product.findByIdAndUpdate(
                r.productId,
                {
                    $inc: {
                        stockQuantity:    -r.quantity,
                        reservedQuantity: -r.quantity,
                    },
                },
                { session: dbSession }
            )
        );

        await Promise.all(updatePromises);

        // Mark all reservations as committed
        await InventoryReservation.updateMany(
            { sessionId, status: 'reserved' },
            { $set: { status: 'committed', committedAt: new Date() } },
            { session: dbSession }
        );

        setImmediate(async () => {
            for (const r of reservations) {
                try {
                    const product = await Product.findById(r.productId).select('stockQuantity lowStockThreshold');
                    if (!product) continue;
                    const qty       = product.stockQuantity;
                    const threshold = Number(product.lowStockThreshold) || 5;
                    if (qty <= 0)         product.stock = 'out_of_stock';
                    else if (qty <= threshold) product.stock = 'low_stock';
                    else                   product.stock = 'in_stock';
                    await product.save();
                } catch { /* non-critical */ }
            }
        });

        return { count: reservations.length, mode: 'reservation_committed' };
    }

    // ── PATH B: No Active Reservation (Expired / Released Hold Recovery) ─────
    if (!items || !Array.isArray(items) || items.length === 0) {
        console.warn(`[InventoryReservation] No active reservations or cart items for session ${sessionId}. Skipping commit.`);
        return { count: 0, mode: 'skipped' };
    }

    const deductedProducts = [];
    for (const item of items) {
        const productId = String(item.productId || item.id || item._id || '');
        if (!productId || !mongoose.isValidObjectId(productId)) continue;
        const quantity = Number(item.quantity || 1);

        // Atomic conditional stock consumption:
        // Only succeeds if availableStock (stockQuantity - reservedQuantity) >= quantity
        const updated = await Product.findOneAndUpdate(
            {
                _id: productId,
                $expr: {
                    $gte: [
                        { $subtract: ['$stockQuantity', { $ifNull: ['$reservedQuantity', 0] }] },
                        quantity,
                    ],
                },
            },
            { $inc: { stockQuantity: -quantity } },
            { session: dbSession, new: true }
        ).lean();

        if (!updated) {
            const product = await Product.findById(productId).select('name stockQuantity reservedQuantity').lean();
            const available = (product?.stockQuantity || 0) - (product?.reservedQuantity || 0);
            const err = new Error(`Insufficient stock for product "${product?.name || item.name || productId}". Requested: ${quantity}, Available: ${Math.max(0, available)}.`);
            err.statusCode = 409;
            err.code       = 'OUT_OF_STOCK';
            throw err;
        }

        deductedProducts.push({ productId, quantity });
    }

    setImmediate(async () => {
        for (const item of deductedProducts) {
            try {
                const product = await Product.findById(item.productId).select('stockQuantity lowStockThreshold');
                if (!product) continue;
                const qty       = product.stockQuantity;
                const threshold = Number(product.lowStockThreshold) || 5;
                if (qty <= 0)         product.stock = 'out_of_stock';
                else if (qty <= threshold) product.stock = 'low_stock';
                else                   product.stock = 'in_stock';
                await product.save();
            } catch { /* non-critical */ }
        }
    });

    return { count: deductedProducts.length, mode: 'direct_stock_consumed' };
};

// ── Cleanup: Release reservation ──────────────────────────────────────────────

/**
 * Release reserved stock back to available. Called on payment failure,
 * session expiry, or checkout abandonment.
 *
 * @param {string}  sessionId
 * @param {string}  [reason]   — 'payment_failed' | 'session_expired' | 'manual'
 * @param {Object}  [dbSession]
 */
export const releaseReservation = async (sessionId, reason = 'manual', dbSession = null) => {
    const opts = dbSession ? { session: dbSession } : {};

    const reservations = await InventoryReservation.find(
        { sessionId, status: 'reserved' },
        null,
        opts
    ).lean();

    if (reservations.length === 0) return 0;

    // Return reserved quantity to available
    const updatePromises = reservations.map((r) =>
        Product.findByIdAndUpdate(
            r.productId,
            { $inc: { reservedQuantity: -r.quantity } },
            opts
        )
    );
    await Promise.all(updatePromises);

    // Mark all as released
    await InventoryReservation.updateMany(
        { sessionId, status: 'reserved' },
        { $set: { status: 'released', releasedAt: new Date(), releaseReason: reason } },
        opts
    );

    return reservations.length;
};

// ── Cron: Sweep expired reservations ──────────────────────────────────────────

/**
 * Periodic cleanup — releases all reservations past their expiresAt.
 * Should be called every 5 minutes from server.js.
 *
 * @returns {Promise<{ released: number, errors: number }>}
 */
export const sweepExpiredReservations = async () => {
    const now = new Date();

    // Find all sessions with expired reservations
    const expired = await InventoryReservation.aggregate([
        { $match: { status: 'reserved', expiresAt: { $lte: now } } },
        { $group: { _id: '$sessionId', count: { $sum: 1 } } },
    ]);

    if (expired.length === 0) return { released: 0, errors: 0 };

    let released = 0;
    let errors   = 0;

    for (const { _id: sessionId } of expired) {
        try {
            const count = await releaseReservation(sessionId, 'session_expired');
            released += count;
            console.log(`[InventoryReservation] Released ${count} reservations for expired session ${sessionId}`);
        } catch (err) {
            errors++;
            console.error(`[InventoryReservation] Failed to release session ${sessionId}:`, err?.message);
        }
    }

    return { released, errors };
};
