import { useState, useEffect, useCallback } from "react";
import { FiTruck, FiInfo, FiClock, FiMapPin, FiShield, FiRefreshCw, FiZap } from "react-icons/fi";
import { motion } from "framer-motion";
import { formatPrice } from "../../../shared/utils/helpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { getVendorShippingRates } from "../services/vendorService";

const ShippingManagement = () => {
  const { vendor } = useVendorAuthStore();
  const [shippingRates, setShippingRates] = useState([]);
  const [adminConfig, setAdminConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const vendorId = vendor?.id || vendor?._id;

  const fetchRates = useCallback(async () => {
    if (!vendorId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await getVendorShippingRates();
      const payload = response?.data || response;
      const ratesList = Array.isArray(payload?.rates)
        ? payload.rates
        : Array.isArray(payload)
        ? payload
        : [];

      setShippingRates(ratesList);
      if (payload?.adminConfig) {
        setAdminConfig(payload.adminConfig);
      }
    } catch (err) {
      console.error("[ShippingManagement] Failed to fetch rates:", err);
      setError(err?.message || "Failed to load shipping rates. Please check your network and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view shipping information.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center gap-2.5">
            <FiTruck className="text-primary-600" />
            <span>Shipping Rates</span>
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            View applicable platform shipping rates and fulfillment rules configured by Dwell Mart Admin
          </p>
        </div>
        <button
          onClick={fetchRates}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors self-start sm:self-auto shadow-2xs disabled:opacity-60"
        >
          <FiRefreshCw className={isLoading ? "animate-spin" : ""} />
          <span>Refresh Rates</span>
        </button>
      </div>

      {/* Admin Notice Banner */}
      <div className="bg-primary-50/70 border border-primary-100/90 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-2xs">
        <div className="w-9 h-9 rounded-xl bg-primary-600/10 text-primary-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <FiShield className="text-lg" />
        </div>
        <div className="space-y-1 text-xs sm:text-sm">
          <h4 className="font-bold text-primary-950">Platform-Managed Shipping Configuration</h4>
          <p className="text-primary-900/90 leading-relaxed">
            Shipping rates are configured by the Dwell Mart Admin. You can view the applicable rates here, but rates cannot be modified from the Vendor Portal.
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-gray-800">Applicable Shipping & Delivery Rates</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Rates charged to customers at checkout based on fulfillment channel and distance
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full border border-gray-200">
            Read-Only
          </span>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          /* Error State */
          <div className="text-center py-12 px-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h3 className="text-base font-bold text-gray-800">Unable to load shipping rates</h3>
            <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">{error}</p>
            <button
              onClick={fetchRates}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-primary-700 transition-colors"
            >
              <FiRefreshCw />
              <span>Retry</span>
            </button>
          </div>
        ) : shippingRates.length === 0 ? (
          /* Empty State */
          <div className="text-center py-14 px-4 space-y-3">
            <div className="text-4xl text-gray-300">📦</div>
            <h3 className="text-base font-bold text-gray-800">No shipping rates configured</h3>
            <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
              Shipping rates will appear here once configured by the Dwell Mart Admin.
            </p>
          </div>
        ) : (
          /* Rates Table & List */
          <div className="divide-y divide-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50/80 text-xs uppercase font-semibold text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 sm:px-6 py-3.5">Fulfillment Method</th>
                    <th className="px-4 sm:px-6 py-3.5">Delivery Scope / Coverage</th>
                    <th className="px-4 sm:px-6 py-3.5">Rate / Delivery Fee</th>
                    <th className="px-4 sm:px-6 py-3.5">Free Shipping Above</th>
                    <th className="px-4 sm:px-6 py-3.5">Est. Transit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shippingRates.map((rate) => (
                    <tr key={rate._id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="font-semibold text-gray-800 flex items-center gap-2">
                          {rate.channel?.toLowerCase().includes("quick") ? (
                            <FiZap className="text-amber-500 text-base flex-shrink-0" />
                          ) : (
                            <FiTruck className="text-primary-600 text-base flex-shrink-0" />
                          )}
                          <span>{rate.name}</span>
                        </div>
                        {rate.channel && (
                          <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                            {rate.channel}
                          </span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <FiMapPin className="text-gray-400 flex-shrink-0 text-xs" />
                          <span className="font-medium">{rate.scope || "All Serviced Pincodes"}</span>
                        </div>
                        {rate.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{rate.description}</p>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className="font-bold text-gray-900 text-base">
                          {formatPrice(rate.rate)}
                        </span>
                        {rate.perKmFee > 0 && (
                          <span className="text-xs text-gray-500 ml-1">
                            + {formatPrice(rate.perKmFee)}/km
                          </span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        {rate.freeShippingThreshold > 0 ? (
                          <span className="inline-flex items-center font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg text-xs border border-emerald-100">
                            Orders ≥ {formatPrice(rate.freeShippingThreshold)}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs font-medium">Standard rate applies</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                          <FiClock className="text-gray-400" />
                          <span>{rate.estimatedDays || "Standard Transit"}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Quick Commerce Delivery Information Card */}
      <div className="bg-gradient-to-br from-amber-50/60 to-orange-50/40 border border-amber-200/70 rounded-2xl p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 text-amber-900 font-bold text-sm sm:text-base">
          <FiZap className="text-amber-600 text-lg" />
          <span>Quick Commerce Hyperlocal Coverage</span>
        </div>
        <p className="text-xs sm:text-sm text-amber-900/90 leading-relaxed">
          Quick Commerce delivery does not use country shipping zones. Delivery eligibility is automatically computed using your store&apos;s GPS pin and your configured service radius (e.g. 5 km). Customers outside your delivery radius cannot place 15–30 minute express orders from your store.
        </p>
        <div className="text-xs text-amber-800 font-medium pt-1">
          📍 You can adjust your store GPS pin and service radius anytime in <strong>Store Settings → Quick Commerce Settings</strong>.
        </div>
      </div>
    </motion.div>
  );
};

export default ShippingManagement;
