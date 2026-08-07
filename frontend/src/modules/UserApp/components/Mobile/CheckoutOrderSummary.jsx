import { useState, useEffect } from "react";
import { FiShoppingBag, FiZap, FiPackage, FiTruck, FiCheck } from "react-icons/fi";
import { formatPrice } from "../../../../shared/utils/helpers";
import Price from "../../../../shared/components/Price";
import { formatVariantLabel, getVariantSignature } from "../../../../shared/utils/variant";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../../hooks/useDynamicTranslation";
import { resolvePriceForQuantity } from "../../../../shared/utils/resolvePriceForQuantity";

/** Preview unit price for a cart line, mirroring the backend pricing engine. */
const lineUnitPrice = (item) =>
  resolvePriceForQuantity(
    {
      retailEnabled: item?.retailEnabled,
      wholesaleEnabled: item?.wholesaleEnabled,
      wholesale: item?.wholesale,
    },
    Number(item?.price) || 0,
    Number(item?.quantity) || 0,
    { vendorWholesaleEnabled: item?.vendorWholesaleEnabled !== false }
  ).unitPrice;

const FULFILLMENT_META = {
  quick_commerce: {
    label: "Quick Commerce",
    icon: FiZap,
    promise: "ETA 15–25 min",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
    headerBg: "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200",
    iconClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15",
  },
  retail: {
    label: "Standard Retail",
    icon: FiPackage,
    promise: "Delivery 4–6 Days",
    badgeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30",
    headerBg: "bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200",
    iconClass: "text-blue-600 dark:text-blue-400 bg-blue-500/15",
  },
  wholesale: {
    label: "Wholesale B2B",
    icon: FiTruck,
    promise: "Lead Time 5–7 Business Days",
    badgeClass: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30",
    headerBg: "bg-purple-50/80 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200",
    iconClass: "text-purple-600 dark:text-purple-400 bg-purple-500/15",
  },
};

const OrderSummary = ({
  fulfillmentGroups = [],
  itemsByVendor = [],
  total,
  discount,
  shipping = 0,
  tax = 0,
  finalTotal,
  bulkSavings = 0,
  packagingFee = 0,
  quickEstimate = null,
}) => {
  const { getTranslatedText: t } = usePageTranslation([
    "Order Summary",
    "Subtotal",
    "Discount",
    "Shipping",
    "Delivery Fee",
    "Packaging Fee",
    "FREE",
    "Tax",
    "Total",
    "Bulk Savings"
  ]);

  const { translateArray } = useDynamicTranslation();
  const [translatedGroups, setTranslatedGroups] = useState([]);

  // Use fulfillmentGroups if present, else build fallback from itemsByVendor
  const groupsToUse = fulfillmentGroups.length > 0 ? fulfillmentGroups : [
    {
      fulfillmentType: 'retail',
      vendors: itemsByVendor,
      subtotal: total,
    }
  ];

  useEffect(() => {
    const translateContent = async () => {
      const translated = await Promise.all(groupsToUse.map(async (fg) => {
        const translatedVendors = await Promise.all(fg.vendors.map(async (vGroup) => {
          const translatedItems = await translateArray(vGroup.items, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
          const vendorNameRes = await translateArray([{ name: vGroup.vendorName }], ['name']);
          return {
            ...vGroup,
            vendorName: vendorNameRes[0]?.name || vGroup.vendorName,
            items: translatedItems,
          };
        }));
        return { ...fg, vendors: translatedVendors };
      }));
      setTranslatedGroups(translated);
    };
    translateContent();
  }, [groupsToUse, translateArray]);

  const displayGroups = translatedGroups.length > 0 ? translatedGroups : groupsToUse;

  // Breakdown amounts by fulfillment type — isolated directly per group
  const qcGroup = displayGroups.find(g => g.fulfillmentType === 'quick_commerce');
  const retailGroup = displayGroups.find(g => g.fulfillmentType === 'retail');
  const wholesaleGroup = displayGroups.find(g => g.fulfillmentType === 'wholesale');

  const qcFee = qcGroup ? (quickEstimate?.available ? Number(quickEstimate.deliveryFee || 0) : Number(qcGroup.deliveryFee || 25)) : 0;
  const qcPkg = qcGroup ? (quickEstimate?.available ? Number(quickEstimate.packagingFee || 0) : Number(qcGroup.packagingFee || 5)) : 0;
  const retailShipping = retailGroup ? Number(retailGroup.deliveryFee ?? 70) : 0;
  const wholesaleFreight = wholesaleGroup ? Number(wholesaleGroup.deliveryFee ?? 150) : 0;

  return (
    <div className="rounded-2xl p-4 bg-surface border border-border shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="text-base font-extrabold text-content flex items-center gap-2">
          <FiShoppingBag className="text-brand-primary" />
          {t('Order Summary')}
        </h3>
        <span className="text-xs font-bold text-content-secondary bg-surface-muted px-2.5 py-1 rounded-full border border-border">
          {displayGroups.length} Fulfillment Group{displayGroups.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Fulfillment Grouped Products ── */}
      <div className="space-y-4">
        {displayGroups.map((fg) => {
          const meta = FULFILLMENT_META[fg.fulfillmentType] || FULFILLMENT_META.retail;
          const Icon = meta.icon;

          return (
            <div key={fg.fulfillmentType} className="rounded-xl border border-border overflow-hidden bg-surface-card">
              {/* Fulfillment Section Header */}
              <div className={`flex items-center justify-between px-3 py-2 border-b text-xs font-bold ${meta.headerBg}`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1 rounded-md ${meta.iconClass}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-extrabold">{meta.label}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-extrabold ${meta.badgeClass}`}>
                  {meta.promise}
                </span>
              </div>

              {/* Vendors & Products inside this group */}
              <div className="p-3 space-y-3">
                {fg.vendors.map((vendorGroup) => (
                  <div key={vendorGroup.vendorId} className="space-y-2">
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-border/60">
                      <span className="font-extrabold text-content-secondary uppercase tracking-wider text-[11px]">
                        {vendorGroup.vendorName}
                      </span>
                      <span className="font-bold text-content text-xs">
                        <Price amount={vendorGroup.subtotal} />
                      </span>
                    </div>

                    <div className="space-y-2">
                      {vendorGroup.items.map((item, itemIndex) => (
                        <div
                          key={`${item.id}-${itemIndex}-${getVariantSignature(item?.variant || {})}`}
                          className="flex items-center gap-2.5 text-xs bg-surface-muted/60 p-2 rounded-lg border border-border/40"
                        >
                          <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-content truncate text-xs">{item.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-content-secondary text-[11px]">
                              <span><Price amount={lineUnitPrice(item)} /> × {item.quantity}</span>
                              {fg.fulfillmentType === 'wholesale' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-500/15 px-1.5 py-0.2 rounded border border-purple-500/30">
                                  <FiCheck className="text-[9px]" /> MOQ Met
                                </span>
                              )}
                            </div>
                            {formatVariantLabel(item?.variant) && (
                              <p className="text-[10px] text-content-muted">{formatVariantLabel(item?.variant)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Granular Grand Summary Breakdown ── */}
      <div className="space-y-2 text-xs pt-3 border-t border-border">
        <div className="flex justify-between text-content font-medium">
          <span>Products ({displayGroups.reduce((acc, g) => acc + g.itemCount, 0)} items)</span>
          <Price amount={total} />
        </div>

        {qcGroup && (
          <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-medium">
            <span>⚡ Quick Commerce Delivery</span>
            <span>{qcFee === 0 ? <span className="font-bold uppercase text-emerald-600 dark:text-emerald-300">FREE</span> : <Price amount={qcFee} />}</span>
          </div>
        )}

        {retailGroup && (
          <div className="flex justify-between text-blue-700 dark:text-blue-400 font-medium">
            <span>📦 Retail Shipping</span>
            <span>{retailShipping === 0 ? <span className="font-bold uppercase text-blue-600 dark:text-blue-300">FREE</span> : <Price amount={retailShipping} />}</span>
          </div>
        )}

        {wholesaleGroup && (
          <div className="flex justify-between text-purple-700 dark:text-purple-400 font-medium">
            <span>🏭 Wholesale Freight</span>
            <span>{wholesaleFreight === 0 ? <span className="font-bold uppercase text-purple-600 dark:text-purple-300">Calculated</span> : <Price amount={wholesaleFreight} />}</span>
          </div>
        )}

        {qcPkg > 0 && (
          <div className="flex justify-between text-content-secondary font-medium">
            <span>Quick Commerce Packaging</span>
            <Price amount={qcPkg} />
          </div>
        )}

        {bulkSavings > 0 && (
          <div className="flex justify-between text-status-success font-semibold">
            <span>{t('Bulk Savings')}</span>
            <Price amount={bulkSavings} prefix="-" />
          </div>
        )}

        {discount > 0 && (
          <div className="flex justify-between text-status-success font-semibold">
            <span>{t('Discount')}</span>
            <Price amount={discount} prefix="-" />
          </div>
        )}

        <div className="flex justify-between text-content-secondary font-medium">
          <span>Estimated GST & Taxes</span>
          <Price amount={tax} />
        </div>

        <div className="flex justify-between text-base font-extrabold text-content pt-2.5 border-t border-border">
          <span>Grand Total</span>
          <Price amount={finalTotal} className="text-brand-primary" />
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
