import { create } from 'zustand';
import axios from 'axios';
import { requestFcmWebToken, setupFcmForegroundListener } from '../utils/firebase.config';

const getApiBase = () => {
    return import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
};

const getAuthToken = () => {
    let token =
        localStorage.getItem('token') ||
        localStorage.getItem('vendor-token') ||
        localStorage.getItem('adminToken') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('delivery-token');

    if (!token) {
        try {
            token =
                JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token ||
                JSON.parse(localStorage.getItem('vendor-auth-storage') || '{}')?.state?.token ||
                JSON.parse(localStorage.getItem('admin-auth-storage') || '{}')?.state?.token ||
                JSON.parse(localStorage.getItem('delivery-auth-storage') || '{}')?.state?.token ||
                '';
        } catch {}
    }
    return token || '';
};

const authHeader = () => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useNotificationStore = create((set, get) => ({
    notifications: [],
    unreadCount: 0,
    total: 0,
    page: 1,
    pages: 1,
    isLoading: false,
    isDrawerOpen: false,
    activeTab: 'all', // 'all' | 'unread' | 'order' | 'system'
    socketSubscribed: false,

    setDrawerOpen: (open) => set({ isDrawerOpen: Boolean(open) }),
    setActiveTab: (tab) => {
        set({ activeTab: tab });
        get().fetchNotifications({ page: 1 });
    },

    fetchNotifications: async ({ page = 1, limit = 20 } = {}) => {
        const token = getAuthToken();
        if (!token) return;

        set({ isLoading: true });
        try {
            const { activeTab } = get();
            const params = { page, limit };

            if (activeTab === 'unread') params.isRead = 'false';
            else if (activeTab === 'order') params.category = 'ORDER';
            else if (activeTab === 'system') params.category = 'SYSTEM';

            const res = await axios.get(`${getApiBase()}/notifications`, {
                headers: authHeader(),
                params,
            });

            const data = res.data?.data || {};
            set({
                notifications: data.notifications || [],
                total: data.total || 0,
                page: data.page || 1,
                pages: data.pages || 1,
                unreadCount: data.unreadCount ?? 0,
                isLoading: false,
            });
        } catch (error) {
            console.warn('[NotificationStore] Fetch failed:', error.message);
            set({ isLoading: false });
        }
    },

    fetchUnreadCount: async () => {
        const token = getAuthToken();
        if (!token) return;

        try {
            const res = await axios.get(`${getApiBase()}/notifications/unread-count`, {
                headers: authHeader(),
            });
            const count = res.data?.data?.unreadCount ?? 0;
            set({ unreadCount: count });
        } catch {}
    },

    markAsRead: async (id) => {
        try {
            set((state) => ({
                notifications: state.notifications.map((n) =>
                    n._id === id ? { ...n, isRead: true } : n
                ),
                unreadCount: Math.max(0, state.unreadCount - 1),
            }));

            await axios.patch(`${getApiBase()}/notifications/${id}/read`, {}, {
                headers: authHeader(),
            });
        } catch (error) {
            console.warn('[NotificationStore] Mark read error:', error.message);
        }
    },

    markAllAsRead: async () => {
        try {
            set((state) => ({
                notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
                unreadCount: 0,
            }));

            await axios.patch(`${getApiBase()}/notifications/read-all`, {}, {
                headers: authHeader(),
            });
        } catch (error) {
            console.warn('[NotificationStore] Mark all read error:', error.message);
        }
    },

    deleteNotification: async (id) => {
        try {
            set((state) => {
                const target = state.notifications.find((n) => n._id === id);
                const wasUnread = target && !target.isRead;
                return {
                    notifications: state.notifications.filter((n) => n._id !== id),
                    unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
                };
            });

            await axios.delete(`${getApiBase()}/notifications/${id}`, {
                headers: authHeader(),
            });
        } catch (error) {
            console.warn('[NotificationStore] Delete notification error:', error.message);
        }
    },

    clearAllNotifications: async () => {
        try {
            set({ notifications: [], unreadCount: 0, total: 0 });
            await axios.delete(`${getApiBase()}/notifications/clear-all`, {
                headers: authHeader(),
            });
        } catch (error) {
            console.warn('[NotificationStore] Clear all error:', error.message);
        }
    },

    sendTestNotification: async () => {
        try {
            const res = await axios.post(
                `${getApiBase()}/notifications/test-push`,
                {},
                { headers: authHeader() }
            );
            return res.data?.data;
        } catch (error) {
            console.error('[NotificationStore] Test push error:', error.message);
            throw error;
        }
    },

    /**
     * Subscribe to Socket.IO realtime notification events
     */
    setupSocketListeners: (socket) => {
        if (!socket || get().socketSubscribed) return;

        socket.on('notification:new', ({ notification, unreadCount }) => {
            if (!notification) return;
            set((state) => {
                const exists = state.notifications.some((n) => n._id === notification._id);
                if (exists) return state;
                return {
                    notifications: [notification, ...state.notifications],
                    unreadCount: unreadCount ?? state.unreadCount + 1,
                };
            });
        });

        socket.on('notification:count', ({ unreadCount }) => {
            if (typeof unreadCount === 'number') {
                set({ unreadCount });
            }
        });

        socket.on('notification:read', ({ notificationId, unreadCount }) => {
            set((state) => ({
                notifications: state.notifications.map((n) =>
                    n._id === notificationId ? { ...n, isRead: true } : n
                ),
                unreadCount: typeof unreadCount === 'number' ? unreadCount : state.unreadCount,
            }));
        });

        socket.on('notification:delete', ({ notificationId, unreadCount }) => {
            set((state) => ({
                notifications: state.notifications.filter((n) => n._id !== notificationId),
                unreadCount: typeof unreadCount === 'number' ? unreadCount : state.unreadCount,
            }));
        });

        set({ socketSubscribed: true });
    },

    /**
     * Register FCM Web Push token for current session
     */
    registerDeviceToken: async () => {
        const token = getAuthToken();
        if (!token) return;

        try {
            const fcmToken = await requestFcmWebToken();
            if (!fcmToken) return;

            localStorage.setItem('fcm_device_token_cache', fcmToken);

            await axios.post(
                `${getApiBase()}/device-tokens/register`,
                {
                    fcmToken,
                    deviceType: 'web',
                    platform: navigator.platform || 'browser',
                    browser: navigator.userAgent || '',
                },
                { headers: authHeader() }
            );
            console.log('[NotificationStore] FCM Web Token registered successfully.');

            // Listen for foreground FCM push notifications and pop up OS banner
            setupFcmForegroundListener();
        } catch (err) {
            console.warn('[NotificationStore] FCM registration failed:', err.message);
        }
    },

    /**
     * Unregister FCM Web Push token on logout (Awaited BEFORE clearing auth storage)
     */
    unregisterDeviceToken: async () => {
        const token = getAuthToken();
        const cachedFcmToken = localStorage.getItem('fcm_device_token_cache');

        try {
            const fcmToken = cachedFcmToken || (await requestFcmWebToken());
            if (fcmToken && token) {
                await axios.post(
                    `${getApiBase()}/device-tokens/unregister`,
                    { fcmToken },
                    { headers: authHeader() }
                );
                console.log('[NotificationStore] FCM Web Token unregistered successfully on logout.');
            }
        } catch (err) {
            console.warn('[NotificationStore] FCM unregister warning:', err.message);
        } finally {
            localStorage.removeItem('fcm_device_token_cache');
        }
    },
}));
