import { useState, useEffect } from 'react';
import {
  FiZap,
  FiAlertTriangle,
  FiRefreshCw,
  FiUserCheck,
  FiTruck,
  FiClock,
  FiStore,
  FiCheckCircle,
  FiX,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import api from '../../../shared/utils/api';
import toast from 'react-hot-toast';
import Badge from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/ui';
import { useAdminAlerts } from '../../../shared/hooks/useAdminAlerts';

export default function QuickCommerceOperations() {
  const { alerts, clearAlert } = useAdminAlerts();
  const [unassignedOrders, setUnassignedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [selectedRiderMap, setSelectedRiderMap] = useState({});

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const [queueRes, ridersRes] = await Promise.all([
        api.get('/admin/orders/quick-commerce/unassigned'),
        api.get('/admin/delivery-boys?status=active&limit=100'),
      ]);
      const orders = queueRes?.data?.orders || [];
      const riders = ridersRes?.data?.deliveryBoys || ridersRes?.data?.data || [];
      setUnassignedOrders(orders);
      setDeliveryBoys(riders);
    } catch (err) {
      toast.error('Failed to load escalation queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleRetryAssignment = async (orderId) => {
    setActionLoading((prev) => ({ ...prev, [orderId]: 'retry' }));
    try {
      const res = await api.post(`/admin/orders/${orderId}/retry-assignment`);
      if (res?.data?.assigned) {
        toast.success(`Assigned rider ${res.data.rider?.name || ''} successfully!`);
        fetchQueue();
      } else {
        toast.error(res?.message || 'No nearby rider available right now.');
      }
    } catch (err) {
      // api.js handles toast
    } finally {
      setActionLoading((prev) => ({ ...prev, [orderId]: null }));
    }
  };

  const handleManualAssign = async (orderId) => {
    const riderId = selectedRiderMap[orderId];
    if (!riderId) {
      toast.error('Please select a rider first.');
      return;
    }
    setActionLoading((prev) => ({ ...prev, [orderId]: 'manual' }));
    try {
      await api.patch(`/admin/orders/${orderId}/assign-delivery`, { deliveryBoyId: riderId });
      toast.success('Order assigned to delivery partner!');
      fetchQueue();
    } catch (err) {
      // api.js handles toast
    } finally {
      setActionLoading((prev) => ({ ...prev, [orderId]: null }));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FiZap className="text-amber-500" /> Quick Commerce Operations Console
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time escalation queue, SLA monitoring, and rider assignment controls.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchQueue}
          className="flex items-center gap-1.5 self-start sm:self-auto"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Queue
        </Button>
      </div>

      {/* Live Alerts Banner */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1">
            <FiAlertTriangle className="text-rose-500" /> Live Admin Incidents ({alerts.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start justify-between gap-3 shadow-sm"
              >
                <div className="flex items-start gap-2.5">
                  <FiAlertTriangle className="text-rose-600 text-lg flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                      {alert.type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm font-semibold text-rose-800">
                      Order #{alert.data?.orderId}
                    </p>
                    <p className="text-xs text-rose-700 mt-0.5">
                      {alert.data?.vendorName ? `Store: ${alert.data.vendorName} • ` : ''}
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => clearAlert(alert.id)}
                  className="text-rose-400 hover:text-rose-700 p-1"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operational Metric Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Escalated Queue</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{unassignedOrders.length}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
            <FiClock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Live Incidents</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{alerts.length}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
            <FiAlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Available Riders</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{deliveryBoys.length}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
            <FiTruck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Escalation Queue Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <FiClock className="text-amber-500" /> Escalated Unassigned Orders
          </h2>
          <span className="text-xs text-gray-500 font-medium">
            Sorted by oldest first
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center gap-2">
            <FiRefreshCw className="w-6 h-6 animate-spin text-primary-600" />
            <span>Loading escalation queue...</span>
          </div>
        ) : unassignedOrders.length === 0 ? (
          <div className="p-12 text-center text-gray-500 space-y-2">
            <FiCheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="font-semibold text-gray-800 text-lg">No Escalated Orders</p>
            <p className="text-sm text-gray-500">All Quick Commerce orders currently have assigned delivery partners!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {unassignedOrders.map((order) => {
              const vendorName = order.vendorItems?.[0]?.vendorName || 'Vendor';
              const orderId = order.orderId || order._id;

              return (
                <div key={order._id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-base">#{orderId}</span>
                      <Badge variant="warning" size="sm">Escalated</Badge>
                      <span className="text-xs text-gray-500 font-medium">
                        {order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-600 flex-wrap">
                      <span className="flex items-center gap-1 font-medium text-gray-800">
                        <FiStore className="text-gray-400" /> {vendorName}
                      </span>
                      <span>City: {order.shippingAddress?.city || 'N/A'}</span>
                      <span className="font-bold text-gray-900">Total: ₹{order.total || 0}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      loading={actionLoading[orderId] === 'retry'}
                      onClick={() => handleRetryAssignment(orderId)}
                      className="font-medium text-xs py-2 px-3 flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200"
                    >
                      <FiRefreshCw className="w-3.5 h-3.5" /> Auto Retry
                    </Button>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedRiderMap[orderId] || ''}
                        onChange={(e) =>
                          setSelectedRiderMap((prev) => ({ ...prev, [orderId]: e.target.value }))
                        }
                        className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500 focus:outline-none"
                      >
                        <option value="">Select Rider...</option>
                        {deliveryBoys.map((boy) => (
                          <option key={boy.id || boy._id} value={boy.id || boy._id}>
                            {boy.name} ({boy.phone || 'Active'})
                          </option>
                        ))}
                      </select>

                      <Button
                        variant="primary"
                        size="sm"
                        loading={actionLoading[orderId] === 'manual'}
                        onClick={() => handleManualAssign(orderId)}
                        className="font-medium text-xs py-2 px-3 flex items-center gap-1"
                      >
                        <FiUserCheck className="w-3.5 h-3.5" /> Assign
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
