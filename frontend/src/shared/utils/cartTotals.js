/**
 * Cart tax & total preview — mirrors the backend `placeOrder` arithmetic.
 *
 * ⚠️  Display only. The backend recomputes every amount at checkout and its
 *     result is what the customer is charged.
 *
 * Mirrors `backend/src/modules/user/controllers/order.controller.js`:
 *   - Per-product tax rate (not a flat rate).
 *   - Tax-inclusive prices: tax is extracted from the price, NOT added to it.
 *   - Tax-exclusive prices: tax is added on top of the subtotal.
 *   - total = subtotal - couponDiscount + shipping + taxAddedToTotal
 *
 * Legacy cart lines without tax fields default to 18% exclusive, which is the
 * platform default (`Product.taxRate` default 18, `taxIncluded` default false).
 */

const DEFAULT_TAX_RATE = 18;

/**
 * Compute tax for a set of cart lines.
 *
 * @param {Array} items Cart lines with { taxRate?, taxIncluded?, quantity } and a
 *                      resolved unit price supplied by `getUnitPrice`.
 * @param {Function} getUnitPrice Returns the effective unit price for a line
 *                      (wholesale tier aware).
 * @returns {{ displayTax: number, taxAddedToTotal: number }}
 *          `displayTax` is the total tax to show the customer (inclusive +
 *          exclusive, matching the backend's reported `tax`).
 *          `taxAddedToTotal` is only the exclusive portion, which is what the
 *          backend actually adds to the payable total.
 */
export const calculateCartTax = (items = [], getUnitPrice = (item) => Number(item?.price) || 0) => {
  let displayTax = 0;
  let taxAddedToTotal = 0;

  for (const item of items) {
    const quantity = Number(item?.quantity) || 0;
    const unitPrice = Number(getUnitPrice(item)) || 0;
    const lineSubtotal = unitPrice * quantity;
    if (lineSubtotal <= 0) continue;

    const rate = item?.taxRate === undefined || item?.taxRate === null
      ? DEFAULT_TAX_RATE
      : Number(item.taxRate);
    if (!Number.isFinite(rate) || rate <= 0) continue;

    if (item?.taxIncluded === true) {
      // Price already contains tax — extract it, do not add to the total.
      const net = lineSubtotal / (1 + rate / 100);
      displayTax += lineSubtotal - net;
    } else {
      const lineTax = lineSubtotal * (rate / 100);
      displayTax += lineTax;
      taxAddedToTotal += lineTax;
    }
  }

  return {
    displayTax: Number(displayTax.toFixed(2)),
    taxAddedToTotal: Number(taxAddedToTotal.toFixed(2)),
  };
};

/**
 * Compute the payable total exactly as the backend does.
 * total = subtotal - couponDiscount + shipping + taxAddedToTotal
 */
export const calculateCartTotal = ({ subtotal = 0, discount = 0, shipping = 0, taxAddedToTotal = 0 }) =>
  Number(Math.max(0, Number(subtotal) - Number(discount) + Number(shipping) + Number(taxAddedToTotal)).toFixed(2));
