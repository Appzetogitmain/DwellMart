import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiCheckCircle, FiClock, FiPackage, FiTruck, FiMapPin, FiArrowLeft } from 'react-icons/fi';
import MobileLayout from "../components/Layout/MobileLayout";
import { useOrderStore } from '../../../shared/store/orderStore';
import { formatPrice } from '../../../shared/utils/helpers';
import { formatVariantLabel } from '../../../shared/utils/variant';
import PageTransition from '../../../shared/components/PageTransition';
import Badge from '../../../shared/components/Badge';
import LazyImage from '../../../shared/components/LazyImage';
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import { useAuthStore } from '../../../shared/store/authStore';
import QuickCommerceTrackingPanel from '../components/QuickCommerceTrackingPanel';
import DtdcTrackingPanel from '../components/DtdcTrackingPanel';
import { useOrderTracking } from '../../../shared/hooks/useOrderTracking';

const MobileTrackOrder = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "Loading order...",
    "Order Not Found",
    "Back to Orders",
    "Go Home",
    "Order Placed",
    "Processing",
    "Shipped",
    "Delivered",
    "Cancelled",
    "Returned",
    "Track Order",
    "Order Status",
    "Tracking Number",
    "Shipping Address",
    "Order Items",
    "Item details are not available for this tracking view.",
    "Estimated Delivery",
    "View Order Details",
    "Continue Shopping",
    "N/A",
    "Order Placed"
  ]);

  const { translateArray } = useDynamicTranslation();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { getOrder, fetchOrderById, fetchPublicTrackingOrder, lastError } = useOrderStore();
  const { user } = useAuthStore();
  const [isResolving, setIsResolving] = useState(true);
   const order = getOrder(orderId);
  const [translatedOrderItems, setTranslatedOrderItems] = useState([]);

  useEffect(() => {
    const translateContent = async () => {
      if (order?.items) {
        const translated = await translateArray(order.items, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
        setTranslatedOrderItems(translated);
      }
    };
    translateContent();
  }, [order, translateArray]);

  const shippingAddress = order?.shippingAddress || {};
  const orderItems = translatedOrderItems.length > 0 ? translatedOrderItems : (Array.isArray(order?.items) ? order.items : []);
  const { tracking } = useOrderTracking(orderId);
  const effectiveStatus = String(
    tracking?.quickCommerceStatus || tracking?.status || order?.status || 'pending'
  ).toLowerCase();
  const displayOrderId = order?.id || order?.orderId || orderId;
  const hasShippingAddress = Boolean(
    shippingAddress?.name ||
    shippingAddress?.address ||
    shippingAddress?.city ||
    shippingAddress?.state ||
    shippingAddress?.zipCode
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!order && orderId) {
        const privateOrder = await fetchOrderById(orderId);
        if (!privateOrder) {
          await fetchPublicTrackingOrder(orderId);
        }
      }
      if (mounted) setIsResolving(false);
    })();
    return () => {
      mounted = false;
    };
  }, [order, orderId, fetchOrderById, fetchPublicTrackingOrder]);

  useEffect(() => {
    if (!isResolving && !order) {
      navigate(user?.id ? '/orders' : '/home');
    }
  }, [isResolving, order, navigate, user?.id]);

  if (isResolving) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
             <p className="text-gray-600">{t('Loading order...')}</p>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  if (!order) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center">
               <h2 className="text-xl font-bold text-gray-800 mb-4">{t('Order Not Found')}</h2>
              {lastError ? (
                <p className="text-sm text-gray-500 mb-4">{lastError}</p>
              ) : null}
              <button
                onClick={() => navigate(user?.id ? '/orders' : '/home')}
                className="gradient-green text-white px-6 py-3 rounded-xl font-semibold"
              >
                 {user?.id ? t('Back to Orders') : t('Go Home')}
              </button>
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

   const formatDate = (dateString) => {
    if (!dateString) return t('N/A');
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return t('N/A');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getTrackingSteps = () => {
    const isCancelled = ['cancelled', 'delivery_failed'].includes(effectiveStatus);
    const isReturned = ['returned', 'returned_to_store'].includes(effectiveStatus);
    const isProcessingOrLater = [
      'confirmed', 'approved', 'processing', 'packed', 'accepted', 'preparing', 'ready',
      'shipped', 'dispatched', 'in_transit', 'out_for_delivery', 'picked_up', 'arriving', 'delivered', 'returned'
    ].includes(effectiveStatus);
    const isShippedOrLater = [
      'shipped', 'dispatched', 'in_transit', 'out_for_delivery', 'picked_up', 'arriving', 'delivered', 'returned'
    ].includes(effectiveStatus);
    const isDelivered = effectiveStatus === 'delivered';

    const processingDate = order?.packedAt || order?.processingAt || (isProcessingOrLater ? (order?.updatedAt || order?.date || order?.createdAt) : null);
    const shippedDate = order?.shippedAt || tracking?.shipment?.pickedUpAt || tracking?.shipment?.inTransitAt || (isShippedOrLater ? order?.updatedAt : null);
    const deliveredDate = order?.deliveredAt || tracking?.shipment?.deliveredAt || order?.estimatedDelivery;

    const steps = [
      {
        label: t('Order Placed'),
        completed: true,
        date: order?.date || order?.createdAt,
        icon: FiCheckCircle,
      },
      {
        label: t('Processing'),
        completed: !isCancelled && isProcessingOrLater,
        date: processingDate,
        icon: FiPackage,
      },
      {
        label: t('Shipped'),
        completed: !isCancelled && isShippedOrLater,
        date: shippedDate,
        icon: FiTruck,
      },
      {
        label: t('Delivered'),
        completed: isDelivered,
        date: isDelivered ? deliveredDate : null,
        icon: FiCheckCircle,
      },
    ];

    if (isCancelled || isReturned) {
      steps.push({
        label: isCancelled ? t('Cancelled') : t('Returned'),
        completed: true,
        date: order?.cancelledAt || order?.returnedAt || order?.updatedAt || order?.date || order?.createdAt,
        icon: FiClock,
      });
    }
    return steps;
  };

  const steps = getTrackingSteps();

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={true}>
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
                   <h1 className="text-xl font-bold text-content">{t('Track Order')}</h1>
                  <p className="text-sm text-content-secondary">{t('Order')} #{displayOrderId}</p>
                </div>
                 <Badge variant={effectiveStatus}>{t(effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1).toLowerCase())}</Badge>
              </div>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* Quick Commerce live tracking. Renders nothing for Marketplace orders. */}
              <QuickCommerceTrackingPanel orderId={orderId} />

              {/* DTDC shipment tracking for retail/wholesale orders */}
              {!tracking?.isQuickCommerce && (
                <DtdcTrackingPanel
                  shipment={tracking?.shipment}
                  trackingNumber={tracking?.trackingNumber || order?.trackingNumber}
                  deliveryPartner={tracking?.deliveryPartner}
                />
              )}

              {/* Tracking Timeline */}
              <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
                 <h2 className="text-base font-bold text-content mb-4">{t('Order Status')}</h2>
                <div className="space-y-4">
                  {steps.map((step, index) => {
                    const Icon = step.icon;
                    return (
                      <div key={index} className="flex items-start gap-4">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${step.completed
                          ? 'bg-brand-primary text-black'
                          : 'bg-surface-muted text-content-muted border border-border'
                          }`}>
                          <Icon className="text-lg" />
                        </div>
                        <div className="flex-1">
                          <h3 className={`font-semibold text-sm mb-1 ${step.completed ? 'text-content' : 'text-content-muted'
                            }`}>
                            {step.label}
                          </h3>
                          <p className="text-xs text-content-muted">{formatDate(step.date)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tracking Number */}
              {order.trackingNumber && (
                <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
                   <h2 className="text-base font-bold text-content mb-2">{t('Tracking Number')}</h2>
                  <p className="text-lg font-bold text-brand-primary">{order.trackingNumber}</p>
                </div>
              )}

              {/* Shipping Address */}
              {hasShippingAddress ? (
                <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
                  <h2 className="text-base font-bold text-content mb-3 flex items-center gap-2">
                     <FiMapPin className="text-brand-primary" />
                    {t('Shipping Address')}
                  </h2>
                  <div className="text-sm text-content-secondary space-y-1">
                     <p className="font-semibold text-content">{shippingAddress.name || t('N/A')}</p>
                    <p>{shippingAddress.address || t('N/A')}</p>
                    <p>
                      {shippingAddress.city || t('N/A')}, {shippingAddress.state || t('N/A')}{' '}
                      {shippingAddress.zipCode || t('N/A')}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Order Items */}
              <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
                 <h2 className="text-base font-bold text-content mb-3">{t('Order Items')}</h2>
                <div className="space-y-3">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-surface-muted border border-border-light flex-shrink-0">
                        <LazyImage
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-content text-sm mb-1">{item.name}</h3>
                        <p className="text-xs text-content-secondary">
                          {formatPrice(item.price)} x {item.quantity}
                        </p>
                        {formatVariantLabel(item?.variant) && (
                          <p className="text-[11px] text-content-muted">
                            {formatVariantLabel(item?.variant)}
                          </p>
                        )}
                      </div>
                      <p className="font-bold text-content text-sm">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                   {orderItems.length === 0 && (
                    <p className="text-sm text-content-secondary">{t('Item details are not available for this tracking view.')}</p>
                  )}
                </div>
              </div>

              {/* Estimated Delivery */}
              {order.estimatedDelivery && (
                <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
                   <h2 className="text-base font-bold text-content mb-2">{t('Estimated Delivery')}</h2>
                  <p className="text-lg font-semibold text-brand-primary">
                    {formatDate(order.estimatedDelivery)}
                  </p>
                </div>
              )}

              {/* Actions */}
              {user?.id ? (
                <button
                   onClick={() => navigate(`/orders/${displayOrderId}`)}
                  className="w-full py-3 bg-brand-primary text-black rounded-xl font-semibold hover:bg-brand-primaryHover transition-all"
                >
                  {t('View Order Details')}
                </button>
              ) : (
                <button
                   onClick={() => navigate('/home')}
                  className="w-full py-3 bg-brand-primary text-black rounded-xl font-semibold hover:bg-brand-primaryHover transition-all"
                >
                  {t('Continue Shopping')}
                </button>
              )}
            </div>
          </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileTrackOrder;

