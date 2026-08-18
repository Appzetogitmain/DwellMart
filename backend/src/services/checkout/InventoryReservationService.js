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

/**
 * Normalise a variant key for safe use inside a MongoDB field path.
 *
 * Keys look like `size=m|color=red`. A key containing `.` or a leading `$`
 * would break or subvert the dotted path used for `variants.stockMap.<key>`,
 * so those are rejected rather than escaped — a malformed key means the caller
 * is wrong, and silently rewriting it would hold stock against the wrong SKU.
 *
 * @returns {string} the key, or '' when there is no usable variant
 */
const normalizeVariantKey = (raw) => {
    const key = String(raw ?? '').trim();
    if (!key) return '';
    if (key.includes('.') || key.startsWith('$')) {
        console.warn(`[InventoryReservation] Ignoring unsafe variantKey "${key}" — falls back to product-level stock.`);
        return '';
    }
    return key;
};

/** Read a value from a stockMap that may be a Mongoose Map or a plain object. */
const readMapValue = (map, key) => {
    if (!map || !key) return undefined;
    if (typeof map.get === 'function') return map.get(key);
    return map[key];
};

/** Available units for one variant: its stock minus its reserved. */
const variantAvailability = (product, variantKey) => {
    const stock = Number(readMapValue(product?.variants?.stockMap, variantKey) ?? 0);
    const reserved = Number(readMapValue(product?.variants?.reservedMap, variantKey) ?? 0);
    return stock - reserved;
};

/**
 * Resolve each cart line's variant key.
 *
 * The client sends `variant` — the selection object, e.g. `{size:'M'}` — not a
 * key. The pricing engine already knows how to turn that into the canonical
 * `variants.stockMap` key, so the same resolver is used here. Deriving it
 * independently would risk holding stock against a different key than the one
 * the price came from.
 *
 * Returns a Map of `item index → variantKey`, so a caller with no variant data
 * costs one extra query and nothing more.
 */
const resolveVariantKeys = async (items = []) => {
    const keys = new Map();

    const needsResolution = items.some(
        (item) => !item?.variantKey && item?.variant && Object.keys(item.variant).length > 0
    );
    if (!needsResolution) {
        items.forEach((item, i) => keys.set(i, normalizeVariantKey(item?.variantKey)));
        return keys;
    }

    const ids = [...new Set(
        items.map((i) => String(i?.productId || i?.id || '')).filter((id) => mongoose.isValidObjectId(id))
    )];
    const products = await Product.find({ _id: { $in: ids } })
        .select('_id variants price name')
        .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const { resolveVariantSelection } = await import('../pricingEngine.service.js');

    items.forEach((item, i) => {
        if (item?.variantKey) {
            keys.set(i, normalizeVariantKey(item.variantKey));
            return;
        }
        const product = byId.get(String(item?.productId || item?.id || ''));
        if (!product) {
            keys.set(i, '');
            return;
        }
        try {
            const { variantKey } = resolveVariantSelection(product, item?.variant);
            keys.set(i, normalizeVariantKey(variantKey));
        } catch {
            keys.set(i, '');
        }
    });

    return keys;
};

/**
 * Recompute the `in_stock` / `low_stock` / `out_of_stock` label for a set of
 * products, in ONE round-trip each way.
 *
 * This previously ran as a per-product `findById` + `save()` loop, so a
 * 20-line cart produced 40 sequential queries after every commit. The label is
 * derived data, so it is read once and written once via bulkWrite.
 *
 * Non-critical by design: a failure here leaves the label stale, never the
 * stock quantity wrong.
 */
const refreshStockLabels = async (productIds = []) => {
    const ids = [...new Set(productIds.filter(Boolean).map(String))];
    if (ids.length === 0) return;

    try {
        const products = await Product.find({ _id: { $in: ids } })
            .select('_id stockQuantity lowStockThreshold')
            .lean();

        const ops = products.map((product) => {
            const qty = Number(product.stockQuantity || 0);
            // Falls back to the schema default rather than a second literal —
            // the runtime used 5 while the schema declared 10.
            const threshold = Number(product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD);
            const stock = qty <= 0 ? 'out_of_stock' : qty <= threshold ? 'low_stock' : 'in_stock';
            return {
                updateOne: {
                    filter: { _id: product._id },
                    update: { $set: { stock } },
                },
            };
        });

        if (ops.length > 0) await Product.bulkWrite(ops, { ordered: false });
    } catch (err) {
        console.warn(`[InventoryReservation] Stock label refresh failed: ${err?.message}`);
    }
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

    // Resolve variant keys up front. The client sends a selection object, not a
    // key, so without this variant reservation would silently never engage —
    // the feature would look implemented and hold nothing.
    const variantKeys = await resolveVariantKeys(items);

    // Process all items. Collect failures rather than aborting on first error
    // so the frontend can show ALL unavailable items at once.
    for (const [itemIndex, item] of items.entries()) {
        const productId      = String(item.productId || item.id || '');
        const quantity       = Number(item.quantity  || 1);
        const fulfillmentType = String(item.fulfillmentType || 'retail').toLowerCase();
        const expiresAt      = getExpiresAt(fulfillmentType);
        const variantKey     = variantKeys.get(itemIndex) || '';

        const opts = dbSession ? { session: dbSession } : {};

        // Reserve at BOTH levels when a variant is involved.
        //
        // `stockQuantity` is the product total and `variants.stockMap[key]` is
        // the per-variant count; holding only the total let two customers each
        // take the last unit of the same size. The filter below is a single
        // atomic conditional update covering both, so there is no window
        // between checking and holding.
        const stockPath = variantKey ? `variants.stockMap.${variantKey}` : null;
        const reservedPath = variantKey ? `variants.reservedMap.${variantKey}` : null;

        const filter = {
            _id: productId,
            $expr: {
                $gte: [
                    { $subtract: ['$stockQuantity', { $ifNull: ['$reservedQuantity', 0] }] },
                    quantity,
                ],
            },
        };
        const increments = { reservedQuantity: quantity };

        if (variantKey) {
            // Only enforce the variant condition when the product actually
            // tracks that variant's stock. A product whose stockMap has no
            // entry for this key falls back to product-level accounting rather
            // than failing a legitimate purchase.
            filter.$and = [
                {
                    $or: [
                        { [stockPath]: { $exists: false } },
                        {
                            $expr: {
                                $gte: [
                                    {
                                        $subtract: [
                                            { $ifNull: [`$${stockPath}`, 0] },
                                            { $ifNull: [`$${reservedPath}`, 0] },
                                        ],
                                    },
                                    quantity,
                                ],
                            },
                        },
                    ],
                },
            ];
            increments[reservedPath] = quantity;
        }

        const updated = await Product.findOneAndUpdate(
            filter,
            { $inc: increments },
            { new: false, ...opts }
        ).lean();

        if (!updated) {
            // Report the variant's availability when one was requested — "only
            // 2 left" against the wrong number is worse than no number.
            const product = await Product.findById(productId)
                .select('name stockQuantity reservedQuantity variants.stockMap variants.reservedMap')
                .lean();

            const available = variantKey
                ? variantAvailability(product, variantKey)
                : (product?.stockQuantity || 0) - (product?.reservedQuantity || 0);

            failures.push({
                productId,
                variantKey: variantKey || undefined,
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
            variantKey,
            quantity,
            fulfillmentType,
            status: 'reserved',
            expiresAt,
        };

        try {
            const [saved] = await InventoryReservation.create([reservationDoc], opts.session ? { session: opts.session } : {});
            reservations.push(saved);
        } catch (err) {
            // A genuine duplicate (session + product + variant) means this exact
            // hold already exists, so the increment above was a SECOND one and
            // must be undone. Previously this path kept the increment and
            // recorded no document, leaking reserved stock that nothing could
            // ever release.
            if (err?.code === 11000) {
                const rollback = { reservedQuantity: -quantity };
                if (variantKey) rollback[reservedPath] = -quantity;
                await Product.findByIdAndUpdate(productId, { $inc: rollback }, opts).catch(() => null);

                const existing = await InventoryReservation.findOne({
                    sessionId,
                    productId,
                    variantKey,
                }).lean();
                if (existing) reservations.push(existing);
            } else {
                // Unexpected error — roll back the $inc we just did
                const rollback = { reservedQuantity: -quantity };
                if (variantKey) rollback[reservedPath] = -quantity;
                await Product.findByIdAndUpdate(productId, { $inc: rollback }, opts);
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
        const updatePromises = reservations.map((r) => {
            // Deduct at both levels, mirroring how the hold was taken. Omitting
            // the variant here would permanently detach `stockMap` from
            // `stockQuantity` after the first sale of a variant product.
            const decrements = {
                stockQuantity:    -r.quantity,
                reservedQuantity: -r.quantity,
            };
            const key = normalizeVariantKey(r.variantKey);
            if (key) {
                decrements[`variants.stockMap.${key}`] = -r.quantity;
                decrements[`variants.reservedMap.${key}`] = -r.quantity;
            }
            return Product.findByIdAndUpdate(r.productId, { $inc: decrements }, { session: dbSession });
        });

        await Promise.all(updatePromises);

        // Mark all reservations as committed
        await InventoryReservation.updateMany(
            { sessionId, status: 'reserved' },
            { $set: { status: 'committed', committedAt: new Date() } },
            { session: dbSession }
        );

        setImmediate(() => {
            refreshStockLabels(reservations.map((r) => r.productId));
        });

        return { count: reservations.length, mode: 'reservation_committed' };
    }

    // ── PATH B: No Active Reservation (Expired / Released Hold Recovery) ─────
    if (!items || !Array.isArray(items) || items.length === 0) {
        console.warn(`[InventoryReservation] No active reservations or cart items for session ${sessionId}. Skipping commit.`);
        return { count: 0, mode: 'skipped' };
    }

    const deductedProducts = [];
    // Same resolution as the reservation path — a recovered expired hold must
    // not oversell a variant either.
    const directVariantKeys = await resolveVariantKeys(items);
    for (const [directIndex, item] of items.entries()) {
        const productId = String(item.productId || item.id || item._id || '');
        if (!productId || !mongoose.isValidObjectId(productId)) continue;
        const quantity = Number(item.quantity || 1);

        // Atomic conditional stock consumption:
        // Only succeeds if availableStock (stockQuantity - reservedQuantity) >= quantity.
        // Variant-aware for the same reason as the reservation path — a expired
        // hold recovered here must not oversell one size.
        const variantKey = directVariantKeys.get(directIndex) || '';
        const stockPath = variantKey ? `variants.stockMap.${variantKey}` : null;
        const reservedPath = variantKey ? `variants.reservedMap.${variantKey}` : null;

        const filter = {
            _id: productId,
            $expr: {
                $gte: [
                    { $subtract: ['$stockQuantity', { $ifNull: ['$reservedQuantity', 0] }] },
                    quantity,
                ],
            },
        };
        const decrements = { stockQuantity: -quantity };

        if (variantKey) {
            filter.$and = [
                {
                    $or: [
                        { [stockPath]: { $exists: false } },
                        {
                            $expr: {
                                $gte: [
                                    {
                                        $subtract: [
                                            { $ifNull: [`$${stockPath}`, 0] },
                                            { $ifNull: [`$${reservedPath}`, 0] },
                                        ],
                                    },
                                    quantity,
                                ],
                            },
                        },
                    ],
                },
            ];
            decrements[stockPath] = -quantity;
        }

        const updated = await Product.findOneAndUpdate(
            filter,
            { $inc: decrements },
            { session: dbSession, new: true }
        ).lean();

        if (!updated) {
            const product = await Product.findById(productId)
                .select('name stockQuantity reservedQuantity variants.stockMap variants.reservedMap')
                .lean();
            const available = variantKey
                ? variantAvailability(product, variantKey)
                : (product?.stockQuantity || 0) - (product?.reservedQuantity || 0);
            const label = variantKey ? ` (variant ${variantKey})` : '';
            const err = new Error(`Insufficient stock for product "${product?.name || item.name || productId}"${label}. Requested: ${quantity}, Available: ${Math.max(0, available)}.`);
            err.statusCode = 409;
            err.code       = 'OUT_OF_STOCK';
            throw err;
        }

        deductedProducts.push({ productId, quantity, variantKey });
    }

    setImmediate(() => {
        refreshStockLabels(deductedProducts.map((item) => item.productId));
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
    const updatePromises = reservations.map((r) => {
        // Return the hold at both levels. Releasing only the product-level
        // count would leave the variant permanently reserved — unsellable
        // stock that nothing would ever free.
        const decrements = { reservedQuantity: -r.quantity };
        const key = normalizeVariantKey(r.variantKey);
        if (key) decrements[`variants.reservedMap.${key}`] = -r.quantity;
        return Product.findByIdAndUpdate(r.productId, { $inc: decrements }, opts);
    });
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
