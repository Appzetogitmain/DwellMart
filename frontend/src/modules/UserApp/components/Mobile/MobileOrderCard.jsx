import { Link } from 'react-router-dom';
import { FiPackage, FiChevronRight, FiCalendar, FiShoppingBag } from 'react-icons/fi';
import { MdCurrencyRupee } from 'react-icons/md';
import { formatPrice } from '../../../../shared/utils/helpers';
import { motion } from 'framer-motion';
import { formatVariantLabel } from '../../../../shared/utils/variant';
import WholesaleBadge from '../../../../shared/components/WholesaleBadge';
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../../hooks/useDynamicTranslation";
import { useState, useEffect } from "react";

import ExperienceBadge from '../../../../shared/components/ExperienceBadge';

const MobileOrderCard = ({ order }) => {
  const { getTranslatedText: t } = usePageTranslation([
    "Order",
    "Items",
    "item",
    "items",
    "Variant",
    "variant selections",
    "Total",
    "View Details",
    "Vendor",
    "Vendors",
    "Pending",
    "Processing",
    "Shipped",
    "Delivered",
    "Cancelled"
  ]);

  const { translateArray } = useDynamicTranslation();
  const [translatedVariantLabels, setTranslatedVariantLabels] = useState([]);

  useEffect(() => {
    const translateVariants = async () => {
      const rawLabels = Array.isArray(order?.items)
        ? order.items.map((item) => formatVariantLabel(item?.variant)).filter(Boolean)
        : [];
      if (rawLabels.length > 0) {
        const translated = await translateArray(rawLabels.map(l => ({ name: l })), ['name']);
        setTranslatedVariantLabels(translated.map(item => item.name));
      }
    };
    translateVariants();
  }, [order, translateArray]);

  const variantLabels = translatedVariantLabels.length > 0
    ? translatedVariantLabels
    : (Array.isArray(order?.items)
      ? order.items.map((item) => formatVariantLabel(item?.variant)).filter(Boolean)
      : []);

  const variantSummary = variantLabels.length === 1
    ? variantLabels[0]
    : variantLabels.length > 1
      ? `${variantLabels.length} ${t("variant selections")}`
      : '';

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return 'text-status-success bg-status-successBg border border-status-success/30';
      case 'shipped':
        return 'text-status-info bg-status-infoBg border border-status-info/30';
      case 'processing':
        return 'text-status-warning bg-status-warningBg border border-status-warning/30';
      case 'cancelled':
        return 'text-status-error bg-status-errorBg border border-status-error/30';
      default:
        return 'text-content-secondary bg-surface-muted border border-border';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-4 mb-4 bg-surface border border-border"
    >
      <Link to={`/orders/${order.id}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-brand-primary text-black flex items-center justify-center flex-shrink-0">
              <FiPackage className="text-xl" />
            </div>
            <div>
              <h3 className="font-bold text-content text-base">{t('Order')} #{order.id}</h3>
              <p className="text-xs text-content-muted flex items-center gap-1 mt-0.5">
                <FiCalendar className="text-xs" />
                {new Date(order.date || order.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <FiChevronRight className="text-content-muted text-xl" />
        </div>

        <div className="space-y-2 mb-3">
          {/* Vendor Count */}
          {order.vendorItems && order.vendorItems.length > 0 && (
            <div className="flex items-center gap-2 px-2 py-1 bg-surface-muted border border-border rounded-lg mb-2">
              <FiShoppingBag className="text-brand-primary text-xs" />
              <span className="text-xs font-semibold text-content">
                {order.vendorItems.length} {order.vendorItems.length === 1 ? t('Vendor') : t('Vendors')}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-content-secondary">{t('Items')}</span>
            <span className="text-sm font-semibold text-content">
              {order.items?.length || 0} {(order.items?.length || 0) === 1 ? t('item') : t('items')}
            </span>
          </div>
          {variantSummary && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-content-secondary">{t('Variant')}</span>
              <span className="text-xs font-semibold text-content-secondary text-right max-w-[62%] truncate">
                {variantSummary}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-content-secondary flex items-center gap-1">
              <MdCurrencyRupee className="text-xs" />
              {t('Total')}
            </span>
            <span className="text-base font-bold text-brand-primary">
              {formatPrice(order.total || order.amount || 0)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${getStatusColor(
                order.status
              )}`}
            >
              {t(order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1).toLowerCase() : 'Pending')}
            </span>
            <ExperienceBadge experience={order.experience || (order.orderType === 'wholesale' ? 'wholesale' : 'marketplace')} />
            <WholesaleBadge orderType={order.orderType} />
          </div>
          <span className="text-xs text-content-muted">{t('View Details')}</span>
        </div>
      </Link>
    </motion.div>
  );
};

export default MobileOrderCard;

