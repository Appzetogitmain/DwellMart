import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiArrowLeft,
  FiMapPin,
  FiPhone,
  FiClock,
  FiPackage,
  FiNavigation,
  FiCheckCircle,
  FiUser,
  FiTrendingUp,
  FiRefreshCw,
  FiMail,
} from 'react-icons/fi';
import PageTransition from '../../../shared/components/PageTransition';
import { formatPrice } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';

const DeliveryOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    fetchOrderById,
    acceptOrder,
    completeOrder,
    resendDeliveryOtp,
    isLoadingOrder,
    isUpdatingOrderStatus,
  } = useDeliveryAuthStore();
  const [order, setOrder] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [deliveryOtp, setDeliveryOtp] = useState('');
  const [isResendingOtp, setIsResendingOtp] = useState(false);

  const loadOrder = async () => {
    try {
      setLoadFailed(false);
      const response = await fetchOrderById(id);
      setOrder(response);
    } catch {
      setLoadFailed(true);
      setOrder(null);
    }
  };

  useEffect(() => {
    loadOrder();
  }, [id, fetchOrderById]);

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

  const handleAcceptOrder = async () => {
    if (!order || order.status !== 'pending') return;
    try {
      const updated = await acceptOrder(order.id);
      setOrder(updated);
      toast.success('Order accepted successfully');
    } catch {
      // Error toast handled by API interceptor.
    }
  };

  const handleCompleteOrder = async () => {
    if (!order || order.status !== 'in-transit') return;
    const normalizedOtp = String(deliveryOtp || '').trim();
    if (!/^\d{6}$/.test(normalizedOtp)) {
      toast.error('Please enter valid 6-digit OTP');
      return;
    }

    try {
      const updated = await completeOrder(order.id, normalizedOtp);
      setOrder(updated);
      setDeliveryOtp('');
      toast.success('Order marked as delivered');
    } catch {
      // Error toast handled by API interceptor.
    }
  };

  const handleResendOtp = async () => {
    if (!order || order.status !== 'in-transit' || isResendingOtp) return;
    try {
      setIsResendingOtp(true);
      await resendDeliveryOtp(order.id);
      toast.success('Delivery OTP resent to customer');
    } catch {
      // Error toast handled by API interceptor.
    } finally {
      setIsResendingOtp(false);
    }
  };

  const openInGoogleMaps = () => {
    const { latitude, longitude } = order;
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    const isAndroid = /android/i.test(userAgent);

    if (isAndroid) {
      const intentUrl = `intent://maps.google.com/maps?daddr=${latitude},${longitude}&directionsmode=driving#Intent;scheme=https;package=com.google.android.apps.maps;end`;
      window.location.href = intentUrl;
    } else if (isIOS) {
      const appUrl = `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`;
      const universalUrl = `https://maps.google.com/maps?daddr=${latitude},${longitude}&directionsmode=driving`;

      const link = document.createElement('a');
      link.href = appUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        window.location.href = universalUrl;
      }, 400);
    } else {
      const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
      window.open(webUrl, '_blank');
    }
  };

  if (isLoadingOrder) {
    return (
      <PageTransition>
        <div className="py-6 space-y-4 max-w-3xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-slate-800 rounded-2xl w-1/3"></div>
            <div className="h-64 bg-slate-800 rounded-3xl"></div>
          </div>
        </div>
      </PageTransition>
    );
  }

  if (!order) {
    return (
      <PageTransition>
        <div className="py-16 text-center space-y-4 bg-slate-800/90 rounded-3xl border border-slate-700/80 max-w-xl mx-auto p-6">
          <p className="text-slate-300 font-semibold">{loadFailed ? 'Unable to load order details' : 'Order not found'}</p>
          {loadFailed && (
            <button
              onClick={loadOrder}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm"
            >
              Retry
            </button>
          )}
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6 max-w-4xl mx-auto select-none">
        {/* Header */}
        <div className="flex items-center gap-4 bg-slate-800/90 backdrop-blur-xl border border-amber-500/20 p-5 rounded-3xl shadow-xl">
          <button
            onClick={() => navigate('/delivery/orders')}
            className="p-2.5 hover:bg-slate-700/80 rounded-xl text-slate-300 hover:text-white transition-colors border border-slate-700"
            title="Back to orders"
          >
            <FiArrowLeft className="text-xl" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white">Order #{order.id}</h1>
            <span
              className={`inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${getStatusBadge(
                order.status
              )}`}
            >
              {order.status.replace('-', ' ')}
            </span>
          </div>
        </div>

        {/* Customer Info */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 shadow-xl space-y-3"
        >
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-2 pb-2 border-b border-slate-700/80">
            <FiUser className="text-amber-400 text-base" />
            Customer Information
          </h2>
          <div className="space-y-2">
            <p className="text-white font-bold text-base">{order.customer}</p>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <FiPhone className="text-amber-400" />
              <a
                href={order.phone ? `tel:${order.phone}` : '#'}
                className={`hover:text-amber-400 font-semibold ${!order.phone ? 'pointer-events-none opacity-60' : ''}`}
              >
                {order.phone || 'Phone unavailable'}
              </a>
            </div>
            {order.email && (
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <FiMail className="text-amber-400" />
                <span>{order.email}</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Delivery Address */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 shadow-xl space-y-3"
        >
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-2 pb-2 border-b border-slate-700/80">
            <FiMapPin className="text-amber-400 text-base" />
            Delivery Location
          </h2>
          <p className="text-slate-200 text-sm font-medium leading-relaxed bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
            {order.address || 'Address unavailable'}
          </p>
          <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
            <div className="flex items-center gap-1.5">
              <FiNavigation className="text-amber-400" />
              <span>Distance: <strong className="text-white">{order.distance}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <FiClock className="text-amber-400" />
              <span>ETA: <strong className="text-white">{order.estimatedTime}</strong></span>
            </div>
          </div>
          {order.instructions && (
            <div className="mt-3 p-3.5 bg-amber-500/10 rounded-2xl border border-amber-500/30">
              <p className="text-xs text-amber-300 leading-relaxed">
                <strong className="text-amber-400">Special Instructions: </strong>
                {order.instructions}
              </p>
            </div>
          )}
        </motion.div>

        {/* OpenStreetMap container */}
        {(order.status === 'in-transit' || order.status === 'completed') && order.latitude && order.longitude && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 shadow-xl space-y-3"
          >
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-2 pb-2 border-b border-slate-700/80">
              <FiNavigation className="text-amber-400 text-base" />
              Map View
            </h2>
            <div className="rounded-2xl overflow-hidden border border-slate-700" style={{ height: '280px' }}>
              <iframe
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${order.longitude - 0.01},${order.latitude - 0.01},${order.longitude + 0.01},${order.latitude + 0.01}&layer=mapnik&marker=${order.latitude},${order.longitude}`}
                title="Delivery Location Map"
              />
            </div>
            <button
              onClick={openInGoogleMaps}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-2xl font-bold text-sm shadow-md transition-all"
            >
              <FiNavigation className="text-base" />
              Open Navigation in Google Maps
            </button>
          </motion.div>
        )}

        {/* Order Items */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 shadow-xl space-y-3"
        >
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-2 pb-2 border-b border-slate-700/80">
            <FiPackage className="text-amber-400 text-base" />
            Order Items
          </h2>
          <div className="space-y-2.5">
            {order.items.length === 0 && (
              <p className="text-xs text-slate-400">No items listed for this order.</p>
            )}
            {order.items.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2.5 border-b border-slate-700/50 last:border-0"
              >
                <div>
                  <p className="font-bold text-white text-sm">{item.name || 'Item'}</p>
                  <p className="text-xs text-slate-400">Quantity: {item.quantity || 0}</p>
                </div>
                <p className="font-extrabold text-amber-400 text-sm">{formatPrice(item.price || 0)}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Order Summary */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 shadow-xl space-y-3"
        >
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-2 pb-2 border-b border-slate-700/80">
            <FiTrendingUp className="text-amber-400 text-base" />
            Payment Summary
          </h2>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span>Subtotal</span>
              <span className="font-semibold text-white">{formatPrice(order.amount)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Delivery Fee</span>
              <span className="font-semibold text-white">{formatPrice(order.deliveryFee)}</span>
            </div>
            <div className="pt-2 border-t border-slate-700 flex items-center justify-between">
              <span className="font-extrabold text-white text-sm">Total Collectable</span>
              <span className="font-extrabold text-amber-400 text-lg">{formatPrice(order.total)}</span>
            </div>
          </div>
        </motion.div>

        {/* Action Controls */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-3 pt-2"
        >
          {order.status === 'pending' && (
            <button
              onClick={handleAcceptOrder}
              disabled={isUpdatingOrderStatus}
              className="w-full py-4 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(212,175,55,0.35)] transition-all disabled:opacity-60"
            >
              <FiCheckCircle className="text-xl" />
              {isUpdatingOrderStatus ? 'Accepting...' : 'Accept Order'}
            </button>
          )}

          {order.status === 'in-transit' && (
            <div className="space-y-3 bg-slate-800/90 border border-amber-500/30 rounded-3xl p-5 shadow-xl">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                Enter Customer 6-Digit Delivery OTP
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={deliveryOtp}
                onChange={(e) => setDeliveryOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code (e.g. 123456)"
                className="w-full px-4 py-3.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-bold text-center tracking-widest text-lg focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleResendOtp}
                  disabled={isResendingOtp || isUpdatingOrderStatus}
                  className="w-full py-3 bg-slate-950 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  {isResendingOtp ? 'Resending...' : 'Resend OTP'}
                </button>
                <button
                  onClick={handleCompleteOrder}
                  disabled={isUpdatingOrderStatus || deliveryOtp.length !== 6}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                >
                  <FiCheckCircle />
                  {isUpdatingOrderStatus ? 'Completing...' : 'Deliver Order'}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => order.phone && window.open(`tel:${order.phone}`, '_self')}
            disabled={!order.phone}
            className="w-full py-3.5 bg-slate-950 border border-slate-700/80 text-slate-200 hover:text-white hover:border-amber-500/40 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <FiPhone className="text-amber-400 text-base" />
            <span>Call Customer</span>
          </button>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default DeliveryOrderDetail;
