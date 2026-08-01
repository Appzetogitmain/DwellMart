import { formatPrice } from "../../utils/helpers";

/**
 * Bulk pricing tier table + MOQ notice for wholesale-enabled products.
 *
 * Presentation only — all pricing decisions come from the shared preview engine
 * (`resolvePriceForQuantity`), and the backend remains authoritative at checkout.
 *
 * @param {Array}  tiers          Normalized [{ minQty, price }] ascending.
 * @param {object} pricing        Output of resolvePriceForQuantity for the current quantity.
 * @param {number} retailPrice    Base retail price, for the savings column.
 * @param {boolean} showRetailRow Whether to show the "Retail Price" row (hybrid products).
 */
const BulkPricingTable = ({ tiers = [], pricing, retailPrice, showRetailRow = true }) => {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;

  const appliedMinQty = pricing?.appliedTier?.minQty ?? null;
  const moq = pricing?.minimumQuantity ?? null;

  return (
    <div className="rounded-xl border border-border bg-surface-muted p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-content">Bulk Pricing</h3>
        {moq ? (
          <span className="text-xs font-semibold text-content-secondary">
            Minimum Order: {moq} Units
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {showRetailRow && Number.isFinite(Number(retailPrice)) && (
              <tr className="border-b border-border">
                <td className="py-2 pr-3 text-content-secondary">Retail Price</td>
                <td className="py-2 text-right font-semibold text-content">
                  {formatPrice(retailPrice)}
                </td>
              </tr>
            )}
            {tiers.map((tier) => {
              const isApplied = appliedMinQty === tier.minQty;
              return (
                <tr
                  key={tier.minQty}
                  className={`border-b border-border last:border-0 ${
                    isApplied ? "bg-status-successBg" : ""
                  }`}
                >
                  <td className="py-2 pr-3 text-content-secondary">
                    {tier.minQty}+ units
                    {isApplied && (
                      <span className="ml-2 rounded-full bg-status-success px-2 py-0.5 text-[10px] font-bold text-content-inverse">
                        APPLIED
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2 text-right font-semibold ${
                      isApplied ? "text-status-success" : "text-content"
                    }`}
                  >
                    {formatPrice(tier.price)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pricing?.savings > 0 && (
        <p className="mt-3 text-sm font-bold text-status-success">
          You Save {formatPrice(pricing.savings)}
        </p>
      )}

      {pricing?.nextTier && pricing?.eligible && (
        <p className="mt-2 text-xs text-content-secondary">
          Buy {pricing.nextTier.minQty - (pricing.appliedTier?.minQty ?? 0) > 0
            ? `${pricing.nextTier.minQty} or more`
            : `${pricing.nextTier.minQty}+`}{" "}
          units to unlock {formatPrice(pricing.nextTier.price)} per unit.
        </p>
      )}
    </div>
  );
};

export default BulkPricingTable;
