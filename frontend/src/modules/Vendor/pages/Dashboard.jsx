import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  FiPackage,
  FiShoppingBag,
  FiTrendingUp,
  FiArrowRight,
  FiCheck,
} from "react-icons/fi";
import { MdCurrencyRupee } from "react-icons/md";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { useVendorProductStore } from "../store/vendorProductStore";
import { getVendorOrders, getVendorEarnings, getPublicSubscriptionPlans } from "../services/vendorService";
import { formatPrice } from "../../../shared/utils/helpers";
import toast from "react-hot-toast";
import { DashboardPage, StatCard, StatusBadge } from "../../../shared/components/Dashboard";
import { Button, Card, Badge } from "../../../shared/components/ui";

const VendorDashboard = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const { products, total: totalProductsCount, fetchProducts } = useVendorProductStore();

  const [stats, setStats] = useState({
    totalProducts: 0,
    inStockProducts: 0,
    totalOrders: 0,
    pendingOrders: 0,
    totalEarnings: 0,
    pendingEarnings: 0,
  });

  const [recentOrders, setRecentOrders] = useState([]);
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(true);

  const vendorId = vendor?.id;
  const topProducts = useMemo(() => (Array.isArray(products) ? products.slice(0, 5) : []), [products]);

  useEffect(() => {
    if (!vendorId) return;

    // Load products into the product store (reuse if already fetched)
    if (products.length === 0) {
      fetchProducts();
    }

    const loadDashboardData = async () => {
      setIsLoading(true);
      try {
        // Fetch orders and earnings in parallel
        const [ordersRes, earningsRes, pendingRes, processingRes, plansRes] = await Promise.all([
          getVendorOrders({ page: 1, limit: 5 }),
          getVendorEarnings(),
          getVendorOrders({ page: 1, limit: 1, status: "pending" }),
          getVendorOrders({ page: 1, limit: 1, status: "processing" }),
          getPublicSubscriptionPlans(),
        ]);

        const ordersData = ordersRes?.data ?? ordersRes;
        const earningsData = earningsRes?.data ?? earningsRes;
        const pendingData = pendingRes?.data ?? pendingRes;
        const processingData = processingRes?.data ?? processingRes;
        const plansData = plansRes?.data ?? plansRes;

        const orders = ordersData?.orders ?? [];
        const summary = earningsData?.summary ?? {};
        const pending =
          Number(pendingData?.total || 0) + Number(processingData?.total || 0);

        setStats((prev) => ({
          ...prev,
          totalOrders: ordersData?.total ?? orders.length,
          pendingOrders: pending,
          totalEarnings: summary.totalEarnings ?? 0,
          pendingEarnings: summary.pendingEarnings ?? 0,
        }));

        setRecentOrders(orders);
        setPlans(Array.isArray(plansData) ? plansData : []);
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setIsLoading(false);
        setPlansLoading(false);
      }
    };

    loadDashboardData();
  }, [vendorId, fetchProducts, products.length]);

  // Sync product counts whenever the product store updates
  useEffect(() => {
    const inStock = products.filter((p) => p.stock === "in_stock").length;
    setStats((prev) => ({
      ...prev,
      totalProducts: Number(totalProductsCount || 0),
      inStockProducts: inStock,
    }));
  }, [products, totalProductsCount]);

  const statCards = [
    {
      icon: FiPackage,
      label: "Total Products",
      value: stats.totalProducts,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
      textColor: "text-blue-700",
      link: "/vendor/products",
    },
    {
      icon: FiShoppingBag,
      label: "Total Orders",
      value: stats.totalOrders,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-700",
      link: "/vendor/orders",
    },
    {
      icon: FiTrendingUp,
      label: "Pending Orders",
      value: stats.pendingOrders,
      color: "bg-orange-500",
      bgColor: "bg-orange-50",
      textColor: "text-orange-700",
      link: "/vendor/orders",
    },
    {
      icon: MdCurrencyRupee,
      label: "Total Earnings",
      value: formatPrice(stats.totalEarnings || 0),
      color: "bg-purple-500",
      bgColor: "bg-purple-50",
      textColor: "text-purple-700",
      link: "/vendor/earnings",
    },
  ];

  return (
    <DashboardPage
      title="Dashboard"
      subtitle={`Welcome back, ${vendor?.storeName || vendor?.name || 'Vendor'}! Here's your store overview.`}
      actions={
        vendor?.commissionRate !== undefined && (
          <Badge variant="gold" size="md">
            Commission Rate: {vendor.commissionRate.toFixed(1)}%
          </Badge>
        )
      }
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <div key={index} onClick={() => stat.link && navigate(stat.link)} className="cursor-pointer">
            <StatCard
              title={stat.label}
              value={isLoading ? "—" : stat.value}
              icon={<stat.icon />}
            />
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <Card variant="default" padding="lg">
        <h2 className="text-lg font-bold text-textColor-primary mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate("/vendor/products/add-product")}
            leftIcon={<FiPackage />}
            className="justify-start text-left h-auto py-3 px-4"
          >
            <div>
              <div className="font-bold text-textColor-primary">Add New Product</div>
              <div className="text-xs text-textColor-muted font-normal">Create a new product listing</div>
            </div>
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate("/vendor/orders")}
            leftIcon={<FiShoppingBag />}
            className="justify-start text-left h-auto py-3 px-4"
          >
            <div>
              <div className="font-bold text-textColor-primary">View Orders</div>
              <div className="text-xs text-textColor-muted font-normal">Manage your customer orders</div>
            </div>
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate("/vendor/earnings")}
            leftIcon={<MdCurrencyRupee />}
            className="justify-start text-left h-auto py-3 px-4"
          >
            <div>
              <div className="font-bold text-textColor-primary">View Earnings</div>
              <div className="text-xs text-textColor-muted font-normal">Check your payout reports</div>
            </div>
          </Button>
        </div>
      </Card>

      {/* Recent Orders & Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card variant="default" padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-textColor-primary">Recent Orders</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/vendor/orders")}>
              View All
            </Button>
          </div>
          {isLoading ? (
            <p className="text-textColor-muted text-center py-8 font-medium">Loading orders...</p>
          ) : recentOrders.length > 0 ? (
            <div className="space-y-3">
              {recentOrders.map((order) => {
                const vendorItem = order.vendorItems?.find(
                  (vi) => vi.vendorId?.toString() === vendorId?.toString()
                );
                const displayStatus = vendorItem?.status ?? order.status;
                const displayAmount =
                  vendorItem?.subtotal ?? order.totalAmount ?? order.total ?? 0;

                return (
                  <div
                    key={order._id ?? order.orderId}
                    onClick={() =>
                      navigate(`/vendor/orders/${order.orderId ?? order._id}`)
                    }
                    className="flex items-center justify-between p-3 bg-surface-background border border-borderToken-default hover:bg-borderToken-light rounded-card cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="font-bold text-textColor-primary text-sm">
                        {order.orderId ?? order._id}
                      </p>
                      <p className="text-xs text-textColor-muted">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="font-black text-textColor-primary text-sm">
                        {formatPrice(displayAmount)}
                      </p>
                      <StatusBadge status={displayStatus} size="xs" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-textColor-muted text-center py-8 font-medium">No orders yet</p>
          )}
        </Card>

        {/* Top Products */}
        <Card variant="default" padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-textColor-primary">Your Products</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/vendor/products")}>
              View All
            </Button>
          </div>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((product) => (
                <div
                  key={product._id ?? product.id}
                  onClick={() =>
                    navigate(`/vendor/products/${product._id ?? product.id}`)
                  }
                  className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
                  <img
                    src={product.image || product.images?.[0]}
                    alt={product.name}
                    className="w-12 h-12 object-cover rounded-lg"
                    onError={(e) => {
                      e.target.src =
                        "https://via.placeholder.com/48x48?text=P";
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">
                      {product.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatPrice(product.price || 0)}
                    </p>
                  </div>
                  <StatusBadge
                    status={product.stock === "in_stock" ? "active" : product.stock === "low_stock" ? "pending" : "out_of_stock"}
                    size="xs"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-textColor-muted text-center py-8 font-medium">No products yet</p>
          )}
        </Card>
      </div>

      {/* Subscription Plans Section */}
      <Card variant="default" padding="lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-textColor-primary">Membership Plans</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate("/vendor/subscription")}>
            Manage Subscription
          </Button>
        </div>

        {plansLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-surface-background animate-pulse rounded-card"></div>
            ))}
          </div>
        ) : plans.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card
                key={plan._id}
                variant={plan.isMostPopular ? "elevated" : "default"}
                padding="md"
                className={`relative border-2 ${
                  plan.isMostPopular ? 'border-brand-primary bg-brand-primary/5' : 'border-borderToken-default'
                }`}
              >
                {plan.isMostPopular && (
                  <div className="absolute -top-3 right-6">
                    <Badge variant="gold" size="xs">
                      <FiCheck className="mr-1 inline" /> POPULAR
                    </Badge>
                  </div>
                )}
                {plan.isTrial && (
                  <div className="absolute -top-3 left-6">
                    <Badge variant="default" size="xs">TRIAL</Badge>
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-base font-bold text-textColor-primary mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-textColor-primary">{plan.price}</span>
                    <span className="text-textColor-muted font-semibold text-sm">{plan.currency || 'AED'}</span>
                  </div>
                  <p className="text-xs text-textColor-muted">{plan.durationDays} days</p>
                </div>

                {plan.features?.length > 0 && (
                  <ul className="space-y-2 mb-4">
                    {plan.features.slice(0, 4).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-textColor-muted">
                        <FiCheck className="text-brand-primary mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-1">{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center gap-2 mt-auto">
                  <span className={`w-2 h-2 rounded-full ${plan.isActive ? 'bg-status-success' : 'bg-textColor-muted'}`}></span>
                  <span className="text-[10px] font-bold text-textColor-muted uppercase tracking-tight">
                    {plan.isActive ? 'Active Plan' : 'Inactive'}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-surface-background rounded-card border border-dashed border-borderToken-default">
            <p className="text-textColor-muted text-sm">No membership plans found.</p>
          </div>
        )}
      </Card>
    </DashboardPage>
  );
};

export default VendorDashboard;
