import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiCheckCircle, FiTruck, FiEye } from 'react-icons/fi';
import { motion } from 'framer-motion';
import MobileLayout from "../components/Layout/MobileLayout";
import { useOrderStore } from '../../../shared/store/orderStore';
import { formatPrice } from '../../../shared/utils/helpers';
import { formatVariantLabel } from '../../../shared/utils/variant';
import PageTransition from '../../../shared/components/PageTransition';
import LazyImage from '../../../shared/components/LazyImage';
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import { Card, Alert, Button, Badge } from "../../../shared/components/ui";

const MobileOrderConfirmation = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "Loading order...",
    "Order Not Found",
    "Go Home",
    "Order Confirmed!",
    "Thank you for your purchase. Your order has been received and is being processed.",
    "Order Number",
    "Tracking Number",
    "Order Date",
    "Total Amount",
    "Payment Method",
    "Order Items",
    "more item",
    "more items",
    "No item details available for this order.",
    "View Order Details",
    "Track Order",
    "Continue Shopping",
    "Credit/Debit Card",
    "Cash on Delivery",
    "Bank Transfer",
    "N/A"
  ]);

  const { translateArray } = useDynamicTranslation();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { getOrder, fetchOrderById, lastError } = useOrderStore();
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

  const orderItems = translatedOrderItems.length > 0 ? translatedOrderItems : (Array.isArray(order?.items) ? order.items : []);
  const displayOrderId = order?.id || order?.orderId || orderId;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!order && orderId) {
        await fetchOrderById(orderId);
      }
      if (mounted) setIsResolving(false);
    })();
    return () => {
      mounted = false;
    };
  }, [order, orderId, fetchOrderById]);

  useEffect(() => {
    if (!isResolving && !order) {
      navigate('/home');
    }
  }, [isResolving, order, navigate]);

  if (isResolving) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
             <p className="text-textColor-muted font-bold">{t('Loading order...')}</p>
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
              <h2 className="text-xl font-bold text-textColor-primary mb-4">{t('Order Not Found')}</h2>
              {lastError ? (
                <p className="text-sm text-textColor-muted mb-4">{lastError}</p>
              ) : null}
              <Button onClick={() => navigate('/home')} variant="primary" size="md">
                {t('Go Home')}
              </Button>
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
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={false}>
        <div className="w-full min-h-screen flex items-center justify-center px-4 py-8 bg-surface-background">
          <div className="w-full max-w-md lg:max-w-lg space-y-4">
            
            {/* Success Alert Banner */}
            <Alert
              variant="success"
              title={t('Order Confirmed!')}
              description={t('Thank you for your purchase. Your order has been received and is being processed.')}
            />

            {/* Order Summary Details */}
            <Card variant="default" padding="lg">
              <div className="text-center mb-6">
                <p className="text-xs font-bold text-textColor-muted uppercase tracking-wide mb-1">{t('Order Number')}</p>
                <p className="text-xl font-black text-textColor-primary">{displayOrderId}</p>
                {order.trackingNumber && (
                  <div className="mt-3">
                    <p className="text-xs font-bold text-textColor-muted uppercase tracking-wide mb-1">{t('Tracking Number')}</p>
                    <Badge variant="gold" size="md">{order.trackingNumber}</Badge>
                  </div>
                )}
              </div>

              <div className="border-t border-borderToken-default pt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-textColor-muted font-medium">{t('Order Date')}</span>
                  <span className="font-bold text-textColor-primary">{formatDate(order.date || order.createdAt)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-textColor-muted font-medium">{t('Total Amount')}</span>
                  <span className="font-black text-brand-primary text-lg">{formatPrice(order.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-textColor-muted font-medium">{t('Payment Method')}</span>
                  <span className="font-bold text-textColor-primary capitalize">
                    {order.paymentMethod === 'card' ? t('Credit/Debit Card') :
                      order.paymentMethod === 'cash' ? t('Cash on Delivery') :
                        order.paymentMethod === 'bank' ? t('Bank Transfer') :
                          (order.paymentMethod || t('N/A'))}
                  </span>
                </div>
              </div>
            </Card>

            {/* Order Items Summary Card */}
            <Card variant="default" padding="lg">
              <h2 className="text-base font-bold text-textColor-primary mb-4">{t('Order Items')}</h2>
              <div className="space-y-3">
                {orderItems.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-card overflow-hidden bg-surface-background border border-borderToken-default flex-shrink-0">
                      <LazyImage
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-textColor-primary text-sm mb-0.5 line-clamp-1">{item.name}</h3>
                      <p className="text-xs text-textColor-muted font-medium">
                        {formatPrice(item.price)} x {item.quantity}
                      </p>
                      {formatVariantLabel(item?.variant) && (
                        <p className="text-[11px] text-textColor-muted">
                          {formatVariantLabel(item?.variant)}
                        </p>
                      )}
                    </div>
                    <p className="font-bold text-textColor-primary text-sm">
                      {formatPrice(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
                {orderItems.length > 3 && (
                  <p className="text-xs text-textColor-muted text-center pt-2 font-semibold">
                     +{orderItems.length - 3} {orderItems.length - 3 !== 1 ? t('more items') : t('more item')}
                  </p>
                )}
                {orderItems.length === 0 && (
                  <p className="text-xs text-textColor-muted text-center pt-2 font-semibold">{t('No item details available for this order.')}</p>
                )}
              </div>
            </Card>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <Button
                as={Link}
                to={`/orders/${displayOrderId}`}
                variant="primary"
                size="lg"
                fullWidth
                leftIcon={<FiEye />}
              >
                {t('View Order Details')}
              </Button>
              <Button
                as={Link}
                to={`/track-order/${displayOrderId}`}
                variant="secondary"
                size="lg"
                fullWidth
                leftIcon={<FiTruck />}
              >
                {t('Track Order')}
              </Button>
              <Button
                onClick={() => navigate('/home')}
                variant="outline"
                size="lg"
                fullWidth
              >
                {t('Continue Shopping')}
              </Button>
            </div>
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileOrderConfirmation;

