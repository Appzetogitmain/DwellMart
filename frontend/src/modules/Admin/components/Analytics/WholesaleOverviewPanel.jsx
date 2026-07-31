import { useEffect, useState } from "react";
import { FiLayers, FiUsers, FiPackage, FiShoppingBag } from "react-icons/fi";
import { MdCurrencyRupee } from "react-icons/md";
import { formatPrice } from "../../../../shared/utils/helpers";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import { getWholesaleStats } from "../../services/adminService";

/**
 * Platform-wide wholesale marketplace overview for the Admin dashboard.
 *
 * Self-contained: fetches its own data and renders nothing at all when the
 * Wholesale Marketplace feature flag is off, so the existing retail dashboard
 * is completely unaffected.
 */
const WholesaleOverviewPanel = () => {
  const { settings, initialize: initializeSettings } = useSettingsStore();
  const wholesaleMarketplaceEnabled =
    settings?.features?.wholesaleMarketplaceEnabled === true;

  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    initializeSettings();
  }, []);

  useEffect(() => {
    if (!wholesaleMarketplaceEnabled) {
      setStats(null);
      return;
    }

    let cancelled = false;
    const fetchStats = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const res = await getWholesaleStats();
        const data = res?.data ?? res;
        if (!cancelled) setStats(data ?? null);
      } catch {
        if (!cancelled) {
          setStats(null);
          setHasError(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [wholesaleMarketplaceEnabled]);

  if (!wholesaleMarketplaceEnabled) return null;

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <p className="text-gray-500 text-sm">Loading wholesale metrics...</p>
      </div>
    );
  }

  if (hasError || !stats) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold text-gray-800 mb-1">Wholesale Marketplace</h2>
        <p className="text-sm text-gray-500">
          Wholesale metrics are unavailable right now.
        </p>
      </div>
    );
  }

  const cards = [
    {
      label: "Wholesale Vendors",
      value: stats.vendors?.wholesaleCapable ?? 0,
      icon: FiUsers,
      iconClass: "text-emerald-600",
      hint: `${stats.vendors?.wholesaleOnly ?? 0} wholesale-only · ${stats.vendors?.hybrid ?? 0} hybrid`,
    },
    {
      label: "Retail Vendors",
      value: stats.vendors?.retailOnly ?? 0,
      icon: FiUsers,
      iconClass: "text-blue-600",
      hint: "Retail channel only",
    },
    {
      label: "Wholesale Products",
      value: stats.products?.wholesaleProducts ?? 0,
      icon: FiPackage,
      iconClass: "text-purple-600",
      hint: `of ${stats.products?.totalProducts ?? 0} active products`,
    },
    {
      label: "Wholesale Orders",
      value: stats.orders?.wholesaleTotal ?? 0,
      icon: FiShoppingBag,
      iconClass: "text-orange-600",
      hint: `${stats.orders?.wholesale ?? 0} full · ${stats.orders?.mixed ?? 0} mixed`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FiLayers className="text-emerald-600 text-lg" />
        <h2 className="text-lg font-bold text-gray-800">Wholesale Marketplace</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">{card.label}</p>
                <Icon className={card.iconClass} />
              </div>
              <p className="text-2xl font-bold text-gray-800">{card.value}</p>
              <p className="text-xs text-gray-500 mt-2">{card.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Bulk Revenue</p>
            <MdCurrencyRupee className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatPrice(stats.revenue?.bulkRevenue ?? 0)}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {stats.revenue?.unitsSold ?? 0} units sold ·{" "}
            {formatPrice(stats.revenue?.customerSavings ?? 0)} customer savings
          </p>
        </div>

        {stats.topBulkProducts?.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 overflow-x-auto">
            <h3 className="text-base font-bold text-gray-800 mb-4">Top Bulk Products</h3>
            <table className="w-full text-sm min-w-[360px]">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-2 font-semibold">Product</th>
                  <th className="pb-2 font-semibold text-right">Units</th>
                  <th className="pb-2 font-semibold text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.topBulkProducts.map((product) => (
                  <tr
                    key={product.productId}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-2 text-gray-800 font-medium">{product.name}</td>
                    <td className="py-2 text-right text-gray-600">{product.unitsSold}</td>
                    <td className="py-2 text-right text-gray-800 font-semibold">
                      {formatPrice(product.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WholesaleOverviewPanel;
