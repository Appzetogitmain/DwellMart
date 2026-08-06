import { useEffect } from "react";
import { FiPlus, FiTrash2, FiPackage } from "react-icons/fi";
import { useSettingsStore } from "../store/settingsStore";

/**
 * Shared Wholesale & Bulk Pricing editor.
 *
 * Rendered inside the Vendor Add Product, Vendor Edit Product, and Admin Product
 * forms so the selling-channel toggles, MOQ fields, and bulk pricing tier rows
 * are defined exactly once.
 *
 * Fully controlled: the parent owns state and passes `value` + `onChange`.
 *
 * @param {object}   value              { retailEnabled, wholesaleEnabled, wholesale: { moqEnabled, moq, priceTiers } }
 * @param {function} onChange           Receives the next value object.
 * @param {number|string} retailPrice   Current product retail price, for tier validation hints.
 * @param {number|string} stockQuantity Current stock, for MOQ validation hints.
 * @param {boolean}  vendorWholesaleEnabled  Whether the owning vendor allows wholesale.
 * @param {boolean}  disabled           Renders the section read-only while saving.
 */
const WholesalePricingSection = ({
  value,
  onChange,
  retailPrice,
  stockQuantity,
  vendorWholesaleEnabled = false,
  quickCommerceProductEnabled = false,
  onQuickCommerceToggle,
  vendorQuickCommerceEnabled = false,
  disabled = false,
}) => {
  const { settings, initialize: initSettings } = useSettingsStore();

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  const wholesaleMarketplaceEnabled = settings?.features?.wholesaleMarketplaceEnabled === true;
  const quickCommerceMarketplaceEnabled = settings?.features?.quickCommerceEnabled === true;

  if (!wholesaleMarketplaceEnabled && !quickCommerceMarketplaceEnabled) return null;

  const retailEnabled = value?.retailEnabled !== false;
  const wholesaleEnabled = value?.wholesaleEnabled === true;
  const moqEnabled = value?.wholesale?.moqEnabled === true;
  const moq = value?.wholesale?.moq ?? "";
  const priceTiers = Array.isArray(value?.wholesale?.priceTiers)
    ? value.wholesale.priceTiers
    : [];

  const numericRetailPrice = Number(retailPrice);
  const numericStock = Number(stockQuantity);

  // Always emit a fully-normalized state object so the parent never receives
  // partially-populated wholesale data.
  const emit = ({ wholesale: wholesalePatch, ...channelPatch }) => {
    onChange({
      retailEnabled,
      wholesaleEnabled,
      ...channelPatch,
      wholesale: {
        moqEnabled,
        moq,
        priceTiers,
        ...(wholesalePatch || {}),
      },
    });
  };

  const updateWholesale = (patch) => emit({ wholesale: patch });

  const handleTierChange = (index, field, fieldValue) => {
    const nextTiers = priceTiers.map((tier, i) =>
      i === index ? { ...tier, [field]: fieldValue } : tier
    );
    updateWholesale({ priceTiers: nextTiers });
  };

  const handleAddTier = () => {
    updateWholesale({ priceTiers: [...priceTiers, { minQty: "", price: "" }] });
  };

  const handleRemoveTier = (index) => {
    updateWholesale({ priceTiers: priceTiers.filter((_, i) => i !== index) });
  };

  // Client-side hints mirroring the backend rules (backend remains authoritative).
  const tierWarning = (tier, index) => {
    const qty = Number(tier.minQty);
    const price = Number(tier.price);
    if (tier.minQty === "" || tier.price === "") return null;
    if (!Number.isInteger(qty) || qty < 1) return "Quantity must be a whole number of 1 or more.";
    if (price < 0) return "Price cannot be negative.";
    if (Number.isFinite(numericRetailPrice) && numericRetailPrice > 0 && price >= numericRetailPrice) {
      return "Bulk price must be lower than the retail price.";
    }
    const duplicate = priceTiers.some((other, i) => i !== index && Number(other.minQty) === qty);
    if (duplicate) return "Duplicate minimum quantity.";
    return null;
  };

  const moqWarning = (() => {
    if (!moqEnabled || moq === "" || moq === null) return null;
    const numericMoq = Number(moq);
    if (!Number.isInteger(numericMoq) || numericMoq < 1) {
      return "Minimum order quantity must be a whole number of 1 or more.";
    }
    if (Number.isFinite(numericStock) && numericMoq > numericStock) {
      return `Minimum order quantity cannot exceed available stock (${numericStock}).`;
    }
    return null;
  })();

  const channelWarning = !retailEnabled && !wholesaleEnabled && !quickCommerceProductEnabled
    ? "At least one selling channel (Retail, Wholesale, or Quick Commerce) must be enabled."
    : null;

  return (
    <div>
      <h2 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
        <FiPackage className="text-lg" />
        Selling Channels &amp; Bulk Pricing
      </h2>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 p-3 border border-gray-200 rounded-lg">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={retailEnabled}
              disabled={disabled}
              onChange={(e) => emit({ retailEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Retail
          </label>
          {wholesaleMarketplaceEnabled && (
            <label
              className={`flex items-center gap-2 text-sm ${
                vendorWholesaleEnabled ? "text-gray-700 cursor-pointer" : "text-gray-400 cursor-not-allowed"
              }`}
            >
              <input
                type="checkbox"
                checked={wholesaleEnabled}
                disabled={disabled || !vendorWholesaleEnabled}
                onChange={(e) => emit({ wholesaleEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
              />
              Wholesale
            </label>
          )}
          {quickCommerceMarketplaceEnabled && onQuickCommerceToggle && (
            <label
              className={`flex items-center gap-2 text-sm ${
                vendorQuickCommerceEnabled ? "text-gray-700 cursor-pointer" : "text-gray-400 cursor-not-allowed"
              }`}
            >
              <input
                type="checkbox"
                checked={quickCommerceProductEnabled}
                disabled={disabled || !vendorQuickCommerceEnabled}
                onChange={(e) => onQuickCommerceToggle(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
              />
              Quick Commerce
            </label>
          )}
        </div>

        {wholesaleMarketplaceEnabled && !vendorWholesaleEnabled && (
          <p className="text-xs text-gray-500">
            Enable the Wholesale Marketplace channel in the vendor&apos;s selling channels to offer bulk pricing on products.
          </p>
        )}

        {channelWarning && (
          <p className="text-xs font-medium text-red-600">{channelWarning}</p>
        )}

        {wholesaleEnabled && (
          <div className="space-y-4 border-t border-gray-200 pt-4">
            {/* Minimum Order Quantity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={moqEnabled}
                    disabled={disabled}
                    onChange={(e) => updateWholesale({ moqEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Require a Minimum Order Quantity
                </label>
                {moqEnabled && (
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={moq}
                    disabled={disabled}
                    onChange={(e) => updateWholesale({ moq: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm mt-1"
                    placeholder="e.g. 20"
                  />
                )}
                {moqWarning && <p className="text-xs text-red-600 mt-1">{moqWarning}</p>}
              </div>
            </div>

            {/* Bulk pricing tiers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-gray-700">
                  Bulk Pricing Tiers <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddTier}
                  disabled={disabled}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 disabled:opacity-50"
                >
                  <FiPlus />
                  Add Tier
                </button>
              </div>

              {priceTiers.length === 0 ? (
                <p className="text-xs text-gray-500 p-3 border border-dashed border-gray-300 rounded-lg">
                  Add at least one pricing tier, e.g. 10+ units at a lower unit price.
                </p>
              ) : (
                <div className="space-y-2">
                  {priceTiers.map((tier, index) => {
                    const warning = tierWarning(tier, index);
                    return (
                      <div key={index}>
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <label className="block text-[11px] text-gray-500 mb-1">
                              Minimum Quantity
                            </label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={tier.minQty ?? ""}
                              disabled={disabled}
                              onChange={(e) => handleTierChange(index, "minQty", e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              placeholder="10"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-[11px] text-gray-500 mb-1">
                              Unit Price
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={tier.price ?? ""}
                              disabled={disabled}
                              onChange={(e) => handleTierChange(index, "price", e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              placeholder="950"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveTier(index)}
                            disabled={disabled}
                            aria-label={`Remove pricing tier ${index + 1}`}
                            className="p-2 mb-[1px] text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                        {warning && <p className="text-xs text-red-600 mt-1">{warning}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                The highest matching tier is applied automatically. Every bulk price must be lower than the retail price.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WholesalePricingSection;
