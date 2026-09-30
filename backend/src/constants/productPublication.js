export const PRODUCT_PUBLICATION_STATUS = Object.freeze({
    PENDING_REVIEW: 'PENDING_REVIEW',
    LIVE: 'LIVE',
    OFFLINE: 'OFFLINE',
    REJECTED: 'REJECTED',
});

export const PRODUCT_PUBLICATION_STATUSES = Object.freeze(
    Object.values(PRODUCT_PUBLICATION_STATUS)
);

export const ADMIN_SETTABLE_PUBLICATION_STATUSES = Object.freeze([
    PRODUCT_PUBLICATION_STATUS.LIVE,
    PRODUCT_PUBLICATION_STATUS.OFFLINE,
]);

/** Mandatory predicate for every customer-facing product query. */
export const CUSTOMER_VISIBLE_PRODUCT_FILTER = Object.freeze({
    publicationStatus: PRODUCT_PUBLICATION_STATUS.LIVE,
    isDeleted: { $ne: true },
});

