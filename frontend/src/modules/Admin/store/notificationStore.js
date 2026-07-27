import { create } from 'zustand';
import {
    getAdminNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
} from '../services/adminService';
import toast from 'react-hot-toast';

export const useNotificationStore = create((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    page: 1,
    hasMore: true,

    fetchNotifications: async (page = 1) => {
        set({ isLoading: true });
        try {
            const response = await getAdminNotifications({ page, limit: 10 });
            const { notifications, unreadCount, pages } = response.data;

            set((state) => ({
                notifications: page === 1 ? notifications : [...state.notifications, ...notifications],
                unreadCount,
                page,
                hasMore: page < pages,
                isLoading: false,
            }));
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
            set({ isLoading: false });
        }
    },

    addNotification: (payload) => {
        const item = payload.notification || payload;
        const newNotif = {
            _id: item._id || String(Date.now()),
            title: item.title || payload.title || 'Notification',
            message: item.message || payload.message || '',
            type: item.type || 'system',
            isRead: false,
            createdAt: item.createdAt || new Date().toISOString(),
            data: item.data || payload.data || {},
        };

        set((state) => ({
            notifications: [newNotif, ...state.notifications],
            unreadCount: state.unreadCount + 1,
        }));
    },

    markAsRead: async (id) => {
        try {
            await markNotificationAsRead(id);
            set((state) => ({
                notifications: state.notifications.map((n) =>
                    n._id === id ? { ...n, isRead: true } : n
                ),
                unreadCount: Math.max(0, state.unreadCount - 1)
            }));
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    },

    markAllAsRead: async () => {
        try {
            await markAllNotificationsAsRead();
            set((state) => ({
                notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
                unreadCount: 0
            }));
            toast.success('All notifications marked as read');
        } catch (error) {
            console.error('Failed to mark all as read:', error);
            toast.error('Failed to mark all as read');
        }
    },
}));
