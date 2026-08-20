import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    FiArrowLeft,
    FiPackage,
    FiMapPin,
    FiUser,
    FiDollarSign,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { getVendorOrderById, updateVendorOrderStatus, getOrdersAwaitingShipment } from '../../services/vendorService';
import { formatPrice, getPlaceholderImage } from '../../../../shared/utils/helpers';
import Badge from '../../../../shared/components/Badge';
import WholesaleBadge from '../../../../shared/components/WholesaleBadge';
import AnimatedSelect from '../../../Admin/components/AnimatedSelect';
import QuickCommerceOrderPanel from '../../components/QuickCommerceOrderPanel';
import toast from 'react-hot-toast';
import DtdcShipmentPanel from '../../../../shared/components/DtdcShipmentPanel';

const OrderDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { vendor } = useVendorAuthStore();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    /**
     * How long this order has been dispatch-ready without a courier booking.
     * Comes from the awaiting-shipment endpoint so the banner, the list chip
     * and the alert all agree — recomputing it here would be a fourth copy of
     * the eligibility rule.
     */
    const [readySinceHours, setReadySinceHours] = useState(null);

    const vendorId = vendor?.id || vendor?._id || vendor?.userId;
    const shippingAddress = order?.shippingAddress ?? order?.address ?? null;
    const customerName =
        order?.customer?.name ??
        order?.userId?.name ??
        order?.guestInfo?.name ??
        'Guest';
    const customerEmail =
        order?.customer?.email ??
        order?.userId?.email ??
        order?.guestInfo?.email ??
        'N/A';

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await getOrdersAwaitingShipment({ limit: 100 });
                if (cancelled) return;
                const match = (res?.data?.orders ?? []).find(
                    (o) => String(o.orderId) === String(id) || String(o._id) === String(id)
                );
                setReadySinceHours(match ? match.hoursAwaiting : null);
            } catch {
                if (!cancelled) setReadySinceHours(null);
            }
        })();
        return () => { cancelled = true; };
    }, [id]);

    useEffect(() => {
        if (!id) return;

        const fetchOrder = async () => {
            setLoading(true);
            try {
                const res = await getVendorOrderById(id);
                const data = res?.data ?? res;
                setOrder(data ?? null);
            } catch {
                // api.js shows toast
                setOrder(null);
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
    }, [id, vendorId]);

    const handleStatusChange = async (newStatus) => {
        if (!order) return;
        setUpdatingStatus(true);
        try {
            await updateVendorOrderStatus(order.orderId ?? order._id, newStatus);
            // Optimistically update local state
            setOrder((prev) => ({
                ...prev,
                vendorItems: prev.vendorItems?.map((vi) =>
                    vi.vendorId?.toString() === vendorId?.toString()
                        ? { ...vi, status: newStatus }
                        : vi
                ),
                status: newStatus,
            }));
            toast.success(`Order status updated to ${newStatus}`);
        } catch {
            // api.js shows toast
        } finally {
            setUpdatingStatus(false);
        }
    };

    // Derive per-vendor status & orderType from vendorItems
    const vendorItem = order?.vendorItems?.find(
        (vi) => String(vi.vendorId?._id || vi.vendorId) === String(vendorId)
    ) || order?.vendorItems?.[0];
    const orderType = String(vendorItem?.orderType || order?.orderType || 'retail').toLowerCase();
    const currentStatus = String(vendorItem?.status ?? order?.status ?? 'pending').toLowerCase();

    // Strategy-based status options & transition map
    const isWholesale = orderType === 'wholesale';

    const statusOptions = isWholesale
      ? [
          { value: 'pending', label: 'Pending', color: 'yellow' },
          { value: 'approved', label: 'Approved', color: 'blue' },
          { value: 'processing', label: 'Processing', color: 'indigo' },
          { value: 'packed', label: 'Packed', color: 'purple' },
          { value: 'dispatched', label: 'Dispatched', color: 'purple' },
          { value: 'delivered', label: 'Delivered', color: 'green' },
          { value: 'cancelled', label: 'Cancelled', color: 'red' },
        ]
      : [
          { value: 'pending', label: 'Pending', color: 'yellow' },
          { value: 'confirmed', label: 'Confirmed', color: 'blue' },
          { value: 'packed', label: 'Packed', color: 'purple' },
          { value: 'shipped', label: 'Shipped', color: 'purple' },
          { value: 'out_for_delivery', label: 'Out for Delivery', color: 'amber' },
          { value: 'delivered', label: 'Delivered', color: 'green' },
          { value: 'cancelled', label: 'Cancelled', color: 'red' },
        ];

    const transitionMap = isWholesale
      ? {
          pending: ['pending', 'approved', 'cancelled'],
          approved: ['approved', 'processing', 'cancelled'],
          processing: ['processing', 'packed'],
          packed: ['packed', 'dispatched'],
          dispatched: ['dispatched', 'delivered'],
          delivered: ['delivered'],
          cancelled: ['cancelled'],
        }
      : {
          pending: ['pending', 'confirmed', 'cancelled'],
          confirmed: ['confirmed', 'packed', 'cancelled'],
          packed: ['packed', 'shipped'],
          shipped: ['shipped', 'out_for_delivery'],
          out_for_delivery: ['out_for_delivery', 'delivered'],
          delivered: ['delivered'],
          cancelled: ['cancelled'],
          processing: ['processing', 'shipped', 'cancelled'],
        };

    const allowedStatuses = transitionMap[currentStatus] || [currentStatus];
    const visibleStatusOptions = statusOptions.filter((option) =>
        allowedStatuses.includes(option.value)
    );

    // Items this vendor sold in this order
    const vendorItems = (vendorItem?.items && vendorItem.items.length > 0) ? vendorItem.items : (order?.items || []);
    const vendorSubtotal = vendorItem?.subtotal ?? order?.subtotal ?? 0;

    if (loading) {
        return (
            <div className="p-6 text-center">
                <p className="text-gray-500">Loading order details...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-6 text-center space-y-3">
                <p className="text-gray-700 font-semibold">Order not found</p>
                <p className="text-sm text-gray-500">
                    Order #{id} may not belong to your store.
                </p>
                <Link
                    to="/vendor/orders"
                    className="inline-block text-blue-600 hover:underline text-sm"
                >
                    ← Back to Orders
                </Link>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link
                        to="/vendor/orders"
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <FiArrowLeft className="text-gray-600" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-bold text-gray-800">
                                Order #{order.orderId ?? order._id}
                            </h1>
                            {/* This vendor's own slice, not the whole order. */}
                            <WholesaleBadge orderType={vendorItem?.orderType} />
                        </div>
                        <p className="text-sm text-gray-500">
                            Placed on{' '}
                            {order.createdAt
                                ? new Date(order.createdAt).toLocaleDateString()
                                : '—'}
                        </p>
                    </div>
                </div>

                {order.experience !== 'quick_commerce' && (
                    <div className="flex items-center gap-3">
                        <AnimatedSelect
                            options={visibleStatusOptions}
                            value={currentStatus}
                            onChange={(e) => handleStatusChange(e.target.value)}
                            disabled={updatingStatus}
                            color={
                                visibleStatusOptions.find((opt) => opt.value === currentStatus)
                                    ?.color || 'gray'
                            }
                        />
                    </div>
                )}
            </div>

            {order.experience === 'quick_commerce' && (
                <QuickCommerceOrderPanel
                    order={order}
                    vendorId={vendorId}
                    onStatusUpdated={(updated) => {
                        const updatedOrder = typeof updated === 'object' ? updated : null;
                        const nextQcStatus = updatedOrder?.quickCommerce?.status || (typeof updated === 'string' ? updated : 'accepted');
                        setOrder((prev) => ({
                            ...prev,
                            status: updatedOrder?.status || prev.status,
                            quickCommerce: {
                                ...(prev?.quickCommerce || {}),
                                ...(updatedOrder?.quickCommerce || {}),
                                status: nextQcStatus,
                            },
                        }));
                    }}
                />
            )}

            {/* DTDC Shipment Management — retail/wholesale only. */}
            {order.experience !== 'quick_commerce' && order.fulfillmentType !== 'quick_commerce' && (
                <DtdcShipmentPanel
                    orderId={id}
                    context="vendor"
                    readySinceHours={readySinceHours}
                    fulfillmentType={order.fulfillmentType || vendorItem?.fulfillmentType || vendorItem?.orderType}
                />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Order Items */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 border-b border-gray-200">
                            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                                <FiPackage />
                                Your Items in this Order
                            </h2>
                        </div>
                        <div className="divide-y divide-gray-200">
                            {vendorItems.length > 0 ? (
                                vendorItems.map((item, index) => (
                                    <div key={index} className="p-4 flex gap-4">
                                        <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                            <img
                                                src={item.image}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.src = getPlaceholderImage(64, 64, 'P');
                                                }}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-medium text-gray-800">
                                                        {item.name}
                                                    </h3>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="text-sm text-gray-500">
                                                            Qty: {item.quantity}
                                                        </p>
                                                        <WholesaleBadge
                                                            orderType={item.pricingType}
                                                            context="item"
                                                        />
                                                        {item.appliedTier?.minQty && (
                                                            <span className="text-xs text-gray-500">
                                                                {item.appliedTier.minQty}+ tier
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="font-semibold text-gray-800">
                                                    {formatPrice(
                                                        (item.price ?? 0) * (item.quantity ?? 1)
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-6 text-center text-gray-500 text-sm">
                                    No item details available for this order.
                                </div>
                            )}
                        </div>
                        {vendorSubtotal > 0 && (
                            <div className="p-4 border-t border-gray-200 flex justify-end">
                                <div className="text-right">
                                    <p className="text-sm text-gray-500">
                                        Your subtotal
                                    </p>
                                    <p className="text-lg font-bold text-gray-800">
                                        {formatPrice(vendorSubtotal)}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Order Financial Breakdown */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
                        <h2 className="font-semibold text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
                            <FiDollarSign className="text-emerald-600" />
                            Allocated Order Financial Breakdown
                        </h2>

                        {/* Payment Method Badge */}
                        {(() => {
                            const rawMethod = String(order?.paymentMethod || '').toLowerCase();
                            const isCod = rawMethod === 'cod' || rawMethod === 'cash';
                            return (
                                <div className={`p-3 rounded-xl border flex items-center justify-between ${
                                    isCod 
                                        ? 'bg-amber-50 border-amber-200 text-amber-900' 
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                }`}>
                                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Method</span>
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                                        isCod 
                                            ? 'bg-amber-500 text-slate-950' 
                                            : 'bg-emerald-600 text-white'
                                    }`}>
                                        {isCod ? '💵 Cash on Delivery (COD)' : `💳 Prepaid${['card', 'upi', 'wallet', 'bank', 'netbanking'].includes(rawMethod) ? ` (${rawMethod.toUpperCase()})` : ''}`}
                                    </span>
                                </div>
                            );
                        })()}

                        <div className="space-y-2 text-sm pt-1">
                            <div className="flex items-center justify-between text-gray-600">
                                <span>Items Subtotal</span>
                                <span className="font-semibold text-gray-800">
                                    {formatPrice(vendorItem?.subtotal ?? vendorSubtotal)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-gray-600">
                                <span>Delivery / Shipping Allocation</span>
                                <span className="font-semibold text-gray-800">
                                    {formatPrice(vendorItem?.shipping ?? order?.shipping ?? 0)}
                                </span>
                            </div>
                            {(() => {
                                const resolvedPkgFee = Number(vendorItem?.packagingFee ?? order?.quickCommerce?.delivery?.packagingFee ?? order?.packagingFee ?? 0);
                                return (
                                    <>
                                        {resolvedPkgFee > 0 && (
                                            <div className="flex items-center justify-between text-gray-600">
                                                <span>Packaging Fee</span>
                                                <span className="font-semibold text-gray-800">
                                                    {formatPrice(resolvedPkgFee)}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-gray-600">
                                            <span>Estimated GST & Tax Allocation</span>
                                            <span className="font-semibold text-gray-800">
                                                {formatPrice(vendorItem?.tax ?? order?.tax ?? 0)}
                                            </span>
                                        </div>
                                        {(vendorItem?.discount > 0) && (
                                            <div className="flex items-center justify-between text-emerald-600">
                                                <span>Coupon / Discount</span>
                                                <span className="font-semibold">
                                                    -{formatPrice(vendorItem?.discount ?? 0)}
                                                </span>
                                            </div>
                                        )}
                                        <div className="border-t border-gray-200 pt-2 flex items-center justify-between text-base font-bold text-gray-900">
                                            <span>Your Allocated Group Total</span>
                                            <span className="text-emerald-600">
                                                {formatPrice(
                                                    (vendorItem?.subtotal ?? vendorSubtotal) +
                                                    (vendorItem?.shipping ?? order?.shipping ?? 0) +
                                                    resolvedPkgFee +
                                                    (vendorItem?.tax ?? order?.tax ?? 0) -
                                                    (vendorItem?.discount ?? 0)
                                                )}
                                            </span>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
                            <span className="text-gray-500">Item Status</span>
                            <Badge
                                variant={
                                    currentStatus === 'delivered'
                                        ? 'success'
                                        : currentStatus === 'pending'
                                            ? 'warning'
                                            : currentStatus === 'cancelled'
                                                ? 'error'
                                                : 'info'
                                }
                            >
                                {currentStatus.toUpperCase()}
                            </Badge>
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Customer Info */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <FiUser />
                            Customer Details
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm text-gray-500">Name</p>
                                <p className="font-medium">{customerName}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Email</p>
                                <p className="font-medium">{customerEmail}</p>
                            </div>
                        </div>
                    </div>

                    {/* Shipping Address */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <FiMapPin />
                            Shipping Address
                        </h2>
                        {shippingAddress ? (
                            <p className="text-gray-600 text-sm leading-relaxed">
                                {shippingAddress.address ?? shippingAddress.street ?? 'N/A'}
                                <br />
                                {shippingAddress.city}, {shippingAddress.state}{' '}
                                {shippingAddress.zipCode}
                                <br />
                                {shippingAddress.country}
                            </p>
                        ) : (
                            <p className="text-sm text-gray-400">
                                No address available
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default OrderDetail;
