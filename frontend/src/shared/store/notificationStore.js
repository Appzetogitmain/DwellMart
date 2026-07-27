import { create } from 'zustand';
import * as supportApi from '../services/supportApi';

export const useNotificationStore = create((set, get) => ({
    unreadCount: 0,
    notifications: [],
    isLoading: false,

    fetchUnreadCount: async () => {
        try {
            const res = await supportApi.getUnreadCount();
            const count = res?.data?.unreadCount || 0;
            set({ unreadCount: count });
        } catch {
            // ignore if unauthenticated
        }
    },

    incrementUnread: () => {
        set((state) => ({ unreadCount: state.unreadCount + 1 }));
    },

    resetUnread: () => {
        set({ unreadCount: 0 });
    },
}));
