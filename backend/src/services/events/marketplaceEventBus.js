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
import { DEFAULT_LOW_STOCK_THRESHOLD } from '../../constants/inventory.js';

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

    // Vendor
    VENDOR_REGISTERED:          'vendor.registered',
    VENDOR_APPROVED:            'vendor.approved',
    VENDOR_REJECTED:            'vendor.rejected',
    VENDOR_SUSPENDED:           'vendor.suspended',

    // Delivery
    DELIVERY_ASSIGNED:          'delivery.assigned',
    DELIVERY_COMPLETED:         'delivery.completed',
};

// ── Bootstrap handler registration ────────────────────────────────────────────

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
        if (order.userId) {
            await createNotification({
                recipientId:   String(order.userId),
                recipientType: 'user',
                category:      'ORDER',
                type:          'order',
                priority:      'HIGH',
                title:         `Order Confirmed — ${label}`,
                message:       `Your order #${order.orderId || order._id} of ₹${order.total} has been placed successfully!`,
                actionUrl:     `/orders/${order.orderId || order._id}`,
                actionType:    'order_detail',
                data:          { orderId: String(order.orderId || order._id), fulfillmentType: order.fulfillmentType },
            }).catch((err) => console.warn('Failed to send customer order notification:', err));
        }

        // 2. Notify Vendor
        const vendorId = order.vendorId || order.vendorItems?.[0]?.vendorId;
        if (vendorId) {
            await createNotification({
                recipientId:   String(vendorId),
                recipientType: 'vendor',
                category:      'ORDER',
                type:          'order',
                priority:      'HIGH',
                title:         `New ${label} Order Received!`,
                message:       `New order #${order.orderId || order._id} (₹${order.total}) requires processing.`,
                actionUrl:     `/vendor/orders/${order.orderId || order._id}`,
                actionType:    'vendor_order_detail',
                data:          { orderId: String(order.orderId || order._id), fulfillmentType: order.fulfillmentType },
            }).catch((err) => console.warn('Failed to send vendor order notification:', err));
        }

        // 3. Notify Admin for High-Value Orders
        if (order.total >= 5000) {
            await createNotification({
                recipientId:   'admin',
                recipientType: 'admin',
                category:      'ORDER',
                type:          'order',
                priority:      'HIGH',
                title:         `High-Value Order Alert (₹${order.total})`,
                message:       `High value order #${order.orderId || order._id} placed by ${order.shippingAddress?.name || 'Customer'}.`,
                actionUrl:     `/admin/orders/${order.orderId || order._id}`,
                data:          { orderId: String(order.orderId || order._id), total: String(order.total) },
            }).catch(() => null);
        }
    });

    // ── VENDOR APPROVAL EVENT ──────────────────────────────────────────────────
    marketplaceEventBus.on(MARKETPLACE_EVENTS.VENDOR_APPROVED, async ({ vendor, vendorType, channels = [] }) => {
        const { createNotification } = await import('../notification.service.js');
        if (!vendor) return;

        const displayType = channels.length
            ? channels.map((channel) => String(channel).replace(/_/g, ' ')).join(', ')
            : String(vendorType || vendor.vendorType || 'Retail').replace(/_/g, ' ');

        await createNotification({
            recipientId:   String(vendor._id || vendor.id),
            recipientType: 'vendor',
            category:      'SUCCESS',
            type:          'vendor_approval',
            priority:      'CRITICAL',
            title:         '🎉 Vendor Account Approved',
            message:       `Congratulations! Your Dwell Mart Vendor Account has been approved for ${displayType}. You can now log in and start selling.`,
            actionUrl:     '/vendor/dashboard',
            actionType:    'vendor_dashboard',
            data:          { vendorId: String(vendor._id || vendor.id), channels, legacyVendorType: String(vendorType || vendor.vendorType) },
        }).catch((err) => console.warn('Failed to send vendor approval notification:', err));
    });

    marketplaceEventBus.on(MARKETPLACE_EVENTS.VENDOR_REJECTED, async ({ vendor, reason }) => {
        const { createNotification } = await import('../notification.service.js');
        if (!vendor) return;

        await createNotification({
            recipientId:   String(vendor._id || vendor.id),
            recipientType: 'vendor',
            category:      'ERROR',
            type:          'vendor_approval',
            priority:      'HIGH',
            title:         'Vendor Application Status Update',
            message:       `Your vendor application was rejected.${reason ? ` Reason: ${reason}` : ' Please contact support for details.'}`,
            actionUrl:     '/vendor/login',
            actionType:    'vendor_login',
            data:          { vendorId: String(vendor._id || vendor.id), reason: String(reason || '') },
        }).catch(() => null);
    });

    marketplaceEventBus.on(MARKETPLACE_EVENTS.VENDOR_REGISTERED, async ({ vendor }) => {
        const { createNotification } = await import('../notification.service.js');
        if (!vendor) return;

        await createNotification({
            recipientId:   'admin',
            recipientType: 'admin',
            category:      'SYSTEM',
            type:          'system',
            priority:      'NORMAL',
            title:         'New Vendor Registration',
            message:       `${vendor.storeName || vendor.name} submitted a new vendor application.`,
            actionUrl:     '/admin/vendors/pending',
            data:          { vendorId: String(vendor._id || vendor.id) },
        }).catch(() => null);
    });

    // ── ORDER STATUS CHANGED EVENT ──────────────────────────────────────────────
    marketplaceEventBus.on(MARKETPLACE_EVENTS.ORDER_STATUS_CHANGED, async ({ order, previousStatus, newStatus }) => {
        const { createNotification } = await import('../notification.service.js');
        if (!order) return;

        const statusLabel = String(newStatus || '').toUpperCase();
        if (order.userId) {
            await createNotification({
                recipientId:   String(order.userId),
                recipientType: 'user',
                category:      'ORDER',
                type:          'order',
                priority:      'NORMAL',
                title:         `Order Update: ${statusLabel}`,
                message:       `Your order #${order.orderId || order._id} is now ${newStatus}.`,
                actionUrl:     `/orders/${order.orderId || order._id}`,
                data:          { orderId: String(order.orderId || order._id), status: String(newStatus) },
            }).catch(() => null);
        }
    });

    // ── DELIVERY EVENTS ────────────────────────────────────────────────────────
    marketplaceEventBus.on(MARKETPLACE_EVENTS.DELIVERY_ASSIGNED, async ({ order, deliveryBoy }) => {
        const { createNotification } = await import('../notification.service.js');
        if (!order || !deliveryBoy) return;

        await createNotification({
            recipientId:   String(deliveryBoy._id || deliveryBoy.id),
            recipientType: 'delivery',
            category:      'DELIVERY',
            type:          'delivery',
            priority:      'HIGH',
            title:         'New Delivery Assignment',
            message:       `Order #${order.orderId || order._id} has been assigned to you.`,
            actionUrl:     `/delivery/orders/${order.orderId || order._id}`,
            data:          { orderId: String(order.orderId || order._id) },
        }).catch(() => null);
    });

    marketplaceEventBus.on(MARKETPLACE_EVENTS.QC_ORDER_PLACED, async ({ order }) => {
        const { notifyVendorOfNewQuickCommerceOrder } = await import('../quickCommerceAlerts.service.js');
        if (!order) return;
        await notifyVendorOfNewQuickCommerceOrder(order);
    });

    marketplaceEventBus.on(MARKETPLACE_EVENTS.QC_ORDER_READY, async ({ order }) => {
        const { assignRiderForQuickCommerceOrder } = await import('../riderAssignment.service.js');
        if (!order) return;
        await assignRiderForQuickCommerceOrder(order);
    }, { retryable: true });

    marketplaceEventBus.on(MARKETPLACE_EVENTS.INVENTORY_DEDUCTED, async ({ productId, quantity }) => {
        const { default: Product } = await import('../../models/Product.model.js');
        const product = await Product.findById(productId).select('stockQuantity lowStockThreshold name').lean();
        if (!product) return;
        const threshold = Number(product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD);
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
        await createNotification({
            recipientId:   'admin',
            recipientType: 'admin',
            category:      'WARNING',
            type:          'system',
            priority:      'HIGH',
            title:         `Low Stock Alert: ${productName}`,
            message:       `Only ${stockQuantity} units remaining for ${productName} (threshold: ${threshold}).`,
            actionUrl:     '/admin/products',
            data:          { productId: String(productId) },
        }).catch(() => null);
    });

    console.log('[MarketplaceEventBus] Enterprise event handlers registered.');
};
