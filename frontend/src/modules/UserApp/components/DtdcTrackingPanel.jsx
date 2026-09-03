/**
 * DtdcTrackingPanel — Customer-facing DTDC shipment tracking for retail/wholesale orders.
 *
 * Renders alongside or instead of QuickCommerceTrackingPanel depending on order type.
 * Shows AWB, carrier, shipment status timeline, and tracking history.
 *
 * Data comes from the enhanced `useOrderTracking` hook which already returns
 * `shipment` data for non-QC orders from the backend.
 */
import { FiTruck, FiPackage, FiCheckCircle, FiClock, FiMapPin, FiAlertTriangle } from 'react-icons/fi';

const SHIPMENT_STEPS = [
  { key: 'booked',           label: 'Booked',           icon: FiPackage,     dateKey: 'bookedAt' },
  { key: 'picked_up',        label: 'Picked Up',        icon: FiTruck,       dateKey: 'pickedUpAt' },
  { key: 'in_transit',       label: 'In Transit',       icon: FiTruck,       dateKey: 'inTransitAt' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: FiMapPin,      dateKey: 'outForDeliveryAt' },
  { key: 'delivered',        label: 'Delivered',         icon: FiCheckCircle, dateKey: 'deliveredAt' },
];

const STATUS_ORDER = ['pending', 'booked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];

const DtdcTrackingPanel = ({ shipment, trackingNumber, deliveryPartner }) => {
  if (!shipment && !trackingNumber) return null;

  const currentStatus = shipment?.status || 'pending';
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const isCancelled = currentStatus === 'cancelled';
  const isNdr = currentStatus === 'ndr';
  const isRto = currentStatus === 'rto';
  const isFailed = currentStatus === 'failed';
  const isTerminal = isCancelled || isRto || isFailed;

  const formatDate = (d) => {
    if (!d) return null;
    return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-content flex items-center gap-2">
          <FiTruck className="text-blue-600" />
          Shipment Tracking
        </h2>
        <span className="text-xs text-content-secondary bg-blue-50 px-2 py-0.5 rounded-full">
          {deliveryPartner || shipment?.carrier || 'DTDC'}
        </span>
      </div>

      {/* AWB & Service */}
      {(shipment?.awbNumber || trackingNumber) && (
        <div className="flex items-center gap-4 mb-4 p-3 bg-surface-muted rounded-xl">
          <div>
            <p className="text-xs text-content-secondary">AWB / Tracking Number</p>
            <p className="font-mono font-bold text-brand-primary text-sm">
              {shipment?.awbNumber || trackingNumber}
            </p>
          </div>
          {shipment?.serviceType && (
            <div className="ml-auto text-right">
              <p className="text-xs text-content-secondary">Service</p>
              <p className="font-medium text-content text-sm">{shipment.serviceType}</p>
            </div>
          )}
        </div>
      )}

      {/* Alert banners for special states */}
      {isNdr && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 flex items-start gap-2">
          <FiAlertTriangle className="text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">Delivery Attempted</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Our delivery partner was unable to deliver. A re-attempt will be made.
            </p>
          </div>
        </div>
      )}
      {isRto && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-start gap-2">
          <FiAlertTriangle className="text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Returning to Seller</p>
            <p className="text-xs text-red-700 mt-0.5">
              Your package is being returned. A refund will be processed.
            </p>
          </div>
        </div>
      )}
      {isCancelled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
          <FiAlertTriangle className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-900">Courier Pickup Cancelled</p>
            <p className="text-xs text-amber-700 mt-0.5">
              This courier consignment was cancelled. The seller is preparing a fresh dispatch.
            </p>
          </div>
        </div>
      )}

      {/* Shipment Progress Steps */}
      {!isTerminal && (
        <div className="space-y-3 mb-4">
          {SHIPMENT_STEPS.map((step, index) => {
            const stepIndex = STATUS_ORDER.indexOf(step.key);
            const isCompleted = currentIndex >= stepIndex;
            const isCurrent = currentIndex === stepIndex;
            const StepIcon = step.icon;
            const date = shipment?.[step.dateKey];

            return (
              <div key={step.key} className="flex items-start gap-3">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isCurrent
                        ? 'bg-blue-500 text-white ring-4 ring-blue-100'
                        : 'bg-gray-200 text-gray-400'
                  }`}>
                    <StepIcon size={14} />
                  </div>
                  {index < SHIPMENT_STEPS.length - 1 && (
                    <div className={`w-0.5 h-6 ${isCompleted ? 'bg-green-300' : 'bg-gray-200'}`}></div>
                  )}
                </div>

                {/* Step content */}
                <div className="flex-1 pb-1">
                  <p className={`text-sm font-medium ${
                    isCompleted ? 'text-content' : 'text-content-secondary'
                  }`}>
                    {step.label}
                  </p>
                  {date && (
                    <p className="text-xs text-content-muted">{formatDate(date)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tracking History */}
      {shipment?.trackingHistory?.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-content-secondary mb-2 flex items-center gap-1">
            <FiClock size={11} /> Detailed Tracking
          </p>
          <div className="max-h-32 overflow-y-auto space-y-1.5">
            {[...shipment.trackingHistory].reverse().slice(0, 8).map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <span className="text-content">{entry.description || entry.status}</span>
                  {entry.location && <span className="text-content-secondary"> — {entry.location}</span>}
                </div>
                {entry.timestamp && (
                  <span className="text-content-muted whitespace-nowrap text-[10px]">
                    {formatDate(entry.timestamp)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estimated delivery */}
      {shipment?.estimatedDelivery && !isTerminal && (
        <div className="mt-3 pt-3 border-t border-border text-center">
          <p className="text-xs text-content-secondary">Estimated Delivery</p>
          <p className="text-sm font-semibold text-brand-primary">
            {new Date(shipment.estimatedDelivery).toLocaleDateString('en-IN', { dateStyle: 'long' })}
          </p>
        </div>
      )}
    </div>
  );
};

export default DtdcTrackingPanel;
