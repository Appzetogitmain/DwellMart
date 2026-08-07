/**
 * marketplaceEventBus
 *
 * Enterprise event-driven side-effect system for DwellMart Marketplace.
 *
 * Design:
 *   - In-process EventEmitter for synchronous side effects (notifications, analytics).
 *   - For critical async side effects (rider assignment, courier booking), the
 *     emitter pattern still works — the handlers perform their own retries.
 *   - Events are namespaced: order.created, order.statusChanged, payment.captured, etc.
 *   - All handlers are fire-and-forget — they never throw back to the checkout path.
 *
 * Usage:
 *   import { marketplaceEventBus } from './marketplaceEventBus.js';
 *   marketplaceEventBus.emit('order.created', { order, fulfillmentType });
 *
 * Handlers are registered at bootstrap (server.js imports this module).
 */

import EventEmitter from 'events';

class MarketplaceEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);  // Marketplace has many event listeners
    }

    /**
     * Emit an event safely.
     * Handlers are called asynchronously — checkout path never waits.
     */
    emit(event, ...args) {
        setImmediate(() => {
            try {
                super.emit(event, ...args);
            } catch (err) {
                console.error(`[MarketplaceEventBus] Unhandled error in "${event}" listener:`, err);
            }
        });
        return true;
    }

    /**
     * Register a handler. Wraps it to prevent unhandled rejections.
     * On failure, enqueues the event payload to the persistent RetryQueue.
     */
    on(event, handler, { retryable = false } = {}) {
        const wrapped = async (...args) => {
            try {
                await handler(...args);
            } catch (err) {
                console.error(`[MarketplaceEventBus] Handler error for "${event}":`, err?.message || err);
                if (retryable) {
                    // Enqueue for persistent retry — import lazily to avoid circular
                    import('./RetryQueueService.js').then(({ RetryQueueService }) => {
                        RetryQueueService.enqueue(event, args[0]).catch(() => null);
                    });
                }
            }
        };
        return super.on(event, wrapped);
    }
}

export const marketplaceEventBus = new MarketplaceEventBus();

// ── Event name constants (to prevent typos) ───────────────────────────────────

export const MARKETPLACE_EVENTS = {
    // Order lifecycle
    ORDER_CREATED:              'order.created',
    ORDER_STATUS_CHANGED:       'order.statusChanged',
    ORDER_CANCELLED:            'order.cancelled',
    ORDER_DELIVERED:            'order.delivered',

    // CheckoutSession
    CHECKOUT_COMPLETED:         'checkout.completed',
    CHECKOUT_FAILED:            'checkout.failed',

    // Payment
    PAYMENT_CAPTURED:           'payment.captured',
    PAYMENT_REFUNDED:           'payment.refunded',

    // QC-specific
    QC_ORDER_PLACED:            'qc.orderPlaced',
    QC_ORDER_ACCEPTED:          'qc.orderAccepted',
    QC_ORDER_READY:             'qc.orderReady',
    QC_ORDER_PICKED_UP:         'qc.orderPickedUp',
    QC_ORDER_DELIVERED:         'qc.orderDelivered',
    QC_VENDOR_NOTIFIED:         'qc.vendorNotified',
    QC_RIDER_ASSIGNED:          'qc.riderAssigned',
    QC_SLA_BREACHED:            'qc.slaBreached',

    // Inventory
    INVENTORY_DEDUCTED:         'inventory.deducted',
    INVENTORY_RESTORED:         'inventory.restored',
    LOW_STOCK_ALERT:            'inventory.lowStock',

    // Returns
    RETURN_REQUESTED:           'return.requested',
    RETURN_APPROVED:            'return.approved',
    RETURN_REJECTED:            'return.rejected',
    RETURN_REFUNDED:            'return.refunded',

    // Settlement
    SETTLEMENT_TRIGGERED:       'settlement.triggered',
    SETTLEMENT_COMPLETED:       'settlement.completed',
};

// ── Bootstrap handler registration ────────────────────────────────────────────
//
// Import this function once in server.js after DB connection:
//   import { registerMarketplaceEventHandlers } from './services/events/marketplaceEventBus.js';
//   registerMarketplaceEventHandlers();

export const registerMarketplaceEventHandlers = () => {
    // Lazy-import handlers to avoid circular dependencies at module level
    marketplaceEventBus.on(MARKETPLACE_EVENTS.ORDER_CREATED, async ({ order, fulfillmentType }) => {
        const { createNotification } = await import('../notification.service.js');
        if (!order) return;

        const labels = {
            quick_commerce: 'Express Delivery ⚡',
            retail:         'Standard Delivery 📦',
            wholesale:      'Wholesale B2B 🏭',
        };
        const label = labels[fulfillmentType || order.fulfillmentType] || 'Standard Delivery 📦';

        // 1. Notify Customer (User)
        const recipientUserId = order.userId ? String(order.userId) : (order.guestInfo?.phone || 'guest');
        await createNotification({
            recipientId:   recipientUserId,
            recipientType: 'user',
            type:          'order_placed',
            title:         `Order Confirmed — ${label}`,
            message:       `Your order #${order.orderId} of ₹${order.total} has been placed successfully!`,
            data:          { orderId: order.orderId, fulfillmentType: order.fulfillmentType },
        }).catch((err) => console.warn('Failed to send customer order notification:', err));

        // 2. Notify Vendor
        if (order.vendorId) {
            await createNotification({
                recipientId:   String(order.vendorId),
                recipientType: 'vendor',
                type:          'order_placed',
                title:         `New ${label} Order Received!`,
                message:       `New order #${order.orderId} (₹${order.total}) requires processing.`,
                data:          { orderId: order.orderId, fulfillmentType: order.fulfillmentType },
            }).catch((err) => console.warn('Failed to send vendor order notification:', err));
        }
    });

    marketplaceEventBus.on(MARKETPLACE_EVENTS.QC_ORDER_PLACED, async ({ order }) => {
        const { notifyVendorOfNewQuickCommerceOrder } = await import('../quickCommerceAlerts.service.js');
        if (!order) return;
        await notifyVendorOfNewQuickCommerceOrder(order);
    });

    marketplaceEventBus.on(MARKETPLACE_EVENTS.QC_ORDER_PLACED, async ({ order }) => {
        const { assignRiderForQuickCommerceOrder } = await import('../riderAssignment.service.js');
        if (!order) return;
        await assignRiderForQuickCommerceOrder(order);
    }, { retryable: true }); // on failure → enqueued to FailedJob with backoff

    marketplaceEventBus.on(MARKETPLACE_EVENTS.INVENTORY_DEDUCTED, async ({ productId, quantity }) => {
        // Check and emit low-stock alert
        const { default: Product } = await import('../../models/Product.model.js');
        const product = await Product.findById(productId).select('stockQuantity lowStockThreshold name').lean();
        if (!product) return;
        const threshold = Number(product.lowStockThreshold) || 5;
        if (Number(product.stockQuantity) <= threshold) {
            marketplaceEventBus.emit(MARKETPLACE_EVENTS.LOW_STOCK_ALERT, {
                productId,
                productName:    product.name,
                stockQuantity:  product.stockQuantity,
                threshold,
            });
        }
    });

    marketplaceEventBus.on(MARKETPLACE_EVENTS.LOW_STOCK_ALERT, async ({ productId, productName, stockQuantity, threshold }) => {
        const { createNotification } = await import('../notification.service.js');
        // Notify admin
        await createNotification({
            role:    'admin',
            type:    'low_stock',
            title:   `Low Stock: ${productName}`,
            message: `Only ${stockQuantity} units remaining (threshold: ${threshold}).`,
            data:    { productId },
        });
    });

    console.log('[MarketplaceEventBus] Event handlers registered.');
};
