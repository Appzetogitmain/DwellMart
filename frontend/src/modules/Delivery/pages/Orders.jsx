import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiPackage,
  FiMapPin,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiNavigation,
  FiChevronRight,
  FiRefreshCw,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import PageTransition from '../../../shared/components/PageTransition';
import { formatPrice } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';

const DeliveryOrders = () => {
  const navigate = useNavigate();
  const {
    orders,
    ordersPagination,
    isLoadingOrders,
    isUpdatingOrderStatus,
    fetchOrders,
    acceptOrder,
    completeOrder,
  } = useDeliveryAuthStore();
  const [filter, setFilter] = useState('all'); // all, pending, in-transit, completed
  const [loadFailed, setLoadFailed] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const getBackendStatusFilter = (value) => {
    if (value === 'all') return undefined;
    if (value === 'pending') return 'open';
    if (value === 'in-transit') return 'shipped';
    if (value === 'completed') return 'delivered';
    return undefined;
  };

  const loadOrders = async (page = currentPage, activeFilter = filter) => {
    try {
      setLoadFailed(false);
      await fetchOrders({
        page,
        limit: PAGE_SIZE,
        status: getBackendStatusFilter(activeFilter),
      });
    } catch {
      setLoadFailed(true);
    }
  };

  useEffect(() => {
    loadOrders(currentPage, filter);
  }, [fetchOrders, currentPage, filter]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'in-transit':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'cancelled':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-slate-700/50 text-slate-400 border-slate-600/40';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <FiClock className="text-yellow-400" />;
      case 'in-transit':
        return <FiNavigation className="text-blue-400" />;
      case 'completed':
        return <FiCheckCircle className="text-emerald-400" />;
      case 'cancelled':
        return <FiXCircle className="text-red-400" />;
      default:
        return <FiPackage className="text-slate-400" />;
    }
  };

  const handleAcceptOrder = async (orderId) => {
    try {
      await acceptOrder(orderId);
      toast.success('Order accepted successfully');
    } catch {
      // Error toast handled by API interceptor.
    }
  };

  const handleCompleteOrder = async (orderId) => {
    const otp = window.prompt('Enter 6-digit delivery OTP shared by customer:');
    if (otp === null) return;
    if (!/^\d{6}$/.test(String(otp).trim())) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    try {
      await completeOrder(orderId, String(otp).trim());
      toast.success('Order marked as delivered');
    } catch {
      // Error toast handled by API interceptor.
    }
  };

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(Number(ordersPagination?.pages || 1), prev + 1));
  };

  return (
    <PageTransition>
      <div className="space-y-6 select-none">
        {/* Header Banner */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/90 backdrop-blur-xl border border-amber-500/20 p-6 rounded-3xl shadow-xl"
        >
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Delivery Orders</h1>
            <p className="text-xs text-slate-400 mt-1">
              Showing {Number(ordersPagination?.total || orders.length)} orders total
            </p>
          </div>

          <button
            onClick={() => loadOrders(currentPage, filter)}
            className="px-4 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-amber-400 hover:border-amber-500/40 text-xs font-bold transition-all flex items-center gap-1.5 self-start sm:self-auto"
          >
            <FiRefreshCw /> Refresh List
          </button>
        </motion.div>

        {/* Filter Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex gap-2 overflow-x-auto pb-2 scrollbar-none"
        >
          {['all', 'pending', 'in-transit', 'completed'].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setFilter(tab);
                setCurrentPage(1);
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                filter === tab
                  ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 shadow-[0_4px_15px_rgba(212,175,55,0.3)]'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
            </button>
          ))}
        </motion.div>

        {/* Orders List */}
        <div className="space-y-4">
          {isLoadingOrders ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 bg-slate-800/90 rounded-3xl border border-slate-700/80 text-slate-400"
            >
              <p className="font-semibold">Loading orders...</p>
            </motion.div>
          ) : loadFailed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 bg-slate-800/90 rounded-3xl border border-slate-700/80 p-6"
            >
              <FiXCircle className="text-red-400 text-5xl mx-auto mb-3" />
              <p className="text-slate-300 font-semibold mb-3">Could not load orders.</p>
              <button
                onClick={() => loadOrders(currentPage, filter)}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm"
              >
                Retry
              </button>
            </motion.div>
          ) : orders.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 bg-slate-800/90 rounded-3xl border border-slate-700/80 p-6"
            >
              <FiPackage className="text-amber-500/50 text-5xl mx-auto mb-3" />
              <p className="text-slate-300 font-bold text-base">No orders found</p>
              <p className="text-xs text-slate-400 mt-1">There are no orders matching your current filter.</p>
            </motion.div>
          ) : (
            orders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                onClick={() => navigate(`/delivery/orders/${order.id}`)}
                className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 hover:border-amber-500/40 rounded-3xl p-5 shadow-xl transition-all duration-200 cursor-pointer group"
              >
                {/* Order Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(order.status)}
                      <p className="font-extrabold text-white text-base group-hover:text-amber-400 transition-colors">
                        Order #{order.id}
                      </p>
                    </div>
                    <p className="text-xs text-slate-300 font-medium">{order.customer}</p>
                    <p className="text-[11px] text-slate-400">{order.phone || 'Phone unavailable'}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${getStatusBadge(
                      order.status
                    )}`}
                  >
                    {order.status.replace('-', ' ')}
                  </span>
                </div>

                {/* Address Box */}
                <div className="flex items-start gap-2.5 mb-3 p-3 bg-slate-950/70 rounded-2xl border border-slate-800">
                  <FiMapPin className="text-amber-400 mt-0.5 flex-shrink-0 text-sm" />
                  <p className="text-xs text-slate-300 font-medium leading-relaxed">
                    {order.address || 'Address unavailable'}
                  </p>
                </div>

                {/* Details Bar */}
                <div className="flex items-center justify-between mb-4 pt-1">
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <div className="flex items-center gap-1">
                      <FiPackage className="text-slate-400" />
                      <span>
                        {Array.isArray(order.items)
                          ? order.items.length
                          : typeof order.items === 'number'
                          ? order.items
                          : 0}{' '}
                        items
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FiClock className="text-slate-400" />
                      <span>{order.estimatedTime || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FiNavigation className="text-slate-400" />
                      <span>{order.distance || '-'}</span>
                    </div>
                  </div>
                  <p className="font-extrabold text-amber-400 text-base">{formatPrice(order.amount)}</p>
                </div>

                {/* Actions Bar */}
                <div className="flex gap-2 pt-1">
                  {order.status === 'pending' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAcceptOrder(order.id);
                      }}
                      disabled={isUpdatingOrderStatus}
                      className="flex-1 py-3 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-slate-950 rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-60"
                    >
                      {isUpdatingOrderStatus ? 'Accepting...' : 'Accept Order'}
                    </button>
                  )}
                  {order.status === 'in-transit' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCompleteOrder(order.id);
                      }}
                      disabled={isUpdatingOrderStatus}
                      className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-60"
                    >
                      {isUpdatingOrderStatus ? 'Completing...' : 'Mark Complete'}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/delivery/orders/${order.id}`);
                    }}
                    className="flex-1 py-3 bg-slate-950/80 border border-slate-700/80 text-slate-200 hover:text-white hover:border-amber-500/40 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1"
                  >
                    <span>View Details</span>
                    <FiChevronRight className="text-xs" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Pagination Bar */}
        {!isLoadingOrders && !loadFailed && Number(ordersPagination?.pages || 1) > 1 && (
          <div className="flex items-center justify-between bg-slate-800/90 border border-slate-700/80 rounded-2xl px-5 py-3 shadow-lg">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage <= 1}
              className="px-4 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-slate-300 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:border-amber-500/40 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-slate-400 font-semibold">
              Page <strong className="text-white">{currentPage}</strong> of{' '}
              <strong className="text-white">{Number(ordersPagination?.pages || 1)}</strong>
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage >= Number(ordersPagination?.pages || 1)}
              className="px-4 py-2 rounded-xl bg-slate-950/80 border border-slate-700 text-slate-300 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:border-amber-500/40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default DeliveryOrders;
