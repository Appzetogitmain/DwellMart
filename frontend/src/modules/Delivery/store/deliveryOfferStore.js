/**
 * deliveryOfferStore.js
 *
 * Manages the Quick Commerce order-offer lifecycle on the rider's device.
 *
 * State machine:
 *   null (no offer)
 *     → setPendingOffer({ orderId, orderRefId, pickupDistanceKm, expiresAt, ... })
 *     → clearPendingOffer()          // offer expired server-side / dismissed
 *   null (no offer)
 *
 * Rider can only hold ONE pending offer at a time — the backend enforces this
 * through the offeredTo field, and the frontend mirrors it here.
 */

import { create } from 'zustand';
import api from '../../../shared/utils/api';

export const useDeliveryOfferStore = create((set, get) => ({
    /** @type {null | { orderId: string, orderRefId: string, pickupDistanceKm: number, expiresAt: string, expiresInSecs: number }} */
    pendingOffer: null,

    /** Whether an accept or reject API call is in flight. */
    isActing: false,

    /**
     * Called by useDeliverySocket when `delivery:order_offer` arrives.
     * Replaces any stale offer (there should never be two, but be safe).
     */
    setPendingOffer: (offer) => {
        if (!offer?.orderId) return;
        set({ pendingOffer: offer });
    },

    /** Called when the offer expires (server or client-side timer). */
    clearPendingOffer: () => set({ pendingOffer: null }),

    /**
     * Rider tapped ACCEPT.
     *
     * 1. Calls POST /delivery/orders/:id/accept-offer.
     * 2. On success: clears the offer (order is now in rider's list).
     * 3. On failure: returns the error reason string for the UI to show.
     *
     * @returns {Promise<{ ok: boolean, reason?: string, order?: object }>}
     */
    acceptCurrentOffer: async () => {
        const { pendingOffer } = get();
        if (!pendingOffer?.orderId) return { ok: false, reason: 'NO_OFFER' };

        set({ isActing: true });
        try {
            const response = await api.post(`/delivery/orders/${pendingOffer.orderId}/accept-offer`);
            const payload = response?.data ?? response;
            set({ pendingOffer: null, isActing: false });
            return { ok: true, order: payload };
        } catch (err) {
            set({ isActing: false });
            const reason =
                err?.response?.data?.message ||
                err?.message ||
                'Failed to accept order. Please try again.';
            return { ok: false, reason };
        }
    },

    /**
     * Rider tapped REJECT.
     *
     * The rider was never marked BUSY, so this is just a soft decline.
     * The server will search for the next eligible rider immediately.
     *
     * @param {string} [reason]
     * @returns {Promise<{ ok: boolean, reason?: string }>}
     */
    rejectCurrentOffer: async (reason = 'RIDER_REJECTED') => {
        const { pendingOffer } = get();
        if (!pendingOffer?.orderId) return { ok: false, reason: 'NO_OFFER' };

        set({ isActing: true });
        try {
            await api.post(`/delivery/orders/${pendingOffer.orderId}/reject-offer`, { reason });
            set({ pendingOffer: null, isActing: false });
            return { ok: true };
        } catch (err) {
            set({ isActing: false });
            const message =
                err?.response?.data?.message ||
                err?.message ||
                'Failed to reject offer.';
            return { ok: false, reason: message };
        }
    },
}));
