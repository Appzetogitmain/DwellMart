/**
 * DtdcShipmentPanel — Shared shipment management panel for Admin & Vendor.
 *
 * Shows shipment status, AWB, tracking timeline, and action buttons
 * (book, cancel, sync tracking, download label) based on context.
 *
 * Props:
 *   orderId      — order _id or orderId
 *   context      — 'admin' | 'vendor' (determines which API service to call)
 *   fulfillmentType — 'retail' | 'wholesale' | 'quick_commerce'
 *   onShipmentUpdate — optional callback when shipment state changes
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FiTruck, FiPackage, FiRefreshCw, FiDownload, FiXCircle, FiCheckCircle, FiClock, FiMapPin, FiAlertTriangle, FiExternalLink } from 'react-icons/fi';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  pending:          { label: 'Pending',          color: 'bg-gray-100 text-gray-700',   icon: FiClock },
  booked:           { label: 'Booked',           color: 'bg-blue-100 text-blue-700',   icon: FiPackage },
  picked_up:        { label: 'Picked Up',        color: 'bg-indigo-100 text-indigo-700', icon: FiTruck },
  in_transit:       { label: 'In Transit',       color: 'bg-purple-100 text-purple-700', icon: FiTruck },
  out_for_delivery: { label: 'Out for Delivery', color: 'bg-orange-100 text-orange-700', icon: FiMapPin },
  delivered:        { label: 'Delivered',         color: 'bg-green-100 text-green-700', icon: FiCheckCircle },
  cancelled:        { label: 'Cancelled',         color: 'bg-red-100 text-red-700',     icon: FiXCircle },
  rto:              { label: 'RTO',              color: 'bg-red-100 text-red-700',     icon: FiAlertTriangle },
  ndr:              { label: 'NDR',              color: 'bg-yellow-100 text-yellow-700', icon: FiAlertTriangle },
  failed:           { label: 'Failed',           color: 'bg-red-100 text-red-700',     icon: FiXCircle },
};

/**
 * @param {number} [readySinceHours] hours this order has been dispatch-ready
 *        without a courier booking. Renders the overdue banner when set.
 */

/**
 * Mirrors backend `parcelMetrics.chargeableWeight`.
 *
 * Duplicated deliberately and narrowly: the vendor needs the number to move as
 * they type, and a round trip per keystroke is worse than one small formula.
 * The BOOKED figures always come from the server.
 */
const previewChargeable = ({ weight, weightUnit, length, width, height, dimensionUnit }) => {
  const kg = Number(weight) > 0 ? (weightUnit === 'g' ? Number(weight) / 1000 : Number(weight)) : 0;
  const cm = (v) => (Number(v) > 0 ? (dimensionUnit === 'in' ? Number(v) * 2.54 : Number(v)) : 0);
  const volumetric = cm(length) && cm(width) && cm(height)
    ? (cm(length) * cm(width) * cm(height)) / 5000
    : 0;
  return {
    actual: Number(kg.toFixed(3)),
    volumetric: Number(volumetric.toFixed(3)),
    chargeable: Number(Math.max(kg, volumetric).toFixed(3)),
    basis: volumetric > kg ? 'volumetric' : 'actual',
  };
};

const DtdcShipmentPanel = ({ orderId, context = 'admin', fulfillmentType, readySinceHours = null, onShipmentUpdate }) => {
  const [shipment, setShipment] = useState(null);
  /** Populated instead of `shipment` when the order is split across vendors. */
  const [shipments, setShipments] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  /**
   * What the courier WOULD be told, and where those figures came from. Fetched
   * rather than derived so the panel cannot drift from the backend's unit
   * conversion or its volumetric rule.
   */
  const [preview, setPreview] = useState(null);
  /** The vendor's edits. Null until they touch a field, so an untouched panel books the catalogue values. */
  const [pkg, setPkg] = useState(null);

  // Dynamic import based on context
  const getService = useCallback(async () => {
    if (context === 'vendor') {
      return import('../../modules/Vendor/services/vendorService');
    }
    return import('../../modules/Admin/services/adminService');
  }, [context]);

  const isQuickCommerce = fulfillmentType === 'quick_commerce';

  const fetchShipment = useCallback(async () => {
    // Quick Commerce is delivered by internal riders. Asking the shipment API
    // about a QC order is a request that can only ever be refused, so it is
    // never sent.
    if (!orderId || isQuickCommerce) { setLoading(false); return; }
    try {
      const svc = await getService();
      // A booked parcel has already been declared; only an unbooked one needs a preview.
      const [res, previewRes] = await Promise.all([
        svc.getOrderShipment(orderId),
        svc.getPackagePreview(orderId).catch(() => null),
      ]);
      setPreview(previewRes?.data || null);
      // Admin answers with { shipments: [...] } when an order is split across
      // sellers; this panel manages a single parcel, so a split order is shown
      // read-only rather than pretending one of them is "the" shipment.
      const data = res?.data || null;
      if (data && Array.isArray(data.shipments)) {
        setShipments(data.shipments);
        setShipment(null);
      } else {
        setShipments(null);
        setShipment(data);
      }
    } catch {
      setShipment(null);
      setShipments(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, getService, isQuickCommerce]);

  useEffect(() => { fetchShipment(); }, [fetchShipment]);

  // Quick Commerce orders don't use DTDC
  if (isQuickCommerce) {
    return null;
  }

  const handleBook = async () => {
    setActionLoading('book');
    try {
      const svc = await getService();
      // Only send figures the vendor actually edited. An untouched panel books
      // exactly what the preview showed.
      const res = await svc.bookDtdcShipment(orderId, pkg || undefined);
      setShipment(res?.data || null);
      setShipments(null);
      toast.success('DTDC shipment booked successfully!');
      onShipmentUpdate?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to book shipment');
    } finally {
      setActionLoading('');
    }
  };

  const handleCancel = async () => {
    // Cancelling a consignment is an admin action; the vendor service has no
    // such call. The button is admin-gated below, and this guard keeps a future
    // regression in that gate from turning into an undefined-is-not-a-function.
    if (context !== 'admin') return;
    if (!window.confirm('Are you sure you want to cancel this DTDC shipment?')) return;
    setActionLoading('cancel');
    try {
      const svc = await getService();
      const res = await svc.cancelDtdcShipment(orderId);
      setShipment(res?.data || null);
      toast.success('Shipment cancelled');
      onShipmentUpdate?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to cancel shipment');
    } finally {
      setActionLoading('');
    }
  };

  const handleSyncTracking = async () => {
    setActionLoading('sync');
    try {
      const svc = await getService();
      const res = await svc.syncOrderTracking(orderId);
      setShipment(res?.data || null);
      toast.success('Tracking synced');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to sync tracking');
    } finally {
      setActionLoading('');
    }
  };

  const handleDownloadLabel = async () => {
    setActionLoading('label');
    try {
      const svc = await getService();
      const res = await svc.getShippingLabel(orderId);
      const blob = new Blob([res.data || res], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dtdc-label-${orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Label downloaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to download label');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="border border-border rounded-xl p-4 bg-surface">
        <div className="flex items-center gap-2 mb-3">
          <FiTruck className="text-blue-600" />
          <h3 className="font-semibold text-content">DTDC Shipping</h3>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[shipment?.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const canBook = !shipment || shipment.status === 'pending' || shipment.status === 'failed';
  const canCancel = shipment?.awbNumber && !['cancelled', 'delivered', 'rto'].includes(shipment?.status);
  const canSync = shipment?.awbNumber && !['cancelled', 'delivered'].includes(shipment?.status);
  const canLabel = shipment?.awbNumber && shipment?.status !== 'cancelled';

  const formatDate = (d) => {
    if (!d) return null;
    return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <div className="border border-border rounded-xl p-4 bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FiTruck className="text-blue-600 text-lg" />
          <h3 className="font-semibold text-content">DTDC Shipping</h3>
          <span className="text-xs text-content-secondary px-2 py-0.5 bg-surface-muted rounded-full">
            {fulfillmentType === 'wholesale' ? 'B2B Ground' : 'B2C Priority'}
          </span>
        </div>
        {shipment && (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.color}`}>
            <StatusIcon size={12} />
            {statusCfg.label}
          </span>
        )}
      </div>

      {/* Ready to ship, nobody has booked it. Placed immediately above the
          booking action so the prompt and the remedy are in the same glance. */}
      {!shipment?.awbNumber && Number.isFinite(readySinceHours) && readySinceHours > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3">
          <FiAlertTriangle className="mt-0.5 w-4 h-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            This order has been ready to ship for{' '}
            <strong>{readySinceHours} hour{readySinceHours === 1 ? '' : 's'}</strong> and has no
            courier booking yet.
          </p>
        </div>
      )}

      {/* Split order — one parcel per seller, shown read-only. Booking and
          cancelling are per-vendor actions and belong on the vendor's own
          order view, not on a control that would have to guess a seller. */}
      {shipments?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-content-secondary">
            This order is split across {shipments.length} sellers.
          </p>
          {shipments.map((s) => (
            <div key={s._id} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
              <span className="text-content">{s.vendorId?.storeName || 'Vendor'}</span>
              <span className="font-mono text-xs text-content">{s.awbNumber || '—'}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${(STATUS_CONFIG[s.status] || STATUS_CONFIG.pending).color}`}>
                {(STATUS_CONFIG[s.status] || STATUS_CONFIG.pending).label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Package details — editable, pre-filled from the catalogue.
          Only a human knows what physically went in the box, and only the box
          is billed. Shown before booking; a booked parcel has already been
          declared and its figures are on the shipment. */}
      {!shipment?.awbNumber && preview?.ready && (() => {
        const current = {
          weight: pkg?.weight ?? preview.weight,
          weightUnit: pkg?.weightUnit ?? 'kg',
          length: pkg?.length ?? preview.length,
          width: pkg?.width ?? preview.width,
          height: pkg?.height ?? preview.height,
          dimensionUnit: pkg?.dimensionUnit ?? 'cm',
        };
        const metrics = previewChargeable(current);
        const edit = (field) => (e) =>
          setPkg({ ...current, [field]: e.target.value });

        return (
          <div className="mb-4 rounded-lg border border-border bg-surface-muted/40 p-3.5">
            <p className="text-xs font-semibold text-content-secondary mb-2.5">Package details</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <label className="text-xs text-content-secondary">
                Weight
                <input
                  type="number" min="0" step="0.001" value={current.weight}
                  onChange={edit('weight')}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-border bg-surface text-sm text-content"
                />
              </label>
              <label className="text-xs text-content-secondary">
                Unit
                <select
                  value={current.weightUnit} onChange={edit('weightUnit')}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-border bg-surface text-sm text-content"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                </select>
              </label>
              <label className="text-xs text-content-secondary">
                Dim. unit
                <select
                  value={current.dimensionUnit} onChange={edit('dimensionUnit')}
                  className="mt-1 w-full px-2 py-1.5 rounded border border-border bg-surface text-sm text-content"
                >
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                </select>
              </label>
              {['length', 'width', 'height'].map((axis) => (
                <label key={axis} className="text-xs text-content-secondary capitalize">
                  {axis}
                  <input
                    type="number" min="0" step="0.1" value={current[axis]}
                    onChange={edit(axis)}
                    className="mt-1 w-full px-2 py-1.5 rounded border border-border bg-surface text-sm text-content"
                  />
                </label>
              ))}
            </div>

            <p className="mt-2.5 text-xs text-content">
              Chargeable weight: <strong>{metrics.chargeable} kg</strong>
              <span className="text-content-secondary">
                {' '}(actual {metrics.actual} kg, volumetric {metrics.volumetric} kg
                {metrics.basis === 'volumetric' ? ' — billed on volume' : ''})
              </span>
            </p>

            {preview.isEstimatedWeight && !pkg && (
              <div className="mt-2.5 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-2">
                <FiAlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-900">
                  <strong>Estimated</strong> — this product has no shipping weight set. Booking at{' '}
                  {preview.weight} kg; DTDC may raise a weight discrepancy charge. Correct it above
                  or add the weight to the product.
                </p>
              </div>
            )}
            {pkg && (
              <p className="mt-2 text-xs text-content-secondary">
                These figures apply to this shipment only — the product is not changed.
              </p>
            )}
          </div>
        );
      })()}

      {/* Booking is blocked by something the vendor can fix. */}
      {!shipment?.awbNumber && preview && preview.ready === false && (
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 p-3.5">
          <div className="flex items-start gap-2.5">
            <FiAlertTriangle className="mt-0.5 w-4 h-4 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-900">{preview.blockedReason}</p>
              <p className="text-xs text-red-700 mt-0.5">
                Couriers require a full origin warehouse address (Street, City, State, 6-digit Pincode, and Contact Number) to schedule package pickup.
              </p>
            </div>
          </div>
          {context === 'vendor' && (
            <Link
              to="/vendor/pickup-locations"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap shrink-0"
            >
              <FiMapPin className="text-xs" />
              <span>Configure Pickup Location &rarr;</span>
            </Link>
          )}
        </div>
      )}

      {/* No shipment yet */}
      {!shipment && !shipments?.length && (
        <div className="text-center py-6">
          <FiPackage className="mx-auto text-3xl text-gray-300 mb-2" />
          <p className="text-sm text-content-secondary mb-4">No DTDC shipment booked yet</p>
          <button
            onClick={handleBook}
            disabled={actionLoading === 'book' || preview?.ready === false}
            title={preview?.ready === false ? preview.blockedReason : ''}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {actionLoading === 'book' ? 'Booking...' : '📦 Book DTDC Shipment'}
          </button>
          {preview?.ready === false && (
            <p className="text-xs text-red-600 mt-2 font-medium">
              Resolve the pickup address requirements above before booking.
            </p>
          )}
        </div>
      )}

      {/* Shipment details */}
      {shipment && (
        <div className="space-y-4">
          {/* AWB & Service info */}
          <div className="grid grid-cols-2 gap-3">
            {shipment.awbNumber && (
              <div>
                <p className="text-xs text-content-secondary">AWB Number</p>
                <p className="font-mono font-bold text-content text-sm">{shipment.awbNumber}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-content-secondary">Service Type</p>
              <p className="font-medium text-content text-sm">{shipment.serviceType || 'N/A'}</p>
            </div>
            {shipment.bookedAt && (
              <div>
                <p className="text-xs text-content-secondary">Booked At</p>
                <p className="text-content text-sm">{formatDate(shipment.bookedAt)}</p>
              </div>
            )}
            {shipment.weight != null && (
              <div>
                <p className="text-xs text-content-secondary">Declared Weight</p>
                <p className="text-content text-sm">
                  {shipment.weight} kg
                  {shipment.chargeableWeight > shipment.weight && (
                    <span className="text-content-secondary">
                      {' '}(charged {shipment.chargeableWeight} kg)
                    </span>
                  )}
                </p>
                {/* An absent source predates the field and is indistinguishable
                    from an estimate, so it is labelled as one. */}
                {(shipment.weightSource ?? 'estimated') === 'estimated' && (
                  <p className="text-xs text-amber-700">Estimated — no product weight was set</p>
                )}
                {shipment.weightSource === 'vendor' && (
                  <p className="text-xs text-content-muted">Confirmed at booking</p>
                )}
              </div>
            )}
            {shipment.deliveredAt && (
              <div>
                <p className="text-xs text-content-secondary">Delivered At</p>
                <p className="text-content text-sm">{formatDate(shipment.deliveredAt)}</p>
              </div>
            )}
          </div>

          {/* NDR / RTO alerts */}
          {shipment.status === 'ndr' && shipment.ndrDetails && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm font-medium text-yellow-800">⚠️ Non-Delivery Report</p>
              <p className="text-xs text-yellow-700 mt-1">
                Reason: {shipment.ndrDetails.reason || 'Unknown'} | Attempts: {shipment.ndrDetails.attempts || 0}
              </p>
            </div>
          )}
          {shipment.status === 'rto' && shipment.rtoDetails && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800">🔄 Return to Origin</p>
              <p className="text-xs text-red-700 mt-1">
                Reason: {shipment.rtoDetails.reason || 'Unknown'}
              </p>
            </div>
          )}
          {shipment.status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800">❌ Booking Failed</p>
              <p className="text-xs text-red-700 mt-1">{shipment.failureReason || 'Unknown error'}</p>
            </div>
          )}

          {/* Tracking History */}
          {shipment.trackingHistory?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-content-secondary mb-2">Tracking History</p>
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {[...shipment.trackingHistory].reverse().slice(0, 10).map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-content">{entry.description || entry.status}</span>
                      {entry.location && <span className="text-content-secondary"> — {entry.location}</span>}
                    </div>
                    <span className="text-content-muted whitespace-nowrap">
                      {formatDate(entry.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            {canBook && (
              <button onClick={handleBook} disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <FiPackage size={13} />
                {actionLoading === 'book' ? 'Booking...' : 'Book Shipment'}
              </button>
            )}
            {canSync && (
              <button onClick={handleSyncTracking} disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                <FiRefreshCw size={13} className={actionLoading === 'sync' ? 'animate-spin' : ''} />
                {actionLoading === 'sync' ? 'Syncing...' : 'Sync Tracking'}
              </button>
            )}
            {canLabel && (
              <button onClick={handleDownloadLabel} disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                <FiDownload size={13} />
                {actionLoading === 'label' ? 'Downloading...' : 'Download Label'}
              </button>
            )}
            {canCancel && context === 'admin' && (
              <button onClick={handleCancel} disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                <FiXCircle size={13} />
                {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Shipment'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DtdcShipmentPanel;
