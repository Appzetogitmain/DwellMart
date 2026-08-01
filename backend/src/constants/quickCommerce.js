/**
 * Quick Commerce domain constants.
 *
 * Shared by the Vendor model, validators, and the Quick Commerce service so a
 * store type or availability state is defined exactly once.
 */

export const QUICK_COMMERCE_STORE_TYPES = [
    'dark_store',
    'retail_outlet',
    'restaurant',
    'pharmacy',
];

/**
 * Store availability.
 *
 *   open                → discoverable, orderable, normal ETA
 *   busy                → discoverable, orderable, ETA extended by busyExtraMins
 *   temporarily_closed  → discoverable (greyed out), not orderable
 *   offline             → hidden entirely
 *
 * `busy` exists so an overloaded store can stay open and honest rather than
 * choosing between breaking its ETA promise and going dark.
 */
export const QUICK_COMMERCE_AVAILABILITY = {
    OPEN: 'open',
    BUSY: 'busy',
    TEMPORARILY_CLOSED: 'temporarily_closed',
    OFFLINE: 'offline',
};

export const QUICK_COMMERCE_AVAILABILITY_VALUES = Object.values(QUICK_COMMERCE_AVAILABILITY);

/** Latitude/longitude bounds, used to reject malformed coordinates. */
export const LATITUDE_BOUNDS = { min: -90, max: 90 };
export const LONGITUDE_BOUNDS = { min: -180, max: 180 };

/** Platform ceiling for a vendor-configured delivery radius. */
export const MAX_SERVICE_RADIUS_KM = 25;

/** ETA + fee defaults. Overridable per-platform via the `quick_commerce` Settings key. */
export const DEFAULT_AVERAGE_SPEED_KMPH = 20;
export const DEFAULT_PREPARATION_MINS = 10;
export const DEFAULT_BASE_DELIVERY_FEE = 25;
export const DEFAULT_PER_KM_FEE = 8;

/**
 * Quick Commerce order lifecycle.
 *
 * Finer-grained than the Marketplace status model because a customer watching a
 * 15-minute delivery needs to know whether the store is still packing or the
 * rider is already moving. Each maps onto a coarse Marketplace status so shared
 * reporting and existing order queries keep working unchanged.
 */
export const QUICK_COMMERCE_ORDER_STATUS = {
    PLACED: 'placed',
    ACCEPTED: 'accepted',
    PREPARING: 'preparing',
    READY: 'ready',
    PICKED_UP: 'picked_up',
    ARRIVING: 'arriving',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
};

export const QUICK_COMMERCE_ORDER_STATUS_VALUES = Object.values(QUICK_COMMERCE_ORDER_STATUS);

/** Quick Commerce status → existing Marketplace status. */
export const QUICK_COMMERCE_STATUS_TO_ORDER_STATUS = {
    placed: 'pending',
    accepted: 'processing',
    preparing: 'processing',
    ready: 'processing',
    picked_up: 'shipped',
    arriving: 'shipped',
    delivered: 'delivered',
    cancelled: 'cancelled',
};
