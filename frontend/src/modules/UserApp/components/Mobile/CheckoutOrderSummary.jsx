import { useState, useEffect } from "react";
import { FiShoppingBag } from "react-icons/fi";
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

const OrderSummary = ({ itemsByVendor, total, discount, shipping, tax, finalTotal, bulkSavings = 0 }) => {
  const { getTranslatedText: t } = usePageTranslation([
    "Order Summary",
    "Subtotal",
    "Discount",
    "Shipping",
    "FREE",
    "Tax",
    "Total",
    "Bulk Savings"
  ]);

  const { translateArray } = useDynamicTranslation();
  const [translatedItemsByVendor, setTranslatedItemsByVendor] = useState([]);

  useEffect(() => {
    const translateContent = async () => {
      const translated = await Promise.all(itemsByVendor.map(async (vendorGroup) => {
        const translatedItems = await translateArray(vendorGroup.items, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
        return {
          ...vendorGroup,
          vendorName: await translateArray([{ name: vendorGroup.vendorName }], ['name']).then(res => res[0]?.name || vendorGroup.vendorName),
          items: translatedItems
        };
      }));
      setTranslatedItemsByVendor(translated);
    };
    translateContent();
  }, [itemsByVendor, translateArray]);

  const displayGroups = translatedItemsByVendor.length > 0 ? translatedItemsByVendor : itemsByVendor;
  return (
    <div className="glass-card rounded-xl p-4 bg-surface border border-border">
      <h3 className="text-base font-bold text-content mb-3">{t('Order Summary')}</h3>
      <div className="space-y-3 mb-4">
        {displayGroups.map((vendorGroup) => (
          <div key={vendorGroup.vendorId} className="space-y-2 mb-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-muted rounded-lg border border-border shadow-sm">
              <div className="w-5 h-5 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
                <FiShoppingBag className="text-black text-[10px]" />
              </div>
              <span className="text-sm font-bold text-content flex-1">{vendorGroup.vendorName}</span>
              <span className="text-xs font-semibold text-brand-primary bg-surface px-2 py-0.5 rounded-md border border-border">
                <Price amount={vendorGroup.subtotal} />
              </span>
            </div>
            <div className="space-y-2 pl-2">
              {vendorGroup.items.map((item, itemIndex) => (
                <div
                  key={`${item.id}-${itemIndex}-${getVariantSignature(item?.variant || {})}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-content truncate text-xs">{item.name}</p>
                    <p className="text-content-secondary text-xs">
                      <Price amount={lineUnitPrice(item)} /> x {item.quantity}
                    </p>
                    {formatVariantLabel(item?.variant) && (
                      <p className="text-[11px] text-content-muted">{formatVariantLabel(item?.variant)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-content-secondary">
          <span>{t('Subtotal')}</span>
          <Price amount={total} />
        </div>
        {bulkSavings > 0 && (
          <div className="flex justify-between text-status-success font-semibold">
            <span>{t('Bulk Savings')}</span>
            <Price amount={bulkSavings} prefix="-" />
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-status-success">
            <span>{t('Discount')}</span>
            <Price amount={discount} prefix="-" />
          </div>
        )}
        <div className="flex justify-between text-content-secondary">
          <span>{t('Shipping')}</span>
          <span>
            {shipping === 0 ? <span className="text-status-success font-semibold">{t('FREE')}</span> : <Price amount={shipping} />}
          </span>
        </div>
        <div className="flex justify-between text-content-secondary">
          <span>{t('Tax')}</span>
          <Price amount={tax} />
        </div>
        <div className="flex justify-between text-lg font-bold text-content pt-2 border-t border-border">
          <span>{t('Total')}</span>
          <Price amount={finalTotal} className="text-brand-primary" />
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;

