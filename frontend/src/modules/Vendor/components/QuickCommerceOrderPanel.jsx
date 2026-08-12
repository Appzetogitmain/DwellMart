import { useState } from 'react';
import { FiCheckCircle, FiClock, FiPackage, FiTruck, FiAlertCircle } from 'react-icons/fi';
import { updateVendorQuickCommerceStatus } from '../services/vendorService';
import toast from 'react-hot-toast';
import Badge from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/ui';

export default function QuickCommerceOrderPanel({ order, vendorId, onStatusUpdated }) {
  const [loading, setLoading] = useState(false);

  if (!order) return null;

  // Derive per-vendor status from vendorItems or top-level order status
  const vendorItem = order?.vendorItems?.find(
    (vi) => vi.vendorId?.toString() === vendorId?.toString() || vi.vendorId === vendorId
  );
  
  const currentStatus = (
    order?.quickCommerce?.status ||
    vendorItem?.status ||
    order?.status ||
    'pending'
  ).toLowerCase();

  const handleAction = async (nextStatus) => {
    setLoading(true);
    try {
      const orderIdentifier = order.orderId || order._id;
      const res = await updateVendorQuickCommerceStatus(orderIdentifier, nextStatus);
      toast.success(`Quick Commerce order is now ${nextStatus.toUpperCase()}`);
      if (onStatusUpdated) {
        onStatusUpdated(res?.data || nextStatus);
      }
    } catch (err) {
      // api.js handles error toast
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { key: 'accepted', label: 'Accepted', icon: FiCheckCircle },
    { key: 'preparing', label: 'Preparing', icon: FiClock },
    { key: 'ready', label: 'Ready for Pickup', icon: FiPackage },
    { key: 'picked_up', label: 'Picked Up', icon: FiTruck },
    { key: 'delivered', label: 'Delivered', icon: FiCheckCircle },
  ];

  const getStepState = (stepKey) => {
    const statusOrder = ['pending', 'placed', 'new', 'accepted', 'processing', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered'];
    const effectiveStatus = currentStatus === 'processing' ? 'accepted' : currentStatus;
    const currentIndex = statusOrder.indexOf(effectiveStatus);
    const stepIndex = statusOrder.indexOf(stepKey);

    if (currentStatus === 'cancelled') return 'cancelled';
    if (currentIndex >= stepIndex) return 'completed';
    return 'upcoming';
  };

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="warning" size="md" className="font-semibold px-3 py-1">
            ⚡ Quick Commerce Order
          </Badge>
          {order?.quickCommerce?.promisedEtaMinutes && (
            <span className="text-xs font-medium text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md">
              Promised Delivery: ~{order.quickCommerce.promisedEtaMinutes} mins
            </span>
          )}
        </div>
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Status: <strong className="text-gray-900">{currentStatus}</strong>
        </span>
      </div>

      {/* Progress Timeline */}
      <div className="grid grid-cols-5 gap-2 pt-2 pb-1">
        {steps.map((step) => {
          const state = getStepState(step.key);
          const Icon = step.icon;
          let colorClass = 'bg-gray-200 text-gray-500';
          if (state === 'completed') colorClass = 'bg-emerald-600 text-white';
          if (state === 'cancelled') colorClass = 'bg-rose-200 text-rose-600';

          return (
            <div key={step.key} className="flex flex-col items-center text-center gap-1.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-medium text-gray-700 leading-tight">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Action Button Section */}
      <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
        {(currentStatus === 'pending' || currentStatus === 'placed' || currentStatus === 'new') && (
          <Button
            variant="warning"
            size="md"
            loading={loading}
            onClick={() => handleAction('accepted')}
            className="w-full font-semibold py-2.5 bg-amber-500 hover:bg-amber-600 text-white shadow"
          >
            Accept Quick Commerce Order
          </Button>
        )}

        {(currentStatus === 'accepted' || currentStatus === 'processing') && (
          <Button
            variant="primary"
            size="md"
            loading={loading}
            onClick={() => handleAction('preparing')}
            className="w-full font-semibold py-2.5 bg-blue-600 hover:bg-blue-700 text-white shadow"
          >
            Start Order Preparation
          </Button>
        )}

        {currentStatus === 'preparing' && (
          <Button
            variant="success"
            size="md"
            loading={loading}
            onClick={() => handleAction('ready')}
            className="w-full font-semibold py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow"
          >
            Mark Order Ready for Rider Pickup
          </Button>
        )}

        {currentStatus === 'ready' && (
          <div className="w-full bg-emerald-100 text-emerald-800 text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2">
            <FiPackage className="w-4 h-4 text-emerald-600" />
            Order Ready! Awaiting delivery rider pickup.
          </div>
        )}

        {(currentStatus === 'picked_up' || currentStatus === 'arriving') && (
          <div className="w-full bg-blue-100 text-blue-800 text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2">
            <FiTruck className="w-4 h-4 text-blue-600" />
            Rider has picked up this order. Out for customer delivery.
          </div>
        )}

        {currentStatus === 'delivered' && (
          <div className="w-full bg-green-100 text-green-800 text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2">
            <FiCheckCircle className="w-4 h-4 text-green-600" />
            Order delivered successfully!
          </div>
        )}

        {currentStatus === 'cancelled' && (
          <div className="w-full bg-rose-100 text-rose-800 text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2">
            <FiAlertCircle className="w-4 h-4 text-rose-600" />
            Order has been cancelled.
          </div>
        )}
      </div>

      {order?.deliveryBoyId && (
        <div className="pt-3 border-t border-amber-200/80 text-xs flex items-center justify-between bg-white/80 p-3 rounded-lg border border-amber-200">
          <div>
            <p className="font-extrabold text-gray-900 text-sm">Delivery Partner</p>
            <p className="font-medium text-gray-800 mt-0.5">
              Name: <strong>{typeof order.deliveryBoyId === 'object' ? order.deliveryBoyId.name : 'Assigned Agent'}</strong>
            </p>
            {typeof order.deliveryBoyId === 'object' && order.deliveryBoyId.phone && (
              <p className="text-gray-600">Phone: {order.deliveryBoyId.phone}</p>
            )}
            {typeof order.deliveryBoyId === 'object' && order.deliveryBoyId.vehicleNumber && (
              <p className="text-gray-500 text-[11px]">
                Vehicle: {order.deliveryBoyId.vehicleType || 'Bike'} ({order.deliveryBoyId.vehicleNumber})
              </p>
            )}
          </div>
          <Badge variant="info" size="md" className="font-bold uppercase tracking-wider">
            {order.quickCommerce?.assignment?.status || 'ASSIGNED'}
          </Badge>
        </div>
      )}
    </div>
  );
}
