import api from "../utils/api";

/**
 * Quick Commerce discovery API.
 *
 * Every call carries a location hint (`lat`/`lng`, or `pincode` when the
 * customer denied GPS). The server decides serviceability — these responses are
 * never cached client-side because they are location-specific.
 */

/** Is Quick Commerce available at this location? */
export const getQuickCommerceServiceability = (params) =>
  api.get("/quick/serviceability", { params });

/** Stores that can deliver to this location, nearest first. */
export const getNearbyQuickCommerceVendors = (params) =>
  api.get("/quick/vendors/nearby", { params });

/**
 * Category-first home feed with per-category product counts restricted to
 * stores that can actually deliver here.
 */
export const getQuickCommerceCategoryFeed = (params) =>
  api.get("/quick/categories/feed", { params });

/**
 * Delivery fee, packaging fee and ETA for the current cart.
 *
 * The server computes these with the same functions checkout uses, so the
 * amounts shown are the amounts charged. The client must never derive them —
 * they depend on distance and per-store configuration.
 */
export const getQuickCommerceCheckoutEstimate = (payload) =>
  api.post("/quick/checkout/estimate", payload);
