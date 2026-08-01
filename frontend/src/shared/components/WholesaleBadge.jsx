import { Badge } from "./ui";
import { useSettingsStore } from "../store/settingsStore";

/**
 * Canonical wholesale indicator.
 *
 * One component, one set of tokens, one copy standard — so every surface
 * (orders, product cards, storefronts, admin lists) renders the same badge
 * instead of ad hoc variants.
 *
 * Renders nothing for plain retail records, so callers can mount it
 * unconditionally without null checks.
 *
 * @param {'retail'|'wholesale'|'mixed'} orderType Classification from the API.
 * @param {'order'|'item'|'product'|'vendor'} context Wording context.
 * @param {'sm'|'md'} size Badge size.
 */
const WholesaleBadge = ({ orderType, context = "order", size = "sm", className = "" }) => {
  const settings = useSettingsStore((state) => state.settings);
  const wholesaleMarketplaceEnabled = settings?.features?.wholesaleMarketplaceEnabled === true;

  if ((context === "product" || context === "vendor") && !wholesaleMarketplaceEnabled) {
    return null;
  }

  const normalized = String(orderType || "retail").toLowerCase();
  if (normalized !== "wholesale" && normalized !== "mixed") return null;

  const LABELS = {
    item: "Bulk",
    product: "Wholesale Available",
    vendor: "Wholesale Seller",
    order: normalized === "mixed" ? "Partial Wholesale" : "Wholesale Order",
  };

  return (
    <Badge variant="success" size={size} className={className}>
      {LABELS[context] ?? LABELS.order}
    </Badge>
  );
};

/**
 * Convenience wrapper for products — derives the badge from a product
 * document's `wholesaleEnabled` flag so callers never repeat the mapping.
 */
export const ProductWholesaleBadge = ({ product, size = "sm", className = "" }) => (
  <WholesaleBadge
    orderType={product?.wholesaleEnabled === true ? "wholesale" : "retail"}
    context="product"
    size={size}
    className={className}
  />
);

/**
 * Convenience wrapper for vendors — derives the badge from a vendor document's
 * selling channels.
 */
export const VendorWholesaleBadge = ({ vendor, size = "sm", className = "" }) => (
  <WholesaleBadge
    orderType={vendor?.sellingChannels?.wholesale?.enabled === true ? "wholesale" : "retail"}
    context="vendor"
    size={size}
    className={className}
  />
);

export default WholesaleBadge;
