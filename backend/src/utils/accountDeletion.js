/**
 * A deleted account keeps its database identity for immutable order/audit
 * references, but releases the customer's original email for a future signup.
 * The .invalid TLD guarantees this can never be used as a real mailbox.
 */
export const buildDeletedEmail = (role, id, timestamp = Date.now()) =>
    "deleted+" + String(role).toLowerCase() + "-" + String(id) + "-" + Number(timestamp)
    + "@deleted.dwellmart.invalid";

export const FINAL_ORDER_STATUSES = ['delivered', 'cancelled', 'returned'];
