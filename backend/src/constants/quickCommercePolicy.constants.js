/**
 * Policy constants for Quick Commerce returns, fulfilment, and delivery failure workflows.
 */

export const RETURN_WINDOWS = {
    MARKETPLACE_HOURS: 7 * 24, // 168 hours
    QUICK_COMMERCE_NON_PERISHABLE_HOURS: 24,
    QUICK_COMMERCE_PERISHABLE_HOURS: 0,
};

export const FULFILMENT_OUTCOMES = {
    FULFILLED: 'fulfilled',
    PARTIALLY_FULFILLED: 'partially_fulfilled',
    UNFULFILLED: 'unfulfilled',
};

export const FULFILMENT_UNAVAILABLE_REASONS = {
    OUT_OF_STOCK: 'OUT_OF_STOCK',
    DAMAGED: 'DAMAGED',
    QUALITY_FAILED: 'QUALITY_FAILED',
    STORE_ERROR: 'STORE_ERROR',
};

export const FULFILMENT_UNAVAILABLE_REASON_VALUES = Object.values(FULFILMENT_UNAVAILABLE_REASONS);

export const DELIVERY_FAILURE_REASONS = {
    CUSTOMER_UNREACHABLE: 'CUSTOMER_UNREACHABLE',
    WRONG_ADDRESS: 'WRONG_ADDRESS',
    CUSTOMER_REFUSED: 'CUSTOMER_REFUSED',
    STORE_CLOSED: 'STORE_CLOSED',
};

export const DELIVERY_FAILURE_REASON_VALUES = Object.values(DELIVERY_FAILURE_REASONS);

export const RETURN_REASONS = {
    DAMAGED: 'damaged',
    WRONG_ITEM: 'wrong_item',
    EXPIRED: 'expired',
    MISSING_ITEM: 'missing_item',
    DEFECTIVE: 'defective',
    NOT_NEEDED: 'not_needed',
};

export const RETURN_REASON_VALUES = Object.values(RETURN_REASONS);

export const RETRY_LIMIT = 2;
