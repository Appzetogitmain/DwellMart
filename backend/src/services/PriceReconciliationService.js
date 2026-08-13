/**
 * PriceReconciliationService
 *
 * Authoritative monetary precision helper and price reconciliation assertion engine
 * for DwellMart backend across Retail, Quick Commerce, and Wholesale experiences.
 */

/**
 * Standardized monetary rounding helper (2 decimal places).
 * Prevents floating point errors (e.g. 999.499999999 -> 999.5).
 *
 * @param {number|string} amount
 * @returns {number}
 */
export const roundMoney = (amount) => {
    const num = Number(amount);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 100) / 100;
};

/**
 * Asserts price consistency across checkout session, orders, and payment amounts.
 *
 * @param {Object} params
 * @param {number} [params.checkoutTotal]          - Total calculated on CheckoutSession
 * @param {Array<number>} [params.orderTotals]     - Array of Order totals created from split
 * @param {number} [params.paymentAmount]          - Amount sent to Cashfree gateway
 * @param {Array<Object>} [params.vendorGroups]    - Vendor item groups for multi-vendor check
 * @param {string} [params.context]                - Context string for logs (e.g. 'CHECKOUT', 'WEBHOOK')
 * @returns {{ isConsistent: boolean, difference: number, details: Object }}
 */
export const assertPriceConsistency = ({
    checkoutTotal = null,
    orderTotals = [],
    paymentAmount = null,
    vendorGroups = [],
    context = 'CHECKOUT_RECONCILIATION',
    /**
     * 'observe' logs a mismatch and lets the transaction proceed.
     * 'enforce' throws, halting checkout.
     *
     * Despite its name this function has only ever observed: it returned a
     * result object that both call sites discarded, so a detected mismatch
     * never stopped an order. Enforcement is opt-in and must only be switched
     * on after a soak shows zero mismatches — turning it on while a mismatch
     * still exists would fail every affected checkout.
     */
    mode = 'observe',
} = {}) => {
    const roundedCheckout = checkoutTotal !== null ? roundMoney(checkoutTotal) : null;
    const roundedPayment = paymentAmount !== null ? roundMoney(paymentAmount) : null;
    
    const sumOrderTotals = roundMoney(
        orderTotals.reduce((sum, amt) => sum + roundMoney(amt), 0)
    );

    const sumVendorTotals = roundMoney(
        vendorGroups.reduce((sum, vg) => {
            const vTotal = roundMoney(
                (vg.subtotal || 0) +
                (vg.shipping || 0) +
                (vg.packagingFee || 0) +
                (vg.tax || 0) -
                (vg.discount || 0)
            );
            return sum + vTotal;
        }, 0)
    );

    let isConsistent = true;
    let maxDiff = 0;

    // Check 1: Checkout Session vs Orders sum
    if (roundedCheckout !== null && orderTotals.length > 0) {
        const diff = roundMoney(Math.abs(roundedCheckout - sumOrderTotals));
        if (diff > 0.001) {
            isConsistent = false;
            maxDiff = Math.max(maxDiff, diff);
        }
    }

    // Check 2: Payment Gateway Amount vs Checkout Session
    if (roundedCheckout !== null && roundedPayment !== null) {
        const diff = roundMoney(Math.abs(roundedCheckout - roundedPayment));
        if (diff > 0.001) {
            isConsistent = false;
            maxDiff = Math.max(maxDiff, diff);
        }
    }

    // Check 3: Payment Gateway Amount vs Orders sum
    if (roundedPayment !== null && orderTotals.length > 0) {
        const diff = roundMoney(Math.abs(roundedPayment - sumOrderTotals));
        if (diff > 0.001) {
            isConsistent = false;
            maxDiff = Math.max(maxDiff, diff);
        }
    }

    const details = {
        context,
        checkoutTotal: roundedCheckout,
        paymentAmount: roundedPayment,
        sumOrderTotals,
        sumVendorTotals,
        orderCount: orderTotals.length,
        difference: maxDiff,
    };

    if (!isConsistent) {
        console.error(
            `[PRICE_MISMATCH] Mismatch detected during ${context}! Details:`,
            JSON.stringify(details, null, 2)
        );

        if (mode === 'enforce') {
            const err = new Error(
                'Order total does not match the amount authorised for payment. '
                + 'Please refresh your cart and try again.'
            );
            err.statusCode = 409;
            err.code = 'PRICE_CONSISTENCY_FAILED';
            err.details = details;
            throw err;
        }
    }

    return {
        isConsistent,
        difference: maxDiff,
        details,
    };
};

export default {
    roundMoney,
    assertPriceConsistency,
};
