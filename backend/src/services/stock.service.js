/**
 * REMOVED — do not reintroduce.
 *
 * This module previously exported `validateAndDeductStock` and `restoreStock`,
 * which mutated stock with a read-modify-write:
 *
 *     product.stockQuantity -= item.quantity;
 *     await product.save();
 *
 * That is a lost-update race: two concurrent orders both read the same value
 * and both write it back, overselling the difference. It had zero call sites,
 * but it sat in `services/` looking exactly like the helper a future change
 * would reach for.
 *
 * Stock is authoritative in exactly two places, both atomic:
 *
 *   services/checkout/InventoryReservationService.js
 *       reserveStock / commitReservation / releaseReservation — conditional
 *       `$inc` on `reservedQuantity`, variant-aware, inside a transaction.
 *
 *   modules/user/controllers/order.controller.js (placeOrder)
 *       Product.findOneAndUpdate(
 *           { _id, stockQuantity: { $gte: qty } },
 *           { $inc: { stockQuantity: -qty } },
 *           { session }
 *       )
 *       The conditional filter is what prevents overselling — a plain `$inc`
 *       would still race past zero.
 *
 * Inventory is a single shared pool across Retail, Wholesale and Quick
 * Commerce (V1). There is deliberately no per-channel stock field.
 */

export {};
