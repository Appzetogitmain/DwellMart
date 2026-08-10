import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiFilter } from 'react-icons/fi';
import { motion } from 'framer-motion';
import MobileLayout from "../components/Layout/MobileLayout";
import MobileOrderCard from '../components/Mobile/MobileOrderCard';
import { useOrderStore } from '../../../shared/store/orderStore';
import { useAuthStore } from '../../../shared/store/authStore';
import PageTransition from '../../../shared/components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import toast from 'react-hot-toast';
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";

const MobileOrders = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "Orders refreshed",
    "Failed to load more orders",
    "My Orders",
    "order",
    "orders",
    "All Orders",
    "Pending",
    "Processing",
    "Shipped",
    "Delivered",
    "Cancelled",
    "Loading orders...",
    "No orders found",
    "You haven't placed any orders yet",
    "No orders",
    "Start Shopping",
    "Loading...",
    "Load More Orders"
  ]);

  const { translateArray } = useDynamicTranslation();
  const navigate = useNavigate();
  const { getAllOrders, fetchUserOrders, isLoading, orderPagination } = useOrderStore();
  const { user } = useAuthStore();
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

   const statusOptions = [
    { value: 'all', label: t('All Orders') },
    { value: 'pending', label: t('Pending') },
    { value: 'processing', label: t('Processing') },
    { value: 'shipped', label: t('Shipped') },
    { value: 'delivered', label: t('Delivered') },
    { value: 'cancelled', label: t('Cancelled') },
  ];

  const allOrders = getAllOrders(user?.id || null);

  useEffect(() => {
    if (user?.id) {
      fetchUserOrders(1, 20).catch(() => null);
    }
  }, [user?.id, fetchUserOrders]);

  const filteredOrders = useMemo(() => {
    if (selectedStatus === 'all') return allOrders;
    return allOrders.filter((order) => order.status === selectedStatus);
  }, [selectedStatus, allOrders]);

  // Pull to refresh handler
  const handleRefresh = async () => {
    if (!user?.id) return;
    await fetchUserOrders(1, 20);
  };

  const hasMore = orderPagination.page < orderPagination.pages;

  const handleLoadMore = async () => {
    if (!user?.id || !hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await fetchUserOrders(orderPagination.page + 1, 20);
    } catch {
      toast.error(t('Failed to load more orders'));
    } finally {
      setIsLoadingMore(false);
    }
  };

  const {
    pullDistance,
    isPulling,
    elementRef,
  } = usePullToRefresh(handleRefresh);

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
          <div className="w-full pb-24 min-h-screen bg-surface-muted">
            {/* Header */}
            <div className="px-4 py-4 bg-surface border-b border-border sticky top-1 z-30">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-surface-muted rounded-full transition-colors"
                >
                  <FiArrowLeft className="text-xl text-content-secondary" />
                </button>
                <div className="flex-1">
                  <h1 className="text-xl font-bold text-content">{t('My Orders')}</h1>
                  <p className="text-sm text-content-secondary">
                    {filteredOrders.length} {filteredOrders.length === 1 ? t('order') : t('orders')}
                  </p>
                </div>
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className="p-2 glass-card rounded-xl hover:bg-surface-muted transition-colors border border-border"
                >
                  <FiFilter className="text-content-secondary text-lg" />
                </button>
              </div>

              {/* Filter Options */}
              {showFilter && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSelectedStatus(option.value);
                        setShowFilter(false);
                      }}
                      className={`px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${selectedStatus === option.value
                        ? 'bg-brand-primary text-black'
                        : 'bg-surface-muted border border-border text-content-secondary'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Orders List */}
            <div
              ref={elementRef}
              className="px-4 py-4"
              style={{
                transform: `translateY(${Math.min(pullDistance, 80)}px)`,
                transition: isPulling ? 'none' : 'transform 0.3s ease-out',
              }}
            >
              {isLoading ? (
                <div className="text-center py-12">
                  <p className="text-content-secondary">{t('Loading orders...')}</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl text-content-muted mx-auto mb-4">📦</div>
                  <h3 className="text-xl font-bold text-content mb-2">{t('No orders found')}</h3>
                  <p className="text-content-secondary mb-6">
                    {selectedStatus === 'all'
                      ? t("You haven't placed any orders yet")
                      : `${t('No')} ${t(selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1).toLowerCase())} ${t('orders')}`}
                  </p>
                  <button
                    onClick={() => navigate('/home')}
                    className="bg-brand-primary text-black px-6 py-3 rounded-xl font-semibold hover:bg-brand-primaryHover transition-all"
                  >
                    {t('Start Shopping')}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {filteredOrders.map((order, index) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <MobileOrderCard order={order} />
                    </motion.div>
                  ))}
                  {selectedStatus === 'all' && hasMore && (
                    <div className="pt-4">
                      <button
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className="w-full py-3 bg-surface border border-border text-content-secondary rounded-xl font-semibold hover:bg-surface-muted transition-colors disabled:opacity-60"
                      >
                        {isLoadingMore ? t('Loading...') : t('Load More Orders')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileOrders;

