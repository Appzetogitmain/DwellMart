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
export const MAX_SERVICE_RADIUS_KM = 3;

/** ETA + fee defaults. Overridable per-platform via the `quick_commerce` Settings key. */
export const DEFAULT_AVERAGE_SPEED_KMPH = 25;
export const DEFAULT_PREPARATION_MINS = 10;
export const DEFAULT_BASE_DELIVERY_FEE = 30;
export const DEFAULT_PER_KM_FEE = 9;
export const DEFAULT_FREE_DELIVERY_ABOVE = 590;

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
    CUSTOMER_UNREACHABLE: 'customer_unreachable',
    RETRY_SCHEDULED: 'retry_scheduled',
    RETURNED_TO_STORE: 'returned_to_store',
    DELIVERY_FAILED: 'delivery_failed',
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
    customer_unreachable: 'shipped',
    retry_scheduled: 'shipped',
    returned_to_store: 'returned',
    delivery_failed: 'cancelled',
};

/**
 * Legal Quick Commerce status transitions.
 *
 * Enforced server-side. Without this a rider could mark an order delivered
 * before the store has even packed it, and the ETA promise becomes unauditable.
 * Cancellation is handled by the existing cancel flow, not by this map.
 */
export const QUICK_COMMERCE_STATUS_TRANSITIONS = {
    placed: ['accepted', 'cancelled'],
    accepted: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['picked_up', 'cancelled'],
    picked_up: ['arriving', 'delivered'],
    arriving: ['delivered', 'customer_unreachable'],
    customer_unreachable: ['retry_scheduled', 'returned_to_store'],
    retry_scheduled: ['arriving', 'returned_to_store'],
    returned_to_store: ['delivery_failed'],
    delivery_failed: [],
    delivered: [],
    cancelled: [],
};

/** Which actor may move an order into each status. */
export const QUICK_COMMERCE_VENDOR_STATUSES = ['accepted', 'preparing', 'ready'];
export const QUICK_COMMERCE_RIDER_STATUSES = ['picked_up', 'arriving', 'delivered', 'customer_unreachable', 'retry_scheduled', 'returned_to_store'];

/**
 * Rider assignment lifecycle for a Quick Commerce order.
 *
 * `escalated` exists so an order that found no rider lands in an admin queue
 * instead of sitting silently in `pending` forever.
 */
export const QUICK_COMMERCE_ASSIGNMENT_STATUS = {
    PENDING: 'pending',
    ASSIGNED: 'assigned',
    ESCALATED: 'escalated',
};

export const QUICK_COMMERCE_ASSIGNMENT_STATUS_VALUES = Object.values(QUICK_COMMERCE_ASSIGNMENT_STATUS);

/**
 * Escalating pickup-search radii, in kilometres.
 *
 * Tried in order: prefer a genuinely close rider, but widen rather than fail.
 * The last value is the ceiling — beyond it the pickup leg costs more than the
 * delivery is worth, so the order escalates to a human instead.
 */
export const RIDER_SEARCH_RADII_KM = [3, 5, 8];

/**
 * A rider whose last location report is older than this is treated as offline
 * for assignment purposes — a stale pin is worse than no pin, because it sends
 * the order to a rider who may be nowhere near it.
 */
export const RIDER_LOCATION_STALE_AFTER_MS = 10 * 60 * 1000;

/** Minimum gap between accepted rider location pings (throttle floor). */
export const RIDER_LOCATION_MIN_INTERVAL_MS = 5 * 1000;

/**
 * How long a store has to acknowledge a new order before it escalates.
 *
 * Short by Marketplace standards, and deliberately so: on a 15-minute promise,
 * two minutes of silence is already a meaningful fraction of the ETA. Overridable
 * via the `quick_commerce` Settings key (`vendorAckTimeoutSecs`).
 */
export const VENDOR_ACK_TIMEOUT_SECS = 120;

/** How often the escalation/SLA sweep runs. */
export const QUICK_COMMERCE_SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Statuses at which an order is still awaiting the store's response.
 * Once accepted, the acknowledgement question is moot.
 */
export const QUICK_COMMERCE_AWAITING_VENDOR_STATUSES = ['placed'];

/**
 * Stages at which the store has already committed real work to the order.
 *
 * A cancellation from here leaves physical goods that someone has paid to
 * assemble, which is a settlement question rather than a simple refund.
 */
export const QUICK_COMMERCE_POST_PREPARATION_STAGES = ['preparing', 'ready', 'picked_up', 'arriving'];

/**
 * Stages an order passes through, in order, for funnel reporting.
 * Kept separate from the transition map so reporting order is explicit.
 */
export const QUICK_COMMERCE_STAGE_ORDER = [
    'placed',
    'accepted',
    'preparing',
    'ready',
    'picked_up',
    'arriving',
    'delivered',
];
