import { useEffect, useState, useCallback } from 'react';
import { connectSocket } from '../services/socketService';
import toast from 'react-hot-toast';

export function useAdminAlerts() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return undefined;

    // Admin room subscription
    socket.emit('join_room', 'admin');

    const handleSlaBreach = (data) => {
      toast.error(`⚠️ SLA Breach Alert: Order #${data.orderId} exceeded promised ETA!`);
      setAlerts((prev) => [
        { type: 'sla_breach', id: `sla-${data.orderRefId}-${Date.now()}`, data, timestamp: new Date() },
        ...prev,
      ]);
    };

    const handleVendorUnresponsive = (data) => {
      toast.error(`🏪 Store Unresponsive: ${data.vendorName || 'Store'} has not accepted order #${data.orderId}!`);
      setAlerts((prev) => [
        { type: 'vendor_unresponsive', id: `vendor-${data.orderRefId}-${Date.now()}`, data, timestamp: new Date() },
        ...prev,
      ]);
    };

    const handleRiderUnreachable = (data) => {
      toast.error(`🛵 Rider Unreachable: Delivery partner for order #${data.orderId} went offline!`);
      setAlerts((prev) => [
        { type: 'rider_unreachable', id: `rider-${data.orderRefId}-${Date.now()}`, data, timestamp: new Date() },
        ...prev,
      ]);
    };

    socket.on('quick_commerce_sla_breach', handleSlaBreach);
    socket.on('quick_commerce_vendor_unresponsive', handleVendorUnresponsive);
    socket.on('quick_commerce_rider_unreachable', handleRiderUnreachable);

    return () => {
      socket.off('quick_commerce_sla_breach', handleSlaBreach);
      socket.off('quick_commerce_vendor_unresponsive', handleVendorUnresponsive);
      socket.off('quick_commerce_rider_unreachable', handleRiderUnreachable);
    };
  }, []);

  const clearAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return { alerts, clearAlert, clearAllAlerts };
}
