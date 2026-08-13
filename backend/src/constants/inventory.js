/**
 * Inventory thresholds.
 *
 * The schema declared a default of 10 while two runtime call sites used 5, so
 * a product with no explicit threshold was labelled low-stock at a different
 * point depending on which code path ran. One definition now.
 */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;
