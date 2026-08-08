/**
 * DashboardWidgets — capability-driven widget registry.
 *
 * Each widget is a self-contained component. The Dashboard renders them
 * dynamically via caps.dashboardLayout.left/right arrays.
 *
 * Adding a new widget: add a component here + add its key to VendorCapabilities.dashboardLayout.
 * Zero JSX changes required elsewhere.
 */
import { useNavigate } from "react-router-dom";
import { FiZap, FiAlertTriangle, FiList, FiTrendingUp, FiUsers, FiPackage, FiShoppingBag, FiBarChart2, FiFileText, FiLayers } from "react-icons/fi";
import { StatusBadge } from "../../../shared/components/Dashboard";
import { Button } from "../../../shared/components/ui";
import { formatPrice } from "../../../shared/utils/helpers";

/* ── Shared skeleton ──────────────────────────────────────────────────────── */
const WidgetCard = ({ title, icon: Icon, children, action, actionLabel, actionRoute }) => {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="text-primary-600 text-lg" />}
          <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
        </div>
        {actionRoute && (
          <button
            onClick={() => navigate(actionRoute)}
            className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
          >
            {actionLabel || "View All"}
          </button>
        )}
      </div>
      {children}
    </div>
  );
};

/* ── QC: Live Orders ──────────────────────────────────────────────────────── */
export const LiveOrdersWidget = ({ orders = [], isLoading }) => (
  <WidgetCard title="Live Orders" icon={FiZap} actionRoute="/vendor/orders" actionLabel="All Orders">
    {isLoading ? (
      <div className="space-y-2">
        {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-lg" />)}
      </div>
    ) : orders.length > 0 ? (
      <div className="space-y-2">
        {orders.slice(0, 4).map(order => (
          <div key={order._id} className="flex items-center justify-between p-2 bg-orange-50 rounded-lg border border-orange-100">
            <div>
              <p className="text-xs font-semibold text-gray-800">{order.orderId ?? order._id?.slice(-8)}</p>
              <p className="text-[10px] text-gray-500">{new Date(order.createdAt).toLocaleTimeString()}</p>
            </div>
            <StatusBadge status={order.status} size="xs" />
          </div>
        ))}
      </div>
    ) : (
      <p className="text-xs text-gray-500 text-center py-4">No live orders right now</p>
    )}
  </WidgetCard>
);

/* ── QC: Preparation Queue ───────────────────────────────────────────────── */
export const PreparationQueueWidget = ({ orders = [], isLoading }) => {
  const inPrep = orders.filter(o => ["confirmed", "processing", "preparing"].includes(o.status));
  return (
    <WidgetCard title="Preparation Queue" icon={FiList} actionRoute="/vendor/orders">
      {isLoading ? (
        <div className="h-16 bg-gray-100 animate-pulse rounded-lg" />
      ) : inPrep.length > 0 ? (
        <div className="space-y-2">
          {inPrep.slice(0, 3).map(order => (
            <div key={order._id} className="flex items-center justify-between p-2 bg-yellow-50 rounded-lg border border-yellow-100">
              <p className="text-xs font-semibold text-gray-800">{order.orderId ?? order._id?.slice(-8)}</p>
              <span className="text-[10px] px-2 py-0.5 bg-yellow-200 text-yellow-800 rounded-full font-medium">Preparing</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-4 gap-1">
          <FiZap className="text-2xl text-gray-300" />
          <p className="text-xs text-gray-500">Queue is clear!</p>
        </div>
      )}
    </WidgetCard>
  );
};

/* ── QC: Inventory Alerts ────────────────────────────────────────────────── */
export const InventoryAlertsWidget = ({ products = [] }) => {
  const lowStock = products.filter(p => p.stock === "low_stock" || p.stockQuantity <= 5);
  return (
    <WidgetCard title="Inventory Alerts" icon={FiAlertTriangle} actionRoute="/vendor/stock-management" actionLabel="Manage">
      {lowStock.length > 0 ? (
        <div className="space-y-2">
          {lowStock.slice(0, 4).map(p => (
            <div key={p._id} className="flex items-center justify-between p-2 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs font-semibold text-gray-800 truncate max-w-[60%]">{p.name}</p>
              <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                {p.stockQuantity} left
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-4 gap-1">
          <FiPackage className="text-2xl text-green-400" />
          <p className="text-xs text-gray-500">All stock levels healthy</p>
        </div>
      )}
    </WidgetCard>
  );
};

/* ── QC / All: Today Stats ───────────────────────────────────────────────── */
export const TodayStatsWidget = ({ stats = {} }) => (
  <WidgetCard title="Today at a Glance" icon={FiTrendingUp}>
    <div className="grid grid-cols-2 gap-2">
      {[
        { label: "Orders", value: stats.pendingOrders ?? 0, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Earnings", value: formatPrice(stats.totalEarnings ?? 0), color: "text-green-600", bg: "bg-green-50" },
        { label: "Products", value: stats.totalProducts ?? 0, color: "text-purple-600", bg: "bg-purple-50" },
        { label: "In Stock", value: stats.inStockProducts ?? 0, color: "text-orange-600", bg: "bg-orange-50" },
      ].map(({ label, value, color, bg }) => (
        <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
          <p className={`text-lg font-black ${color}`}>{value}</p>
          <p className="text-[10px] text-gray-500 font-medium">{label}</p>
        </div>
      ))}
    </div>
  </WidgetCard>
);

/* ── Retail: Sales Overview ──────────────────────────────────────────────── */
export const SalesOverviewWidget = ({ stats = {} }) => (
  <WidgetCard title="Sales Overview" icon={FiBarChart2}>
    <div className="space-y-3">
      {[
        { label: "Total Earnings", value: formatPrice(stats.totalEarnings ?? 0), sub: "Lifetime" },
        { label: "Pending Payout", value: formatPrice(stats.pendingEarnings ?? 0), sub: "Awaiting settlement" },
      ].map(({ label, value, sub }) => (
        <div key={label} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <p className="text-xs font-semibold text-gray-700">{label}</p>
            <p className="text-[10px] text-gray-400">{sub}</p>
          </div>
          <p className="text-sm font-black text-gray-800">{value}</p>
        </div>
      ))}
    </div>
  </WidgetCard>
);

/* ── Retail: Recent Orders (mini) ────────────────────────────────────────── */
export const RecentOrdersWidget = ({ orders = [], vendorId, isLoading }) => {
  const navigate = useNavigate();
  return (
    <WidgetCard title="Recent Orders" icon={FiShoppingBag} actionRoute="/vendor/orders">
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-lg" />)}</div>
      ) : orders.length > 0 ? (
        <div className="space-y-2">
          {orders.slice(0, 4).map(order => {
            const vendorItem = order.vendorItems?.find(vi => vi.vendorId?.toString() === vendorId?.toString());
            const displayAmount = order.vendorSummary?.total ?? (vendorItem ? (Number(vendorItem.subtotal || 0) + Number(vendorItem.shipping || 0) + Number(vendorItem.tax || 0) - Number(vendorItem.discount || 0)) : (order.total || 0));
            return (
              <div
                key={order._id}
                onClick={() => navigate(`/vendor/orders/${order.orderId ?? order._id}`)}
                className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
              >
                <div>
                  <p className="text-xs font-semibold text-gray-800">{order.orderId ?? order._id?.slice(-8)}</p>
                  <p className="text-[10px] text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-gray-800">{formatPrice(displayAmount)}</p>
                  <StatusBadge status={order.status} size="xs" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center py-4">No recent orders</p>
      )}
    </WidgetCard>
  );
};

/* ── Retail / Wholesale: Customer Stats ──────────────────────────────────── */
export const CustomerStatsWidget = () => {
  const navigate = useNavigate();
  return (
    <WidgetCard title="Customers" icon={FiUsers} actionRoute="/vendor/customers" actionLabel="View All">
      <div className="flex flex-col items-center py-4 gap-2">
        <FiUsers className="text-3xl text-primary-400" />
        <p className="text-xs text-gray-500 text-center">Customer analytics will appear here once you have orders.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/vendor/customers")}>Browse Customers</Button>
      </div>
    </WidgetCard>
  );
};

/* ── Retail: Top Products ────────────────────────────────────────────────── */
export const TopProductsWidget = ({ products = [] }) => {
  const navigate = useNavigate();
  return (
    <WidgetCard title="Your Products" icon={FiPackage} actionRoute="/vendor/products">
      {products.length > 0 ? (
        <div className="space-y-2">
          {products.slice(0, 4).map(p => (
            <div
              key={p._id}
              onClick={() => navigate(`/vendor/products/${p._id}`)}
              className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
            >
              <img
                src={p.image || p.images?.[0]}
                alt={p.name}
                className="w-8 h-8 object-cover rounded"
                onError={e => { e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23f3f4f6'/%3E%3C/svg%3E"; }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{p.name}</p>
                <p className="text-[10px] text-gray-500">{formatPrice(p.price ?? 0)}</p>
              </div>
              <StatusBadge status={p.stock === "in_stock" ? "active" : "pending"} size="xs" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-4 gap-2">
          <FiPackage className="text-3xl text-gray-300" />
          <Button variant="primary" size="sm" onClick={() => navigate("/vendor/products/add-product")}>Add Product</Button>
        </div>
      )}
    </WidgetCard>
  );
};

/* ── Wholesale: Bulk Sales ───────────────────────────────────────────────── */
export const BulkSalesWidget = ({ stats = {} }) => (
  <WidgetCard title="Bulk Sales" icon={FiLayers}>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Bulk Orders", value: stats.totalOrders ?? 0, color: "text-blue-700", bg: "bg-blue-50" },
          { label: "Revenue", value: formatPrice(stats.totalEarnings ?? 0), color: "text-green-700", bg: "bg-green-50" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
            <p className={`text-lg font-black ${color}`}>{value}</p>
            <p className="text-[10px] text-gray-500 font-medium">{label}</p>
          </div>
        ))}
      </div>
    </div>
  </WidgetCard>
);

/* ── Wholesale: Pending Orders ───────────────────────────────────────────── */
export const PendingOrdersWidget = ({ orders = [], vendorId, isLoading }) => {
  const navigate = useNavigate();
  const pending = orders.filter(o => ["pending","processing","confirmed"].includes(o.status));
  return (
    <WidgetCard title="Pending Orders" icon={FiShoppingBag} actionRoute="/vendor/orders">
      {isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-lg" />)}</div>
      ) : pending.length > 0 ? (
        <div className="space-y-2">
          {pending.slice(0, 4).map(order => (
            <div key={order._id} onClick={() => navigate(`/vendor/orders/${order.orderId ?? order._id}`)}
              className="flex items-center justify-between p-2 bg-amber-50 rounded-lg border border-amber-100 cursor-pointer hover:bg-amber-100 transition-colors"
            >
              <p className="text-xs font-semibold text-gray-800">{order.orderId ?? order._id?.slice(-8)}</p>
              <StatusBadge status={order.status} size="xs" />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center py-4">No pending orders</p>
      )}
    </WidgetCard>
  );
};

/* ── Wholesale: MOQ Performance ─────────────────────────────────────────── */
export const MoqPerformanceWidget = ({ products = [] }) => {
  const withMoq = products.filter(p => p.wholesale?.moqEnabled);
  return (
    <WidgetCard title="MOQ Products" icon={FiBarChart2} actionRoute="/vendor/products">
      <div className="flex items-center gap-4 p-3 bg-indigo-50 rounded-lg">
        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-black text-indigo-700">{withMoq.length}</span>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">MOQ-Enabled Products</p>
          <p className="text-xs text-gray-500">Out of {products.length} total products</p>
        </div>
      </div>
    </WidgetCard>
  );
};

/* ── Wholesale: Invoices Summary ────────────────────────────────────────── */
export const InvoicesSummaryWidget = ({ stats = {} }) => {
  const navigate = useNavigate();
  return (
    <WidgetCard title="Invoices & Payments" icon={FiFileText} actionRoute="/vendor/wallet-history" actionLabel="View">
      <div className="space-y-2">
        <div className="p-3 bg-green-50 rounded-lg flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-700">Settled</p>
          <p className="text-sm font-black text-green-700">{formatPrice(stats.totalEarnings ?? 0)}</p>
        </div>
        <div className="p-3 bg-amber-50 rounded-lg flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-700">Pending</p>
          <p className="text-sm font-black text-amber-700">{formatPrice(stats.pendingEarnings ?? 0)}</p>
        </div>
      </div>
    </WidgetCard>
  );
};

/**
 * Widget registry — maps dashboardLayout keys → components.
 * Pass in all data as props; each widget picks what it needs.
 */
export const WIDGET_REGISTRY = {
  // QC
  liveOrders:       (props) => <LiveOrdersWidget {...props} />,
  preparationQueue: (props) => <PreparationQueueWidget {...props} />,
  inventoryAlerts:  (props) => <InventoryAlertsWidget {...props} />,
  todayStats:       (props) => <TodayStatsWidget {...props} />,
  // Retail
  salesOverview:    (props) => <SalesOverviewWidget {...props} />,
  recentOrders:     (props) => <RecentOrdersWidget {...props} />,
  topProducts:      (props) => <TopProductsWidget {...props} />,
  customerStats:    (props) => <CustomerStatsWidget {...props} />,
  // Wholesale
  bulkSales:        (props) => <BulkSalesWidget {...props} />,
  pendingOrders:    (props) => <PendingOrdersWidget {...props} />,
  moqPerformance:   (props) => <MoqPerformanceWidget {...props} />,
  invoicesSummary:  (props) => <InvoicesSummaryWidget {...props} />,
};
