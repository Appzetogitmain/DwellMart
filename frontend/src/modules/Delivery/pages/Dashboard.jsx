import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import {
  FiPackage,
  FiCheckCircle,
  FiClock,
  FiTrendingUp,
  FiMapPin,
  FiTruck,
  FiChevronRight,
  FiRefreshCw,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import PageTransition from '../../../shared/components/PageTransition';
import toast from 'react-hot-toast';
import { formatPrice } from '../../../shared/utils/helpers';

const DeliveryDashboard = () => {
  const { deliveryBoy, updateStatus, fetchProfile, fetchDashboardSummary, isUpdatingStatus } =
    useDeliveryAuthStore();
  const navigate = useNavigate();
  const statusMenuRef = useRef(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [stats, setStats] = useState({
    totalOrders: 0,
    completedToday: 0,
    openOrders: 0,
    earnings: 0,
  });

  const statCards = [
    {
      icon: FiPackage,
      label: 'Total Orders',
      value: stats.totalOrders,
      accentColor: 'text-amber-400',
      badgeBg: 'bg-amber-500/10 border-amber-500/30',
      iconBg: 'bg-amber-500/20 text-amber-400',
    },
    {
      icon: FiCheckCircle,
      label: 'Completed Today',
      value: stats.completedToday,
      accentColor: 'text-emerald-400',
      badgeBg: 'bg-emerald-500/10 border-emerald-500/30',
      iconBg: 'bg-emerald-500/20 text-emerald-400',
    },
    {
      icon: FiClock,
      label: 'Open Orders',
      value: stats.openOrders,
      accentColor: 'text-yellow-400',
      badgeBg: 'bg-yellow-500/10 border-yellow-500/30',
      iconBg: 'bg-yellow-500/20 text-yellow-400',
    },
    {
      icon: FiTrendingUp,
      label: 'Total Earnings',
      value: formatPrice(stats.earnings),
      accentColor: 'text-amber-300',
      badgeBg: 'bg-amber-500/10 border-amber-500/30',
      iconBg: 'bg-gradient-to-br from-amber-500 to-yellow-500 text-slate-950',
    },
  ];

  const [riderAnalytics, setRiderAnalytics] = useState(null);

  const loadDashboardData = async () => {
    try {
      setLoadFailed(false);
      setIsDashboardLoading(true);
      await fetchProfile();
      const summary = await fetchDashboardSummary();
      setRecentOrders(summary.recentOrders || []);
      setStats({
        totalOrders: Number(summary.totalOrders || 0),
        completedToday: Number(summary.completedToday || 0),
        openOrders: Number(summary.openOrders || 0),
        earnings: Number(summary.earnings || 0),
      });

      // Fetch Rider Analytics
      try {
        const api = (await import('../../../shared/utils/api')).default;
        const res = await api.get('/delivery/orders/analytics');
        setRiderAnalytics(res.data);
      } catch (err) {
        console.warn('Rider analytics fetch failed', err);
      }
    } catch {
      setLoadFailed(true);
      setRecentOrders([]);
      setStats({
        totalOrders: 0,
        completedToday: 0,
        openOrders: 0,
        earnings: 0,
      });
    } finally {
      setIsDashboardLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [fetchDashboardSummary, fetchProfile]);

  useEffect(() => {
    if (!statusMenuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target)) {
        setStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [statusMenuOpen]);

  const handleStatusChange = async (newStatus) => {
    if (isUpdatingStatus) return;
    try {
      await updateStatus(newStatus);
      toast.success(`Status updated to ${newStatus}`);
      setStatusMenuOpen(false);
    } catch {
      // Error toast handled by API interceptor.
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'in-transit':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-700/50 text-slate-400 border-slate-600/40';
    }
  };

  const displayOrders = recentOrders.length > 0 ? recentOrders : [];

  return (
    <PageTransition>
      <div className="space-y-6 select-none">
        {/* Welcome Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl bg-slate-800/90 backdrop-blur-xl border border-amber-500/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden p-6 sm:p-8"
        >
          {/* Top Amber Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
                <FiTruck className="text-xs" />
                <span>Agent Overview</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Welcome back, {deliveryBoy?.name || 'Delivery Partner'}!
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm mt-1">
                {deliveryBoy?.status === 'available'
                  ? 'You are online and ready for new delivery assignments'
                  : deliveryBoy?.status === 'busy'
                  ? 'You are currently on active delivery duty'
                  : 'You are currently offline'}
              </p>
            </div>

            {/* Status Selector Pill */}
            <div className="relative self-start sm:self-auto" ref={statusMenuRef}>
              <button
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                className="px-4 py-2 rounded-xl bg-slate-950/80 border border-amber-500/30 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2.5 shadow-md hover:border-amber-400 transition-colors"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    deliveryBoy?.status === 'available'
                      ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                      : deliveryBoy?.status === 'busy'
                      ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                      : 'bg-slate-500'
                  }`}
                />
                <span>Status: <strong className="text-amber-400">{deliveryBoy?.status || 'offline'}</strong></span>
              </button>

              <AnimatePresence>
                {statusMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-44 bg-slate-900 border border-amber-500/20 rounded-2xl shadow-[0_15px_35px_rgba(0,0,0,0.6)] overflow-hidden z-50 p-1.5 space-y-1"
                  >
                    <button
                      onClick={() => handleStatusChange('available')}
                      disabled={isUpdatingStatus}
                      className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Available</span>
                    </button>
                    <button
                      onClick={() => handleStatusChange('busy')}
                      disabled={isUpdatingStatus}
                      className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-amber-400 hover:bg-amber-500/10 transition-colors flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Busy</span>
                    </button>
                    <button
                      onClick={() => handleStatusChange('offline')}
                      disabled={isUpdatingStatus}
                      className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:bg-slate-800 transition-colors flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      <span>Offline</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Vehicle & Info Pills */}
          <div className="mt-6 pt-4 border-t border-slate-700/60 flex flex-wrap items-center gap-3">
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/70 border border-slate-700 text-xs text-slate-300 flex items-center gap-2 font-medium">
              <FiTruck className="text-amber-400" />
              <span>Vehicle: <strong className="text-white">{deliveryBoy?.vehicleType || 'Bike'}</strong></span>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/70 border border-slate-700 text-xs text-slate-300 flex items-center gap-2 font-medium">
              <span>Plate: <strong className="text-amber-400">{deliveryBoy?.vehicleNumber || 'N/A'}</strong></span>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 hover:border-amber-500/40 rounded-2xl p-5 shadow-lg transition-all hover:shadow-[0_10px_25px_rgba(0,0,0,0.4)]"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    {stat.label}
                  </span>
                  <div className={`w-9 h-9 rounded-xl ${stat.iconBg} flex items-center justify-center shadow-md`}>
                    <Icon className="text-lg" />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {isDashboardLoading ? (
                    <span className="inline-block h-8 w-20 rounded bg-slate-700 animate-pulse" />
                  ) : (
                    stat.value
                  )}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Performance KPIs Panel */}
        {riderAnalytics && (
          <div className="bg-slate-800/90 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-4 shadow-lg grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-slate-400 font-semibold mb-0.5">Acceptance Rate</p>
              <p className="text-base font-extrabold text-amber-400">{riderAnalytics.acceptanceRate}%</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold mb-0.5">Completion Rate</p>
              <p className="text-base font-extrabold text-emerald-400">{riderAnalytics.completionRate}%</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold mb-0.5">Avg Delivery Time</p>
              <p className="text-base font-extrabold text-blue-400">{riderAnalytics.avgDeliveryTimeMinutes} min</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold mb-0.5">Rider Rating</p>
              <p className="text-base font-extrabold text-yellow-400">★ {riderAnalytics.averageRating}</p>
            </div>
          </div>
        )}

        {/* Recent Orders Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 shadow-xl"
        >
          <div className="flex items-center justify-between mb-5 border-b border-slate-700/80 pb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                Recent Assigned Orders
              </h2>
              <p className="text-xs text-slate-400">Track and fulfill your active deliveries</p>
            </div>
            <div className="flex items-center gap-3">
              {loadFailed && (
                <button
                  onClick={loadDashboardData}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
                >
                  <FiRefreshCw /> Retry
                </button>
              )}
              <button
                onClick={() => navigate('/delivery/orders')}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 text-xs font-extrabold shadow-md hover:shadow-lg transition-all flex items-center gap-1 group"
              >
                <span>View All Orders</span>
                <FiChevronRight className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {isDashboardLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="bg-slate-900 border border-slate-700/60 rounded-2xl p-4">
                    <div className="h-4 w-32 bg-slate-700 rounded animate-pulse mb-2" />
                    <div className="h-3 w-48 bg-slate-800 rounded animate-pulse mb-3" />
                    <div className="h-3 w-full bg-slate-800 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            )}
            {!isDashboardLoading && displayOrders.length === 0 && (
              <div className="text-sm text-slate-400 py-8 text-center bg-slate-950/50 rounded-2xl border border-slate-800">
                No assigned orders found. Check back soon for new deliveries!
              </div>
            )}
            {!isDashboardLoading &&
              displayOrders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => navigate(`/delivery/orders/${order.id}`)}
                  className="bg-slate-900/90 border border-slate-700/60 hover:border-amber-500/40 rounded-2xl p-4 transition-all duration-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.5)] cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-white group-hover:text-amber-400 transition-colors">
                        Order #{order.id}
                      </p>
                      <p className="text-xs text-slate-400">{order.customer}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${getStatusBadge(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-300 mb-3 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                    <FiMapPin className="text-amber-400 flex-shrink-0" />
                    <span className="truncate">{order.address || 'Address unavailable'}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-400 font-medium">
                      Distance: <strong className="text-slate-200">{order.distance || '-'}</strong>
                    </span>
                    <span className="font-extrabold text-amber-400 text-sm">
                      {formatPrice(order.amount)}
                    </span>
                  </div>
                </motion.div>
              ))}
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default DeliveryDashboard;
