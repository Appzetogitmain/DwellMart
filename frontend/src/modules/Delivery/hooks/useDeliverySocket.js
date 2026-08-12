/**
 * useDeliverySocket.js
 *
 * Establishes and maintains the Socket.IO connection for an authenticated
 * delivery partner.  Listens to Quick Commerce offer events and real-time
 * assignment changes, routing them into the correct Zustand stores.
 *
 * Mount this hook once in the authenticated Layout so it is always active,
 * regardless of which screen the rider is currently on.
 */

import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../../../shared/services/socketService';
import { useDeliveryOfferStore } from '../store/deliveryOfferStore';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import toast from 'react-hot-toast';

/**
 * @param {object}  opts
 * @param {boolean} opts.enabled   Pass false when the rider is not authenticated.
 */
const useDeliverySocket = ({ enabled = true } = {}) => {
    const mountedRef = useRef(false);
    const setPendingOffer  = useDeliveryOfferStore((s) => s.setPendingOffer);
    const clearPendingOffer = useDeliveryOfferStore((s) => s.clearPendingOffer);
    const fetchOrders       = useDeliveryAuthStore((s) => s.fetchOrders);
    const fetchProfile      = useDeliveryAuthStore((s) => s.fetchProfile);

    useEffect(() => {
        if (!enabled) return undefined;

        mountedRef.current = true;

        // connectSocket() is idempotent — returns the existing socket if already
        // connected with the same token, or creates a new one.
        const socket = connectSocket();
        if (!socket) return undefined;

        // ── delivery:order_offer ─────────────────────────────────────────────────
        // Server emits this when a new Quick Commerce order offer is directed at
        // this rider.  The rider sees the animated offer modal with a countdown.
        const handleOffer = (payload) => {
            if (!mountedRef.current) return;
            console.log('[DeliverySocket] delivery:order_offer received', payload);
            setPendingOffer(payload);
            // Vibrate the device (supported on Android WebView; silently ignored elsewhere).
            if (typeof navigator?.vibrate === 'function') {
                navigator.vibrate([300, 150, 300]);
            }
        };

        // ── delivery:offer_expired ───────────────────────────────────────────────
        // Server emits this when the 45-second timer fires and the rider did not
        // respond.  Clear the modal so it doesn't stick around.
        const handleOfferExpired = (payload) => {
            if (!mountedRef.current) return;
            console.log('[DeliverySocket] delivery:offer_expired received', payload);
            clearPendingOffer();
        };

        // ── delivery:assigned ────────────────────────────────────────────────────
        // Emitted after the rider accepted (acceptOffer resolves) or after an
        // admin manually assigns. Refresh the order list and dashboard counts.
        const handleAssigned = (payload) => {
            if (!mountedRef.current) return;
            console.log('[DeliverySocket] delivery:assigned received', payload);
            clearPendingOffer();
            // Quietly re-fetch so orders list and dashboard update without a page reload.
            fetchOrders().catch(() => null);
            fetchProfile().catch(() => null);
            toast.success(`Order ${payload?.orderId || ''} assigned to you!`, {
                id: `assigned-${payload?.orderId}`,
                duration: 4000,
            });
        };

        // ── rider_assigned ───────────────────────────────────────────────────────
        // Alternative event name emitted by the order-room socket.
        const handleRiderAssigned = (payload) => {
            if (!mountedRef.current) return;
            // Only handle if this socket's rider matches the payload.
            fetchOrders().catch(() => null);
        };

        // ── quick_commerce_status ────────────────────────────────────────────────
        // Status change from vendor or system; refresh order details if needed.
        const handleQcStatus = () => {
            if (!mountedRef.current) return;
            fetchOrders().catch(() => null);
        };

        socket.on('delivery:order_offer',   handleOffer);
        socket.on('delivery:offer_expired', handleOfferExpired);
        socket.on('delivery:assigned',      handleAssigned);
        socket.on('rider_assigned',         handleRiderAssigned);
        socket.on('qc:status_changed',      handleQcStatus);

        return () => {
            mountedRef.current = false;
            const s = getSocket();
            if (s) {
                s.off('delivery:order_offer',   handleOffer);
                s.off('delivery:offer_expired', handleOfferExpired);
                s.off('delivery:assigned',      handleAssigned);
                s.off('rider_assigned',         handleRiderAssigned);
                s.off('qc:status_changed',      handleQcStatus);
            }
        };
    }, [enabled, setPendingOffer, clearPendingOffer, fetchOrders, fetchProfile]);
};

export default useDeliverySocket;
