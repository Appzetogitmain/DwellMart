import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiPackage, FiTruck, FiMapPin, FiCreditCard, FiRotateCw, FiArrowLeft, FiShoppingBag, FiX } from 'react-icons/fi';
import { motion } from 'framer-motion';
import MobileLayout from "../components/Layout/MobileLayout";
import { useOrderStore } from '../../../shared/store/orderStore';
import { useCartStore } from '../../../shared/store/useStore';
import { formatPrice } from '../../../shared/utils/helpers';
import Price from '../../../shared/components/Price';
import { formatVariantLabel, getVariantSignature } from '../../../shared/utils/variant';
import toast from 'react-hot-toast';
import PageTransition from '../../../shared/components/PageTransition';
import Badge from '../../../shared/components/Badge';
import LazyImage from '../../../shared/components/LazyImage';
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";

const MobileOrderDetail = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "Loading order...",
    "Order Not Found",
    "Back to Orders",
    "Items added to cart!",
    "Are you sure you want to cancel this order?",
    "Order cancelled successfully",
    "Failed to cancel order",
    "This order cannot be cancelled",
    "Return can only be requested for delivered orders",
    "Please enter a valid return reason",
    "Please select a vendor for return request",
    "Return request submitted successfully",
    "Failed to submit return request",
    "Order Details",
    "Order Summary",
    "Shipping Address",
    "Payment Information",
    "Subtotal",
    "Discount",
    "Shipping",
    "Tax",
    "Total",
    "Cancel Order",
    "Reorder",
    "Request Return",
    "Track Order",
    "Reason",
    "Select Vendor",
    "Choose vendor",
    "Describe the issue briefly",
    "Submitting...",
    "Submit Return Request",
    "N/A",
    "Phone:",
    "Credit/Debit Card",
    "Cash on Delivery",
    "Bank Transfer",
    "Order Items",
    "Payment Method:",
    "Tracking Number:",
    "Order Date:"
  ]);

  const { translateArray } = useDynamicTranslation();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { getOrder, cancelOrder, fetchOrderById, requestReturn } = useOrderStore();
  const { addItem } = useCartStore();
  const [isResolving, setIsResolving] = useState(true);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('Product issue');
  const [returnVendorId, setReturnVendorId] = useState('');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
   const order = useMemo(() => getOrder(orderId), [getOrder, orderId]);
  const [translatedVendorGroups, setTranslatedVendorGroups] = useState([]);
  const [translatedOrderItems, setTranslatedOrderItems] = useState([]);

  useEffect(() => {
    let active = true;
    const translateContent = async () => {
      if (order?.vendorItems) {
        const groups = await Promise.all(order.vendorItems.map(async (group) => {
          const items = await translateArray(group.items, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
          const vendorNameRes = await translateArray([{ name: group.vendorName }], ['name']);
          return {
            ...group,
            vendorName: vendorNameRes[0]?.name || group.vendorName,
            items
          };
        }));
        if (active) setTranslatedVendorGroups(groups);
      }
      if (order?.items) {
        const items = await translateArray(order.items, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
        if (active) setTranslatedOrderItems(items);
      }
    };
    translateContent();
    return () => { active = false; };
  }, [order, translateArray]);

  const shippingAddress = order?.shippingAddress || {};
  const orderItems = translatedOrderItems.length > 0 ? translatedOrderItems : (Array.isArray(order?.items) ? order.items : []);
  const vendorItems = translatedVendorGroups.length > 0 ? translatedVendorGroups : (order?.vendorItems || []);
  const vendorOptions = vendorItems.map((group) => ({
    id: String(group?.vendorId || ''),
    name: group?.vendorName || t('Vendor'),
  })).filter((group) => group.id);

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
      navigate('/orders');
    }
  }, [isResolving, order, navigate]);

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
              <button
                onClick={() => navigate('/orders')}
                className="gradient-green text-white px-6 py-3 rounded-xl font-semibold"
              >
                {t('Back to Orders')}
              </button>
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

   const formatDate = (dateString) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return t('N/A');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleReorder = () => {
    order.items.forEach((item) => {
      addItem({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image,
        quantity: item.quantity,
        variant: item.variant || undefined,
       });
    });
    toast.success(t('Items added to cart!'));
    navigate('/checkout');
  };

  const handleCancel = async () => {
     if (window.confirm(t('Are you sure you want to cancel this order?'))) {
      if (['pending', 'processing'].includes(order.status)) {
        try {
          await cancelOrder(order.id);
          toast.success(t('Order cancelled successfully'));
          navigate('/orders');
        } catch (error) {
          toast.error(t(error?.message || 'Failed to cancel order'));
        }
      } else {
        toast.error(t('This order cannot be cancelled'));
      }
    }
  };

  const openReturnModal = () => {
     if (order.status !== 'delivered') {
      toast.error(t('Return can only be requested for delivered orders'));
      return;
    }
    if (vendorOptions.length === 1) {
      setReturnVendorId(vendorOptions[0].id);
    } else if (!vendorOptions.find((v) => v.id === returnVendorId)) {
      setReturnVendorId(vendorOptions[0]?.id || '');
    }
    setShowReturnModal(true);
  };

  const handleRequestReturn = async () => {
    if (isSubmittingReturn) return;

     const reason = String(returnReason || '').trim();
    if (reason.length < 5) {
      toast.error(t('Please enter a valid return reason'));
      return;
    }

     if (vendorOptions.length > 1 && !returnVendorId) {
      toast.error(t('Please select a vendor for return request'));
      return;
    }

    try {
      setIsSubmittingReturn(true);
       await requestReturn(order.id, {
        reason,
        ...(returnVendorId ? { vendorId: returnVendorId } : {}),
      });
      toast.success(t('Return request submitted successfully'));
      setShowReturnModal(false);
      setReturnReason('Product issue');
    } catch (error) {
      toast.error(t(error?.response?.data?.message || error?.message || 'Failed to submit return request'));
    } finally {
      setIsSubmittingReturn(false);
    }
  };

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
                  <h1 className="text-xl font-bold text-content">{t('Order Details')}</h1>
                  <p className="text-sm text-content-secondary">{t('Order')} #{order.id}</p>
                </div>
                <Badge variant={order.status}>{t(order.status.toUpperCase())}</Badge>
              </div>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* Order Items */}
              <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
                <h2 className="text-base font-bold text-content mb-4">{t('Order Items')}</h2>
                {vendorItems && vendorItems.length > 0 ? (
                  <div className="space-y-4">
                    {vendorItems.map((vendorGroup) => (
                      <div key={vendorGroup.vendorId} className="space-y-2">
                        {/* Vendor Header */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-surface-muted rounded-lg border border-border">
                          <div className="w-5 h-5 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
                            <FiShoppingBag className="text-black text-[10px]" />
                          </div>
                          <span className="text-sm font-bold text-content flex-1">
                            {vendorGroup.vendorName}
                          </span>
                          <span className="text-xs font-semibold text-brand-primary bg-surface px-2 py-0.5 rounded-md border border-border">
                            <Price amount={vendorGroup.subtotal} />
                          </span>
                        </div>
                        {/* Vendor Items */}
                        <div className="space-y-2 pl-2">
                          {vendorGroup.items.map((item, itemIndex) => (
                            <div key={`${item.id}-${itemIndex}-${getVariantSignature(item?.variant || {})}`} className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-muted border border-border-light flex-shrink-0">
                                <LazyImage
                                  src={item.image}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-content text-sm mb-1">{item.name}</h3>
                                <p className="text-xs text-content-secondary">
                                  <Price amount={item.price} /> x {item.quantity}
                                </p>
                                {formatVariantLabel(item?.variant) && (
                                  <p className="text-[11px] text-content-muted">
                                    {formatVariantLabel(item?.variant)}
                                  </p>
                                )}
                              </div>
                              <p className="font-bold text-content text-sm">
                                <Price amount={item.price * item.quantity} />
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orderItems.map((item, itemIndex) => (
                      <div key={`${item.id}-${itemIndex}-${getVariantSignature(item?.variant || {})}`} className="flex items-center gap-3">
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
                            <Price amount={item.price} /> x {item.quantity}
                          </p>
                          {formatVariantLabel(item?.variant) && (
                                  <p className="text-[11px] text-content-muted">
                                    {formatVariantLabel(item?.variant)}
                                  </p>
                                )}
                        </div>
                        <p className="font-bold text-content text-sm">
                          <Price amount={item.price * item.quantity} />
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Shipping Address */}
              <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
                <h2 className="text-base font-bold text-content mb-3 flex items-center gap-2">
                  <FiMapPin className="text-brand-primary" />
                  {t('Shipping Address')}
                </h2>
                <div className="text-sm text-content-secondary space-y-1">
                  <p className="font-semibold text-content">{shippingAddress.name || 'N/A'}</p>
                  <p>{shippingAddress.address || 'N/A'}</p>
                  <p>
                    {shippingAddress.city || 'N/A'}, {shippingAddress.state || 'N/A'}{' '}
                    {shippingAddress.zipCode || 'N/A'}
                  </p>
                  <p>{shippingAddress.country || 'N/A'}</p>
                  <p className="mt-2">{t('Phone:')} {shippingAddress.phone || t('N/A')}</p>
                </div>
              </div>

              {/* Payment Info */}
              <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
                <h2 className="text-base font-bold text-content mb-3 flex items-center gap-2">
                  <FiCreditCard className="text-brand-primary" />
                  {t('Payment Information')}
                </h2>
                <div className="text-sm text-content-secondary space-y-2">
                  <div className="flex justify-between">
                    <span>{t('Payment Method:')}</span>
                    <span className="font-semibold text-content capitalize">
                      {order.paymentMethod === 'card' ? t('Credit/Debit Card') :
                        order.paymentMethod === 'cash' ? t('Cash on Delivery') :
                          order.paymentMethod === 'bank' ? t('Bank Transfer') :
                            (order.paymentMethod || t('N/A'))}
                    </span>
                  </div>
                  {order.trackingNumber && (
                    <div className="flex justify-between">
                      <span>{t('Tracking Number:')}</span>
                      <span className="font-semibold text-content">{order.trackingNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>{t('Order Date:')}</span>
                    <span className="font-semibold text-content">{formatDate(order.date)}</span>
                  </div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
                <h2 className="text-base font-bold text-content mb-3">{t('Order Summary')}</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-content-secondary">
                    <span>{t('Subtotal')}</span>
                    <Price amount={order.subtotal} />
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-status-success">
                      <span>{t('Discount')}</span>
                      <Price amount={order.discount} prefix="-" />
                    </div>
                  )}
                  <div className="flex justify-between text-content-secondary">
                    <span>{t('Shipping')}</span>
                    <Price amount={order.shipping} />
                  </div>
                  <div className="flex justify-between text-content-secondary">
                    <span>{t('Tax')}</span>
                    <Price amount={order.tax} />
                  </div>
                  <div className="flex justify-between text-lg font-bold text-content pt-2 border-t border-border">
                    <span>{t('Total')}</span>
                    <Price amount={order.total} className="text-brand-primary" />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {['pending', 'processing'].includes(order.status) && (
                  <button
                    onClick={handleCancel}
                    className="w-full py-3 bg-status-errorBg text-status-error border border-status-error/30 rounded-xl font-semibold hover:opacity-90 transition-colors"
                  >
                    {t('Cancel Order')}
                  </button>
                )}
                <button
                  onClick={handleReorder}
                  className="w-full py-3 bg-brand-primary text-black rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-brand-primaryHover transition-all"
                >
                  <FiRotateCw className="text-lg" />
                  {t('Reorder')}
                </button>
                {order.status === 'delivered' && (
                  <button
                    onClick={openReturnModal}
                    className="w-full py-3 bg-status-warningBg text-status-warning border border-status-warning/30 rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-colors"
                  >
                    <FiPackage className="text-lg" />
                    {t('Request Return')}
                  </button>
                )}
                <button
                  onClick={() => navigate(`/track-order/${order.id}`)}
                  className="w-full py-3 bg-surface-muted text-content-secondary border border-border rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-border transition-colors"
                >
                  <FiTruck className="text-lg" />
                  {t('Track Order')}
                </button>
              </div>
            </div>
          </div>

          {showReturnModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center sm:justify-center"
              onClick={() => setShowReturnModal(false)}
            >
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 border border-border"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-content">{t('Request Return')}</h3>
                  <button
                    onClick={() => setShowReturnModal(false)}
                    className="p-2 rounded-full hover:bg-surface-muted"
                  >
                    <FiX className="text-content-secondary" />
                  </button>
                </div>

                {vendorOptions.length > 1 && (
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-content-secondary mb-2">
                      {t('Select Vendor')}
                    </label>
                    <select
                      value={returnVendorId}
                      onChange={(e) => setReturnVendorId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-border bg-surface text-content rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    >
                      <option value="">{t('Choose vendor')}</option>
                      {vendorOptions.map((vendor) => (
                        <option key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-content-secondary mb-2">
                    {t('Reason')}
                  </label>
                  <textarea
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-border bg-surface text-content rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    placeholder={t("Describe the issue briefly")}
                  />
                </div>

                <button
                  onClick={handleRequestReturn}
                  disabled={isSubmittingReturn}
                  className="w-full py-3 bg-brand-primary text-black rounded-xl font-semibold hover:bg-brand-primaryHover disabled:opacity-70"
                >
                  {isSubmittingReturn ? t('Submitting...') : t('Submit Return Request')}
                </button>
              </motion.div>
            </motion.div>
          )}
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileOrderDetail;




