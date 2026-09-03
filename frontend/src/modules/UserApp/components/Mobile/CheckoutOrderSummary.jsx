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
    badgeClass: "bg-white text-emerald-800 border border-emerald-300 font-bold shadow-xs",
    headerBg: "bg-emerald-50 border-emerald-100 text-slate-900",
    iconClass: "text-emerald-700 bg-emerald-100",
  },
  retail: {
    label: "Standard Retail",
    icon: FiPackage,
    promise: "Delivery 4–6 Days",
    badgeClass: "bg-white text-slate-800 border border-slate-300 font-bold shadow-xs",
    headerBg: "bg-slate-100 border-slate-200 text-slate-900",
    iconClass: "text-blue-700 bg-blue-100",
  },
  wholesale: {
    label: "Wholesale B2B",
    icon: FiTruck,
    promise: "Lead Time 5–7 Business Days",
    badgeClass: "bg-white text-purple-800 border border-purple-300 font-bold shadow-xs",
    headerBg: "bg-purple-50 border-purple-100 text-slate-900",
    iconClass: "text-purple-700 bg-purple-100",
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

  const qcFee = qcGroup ? (quickEstimate?.available ? Number(quickEstimate.deliveryFee || 0) : Number(qcGroup.deliveryFee || 0)) : 0;
  const qcPkg = qcGroup ? (quickEstimate?.available ? Number(quickEstimate.packagingFee || 0) : Number(qcGroup.packagingFee || 0)) : 0;
  const retailShipping = retailGroup ? Number(retailGroup.deliveryFee || 0) : 0;
  const wholesaleFreight = wholesaleGroup ? Number(wholesaleGroup.deliveryFee || 0) : 0;

  return (
    <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <FiShoppingBag className="text-brand-primary text-lg" />
          {t('Order Summary')}
        </h3>
        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
          {displayGroups.length} Fulfillment Group{displayGroups.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Fulfillment Grouped Products ── */}
      <div className="space-y-4">
        {displayGroups.map((fg) => {
          const meta = FULFILLMENT_META[fg.fulfillmentType] || FULFILLMENT_META.retail;
          const Icon = meta.icon;

          return (
            <div key={fg.fulfillmentType} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
              {/* Fulfillment Section Header */}
              <div className={`flex items-center justify-between px-3.5 py-2.5 border-b text-xs font-bold ${meta.headerBg}`}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${meta.iconClass}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-extrabold text-slate-900">{meta.label}</span>
                </div>
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-bold ${meta.badgeClass}`}>
                  {meta.promise}
                </span>
              </div>

              {/* Vendors & Products inside this group */}
              <div className="p-3 space-y-3">
                {fg.vendors.map((vendorGroup) => (
                  <div key={vendorGroup.vendorId} className="space-y-2">
                    <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-100">
                      <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[11px]">
                        {vendorGroup.vendorName}
                      </span>
                      <span className="font-bold text-slate-900 text-xs">
                        <Price amount={vendorGroup.subtotal} />
                      </span>
                    </div>

                    <div className="space-y-2">
                      {vendorGroup.items.map((item, itemIndex) => (
                        <div
                          key={`${item.id}-${itemIndex}-${getVariantSignature(item?.variant || {})}`}
                          className="flex items-center gap-3 text-xs bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/70"
                        >
                          <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-slate-200 bg-white" />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-900 truncate text-xs">{item.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-slate-600 text-[11px]">
                              <span><Price amount={lineUnitPrice(item)} /> × {item.quantity}</span>
                              {fg.fulfillmentType === 'wholesale' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded border border-purple-200">
                                  <FiCheck className="text-[9px]" /> MOQ Met
                                </span>
                              )}
                            </div>
                            {formatVariantLabel(item?.variant) && (
                              <p className="text-[10px] text-slate-500">{formatVariantLabel(item?.variant)}</p>
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
      <div className="space-y-2.5 text-xs pt-3 border-t border-slate-200">
        <div className="flex justify-between text-slate-700 font-medium">
          <span>Products ({displayGroups.reduce((acc, g) => acc + g.itemCount, 0)} items)</span>
          <span className="font-bold text-slate-900"><Price amount={total} /></span>
        </div>

        {qcGroup && (
          <div className="flex justify-between text-slate-700 font-medium">
            <span>⚡ Quick Commerce Delivery</span>
            <span>{qcFee === 0 ? <span className="font-extrabold uppercase text-emerald-600">FREE</span> : <span className="font-bold text-slate-900"><Price amount={qcFee} /></span>}</span>
          </div>
        )}

        {retailGroup && (
          <div className="flex justify-between text-slate-700 font-medium">
            <span>📦 Retail Shipping</span>
            <span>{retailShipping === 0 ? <span className="font-extrabold uppercase text-emerald-600">FREE</span> : <span className="font-bold text-slate-900"><Price amount={retailShipping} /></span>}</span>
          </div>
        )}

        {wholesaleGroup && (
          <div className="flex justify-between text-slate-700 font-medium">
            <span>🏭 Wholesale Freight</span>
            <span>{wholesaleFreight === 0 ? <span className="font-bold uppercase text-slate-700">Calculated</span> : <span className="font-bold text-slate-900"><Price amount={wholesaleFreight} /></span>}</span>
          </div>
        )}

        {qcPkg > 0 && (
          <div className="flex justify-between text-slate-600 font-medium">
            <span>Quick Commerce Packaging</span>
            <span className="font-bold text-slate-900"><Price amount={qcPkg} /></span>
          </div>
        )}

        {bulkSavings > 0 && (
          <div className="flex justify-between text-emerald-600 font-semibold">
            <span>{t('Bulk Savings')}</span>
            <Price amount={bulkSavings} prefix="-" />
          </div>
        )}

        {discount > 0 && (
          <div className="flex justify-between text-emerald-600 font-semibold">
            <span>{t('Discount')}</span>
            <Price amount={discount} prefix="-" />
          </div>
        )}

        <div className="flex justify-between text-slate-600 font-medium">
          <span>Estimated GST & Taxes</span>
          <span className="font-bold text-slate-900"><Price amount={tax} /></span>
        </div>

        <div className="flex justify-between items-center text-base font-extrabold text-slate-900 pt-3 border-t border-slate-200">
          <span>Grand Total</span>
          <Price amount={finalTotal} className="text-amber-600 text-lg font-extrabold" />
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
