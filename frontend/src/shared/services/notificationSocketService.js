import { connectSocket } from './socketService';
import { useSupportChatStore } from '../store/supportChatStore';
import { useNotificationStore } from '../store/useNotificationStore';
import toast from 'react-hot-toast';

export const initNotificationListeners = () => {
    const socket = connectSocket();
    if (!socket) return;

    // ── Support Chat Events ────────────────────────────────────────────────────

    socket.off('receive_message');
    socket.on('receive_message', (message) => {
        useSupportChatStore.getState().handleReceiveMessage(message);
    });

    socket.off('conversation_updated');
    socket.on('conversation_updated', (conversation) => {
        useSupportChatStore.getState().handleConversationUpdated(conversation);
    });

    socket.off('conversation_created');
    socket.on('conversation_created', (payload) => {
        useSupportChatStore.getState().handleConversationCreated(payload);
    });

    socket.off('typing_start');
    socket.on('typing_start', (data) => {
        useSupportChatStore.getState().handleTypingStart(data);
    });

    socket.off('typing_stop');
    socket.on('typing_stop', (data) => {
        useSupportChatStore.getState().handleTypingStop(data);
    });

    // ── Notification Events → shared useNotificationStore ─────────────────────
    // These are the canonical event names emitted by the backend notification.service.js

    socket.off('notification:new');
    socket.on('notification:new', ({ notification, unreadCount } = {}) => {
        if (!notification) return;
        const state = useNotificationStore.getState();
        state.setDrawerOpen && state;

        // Show a toast for foreground notifications
        if (notification.title) {
            toast(`${notification.title}${notification.message ? `\n${notification.message}` : ''}`, {
                duration: 5000,
                icon: '🔔',
            });
        }

        // Update the shared store
        useNotificationStore.setState((s) => {
            const exists = s.notifications.some((n) => n._id === notification._id);
            if (exists) return s;
            return {
                notifications: [notification, ...s.notifications],
                unreadCount: typeof unreadCount === 'number' ? unreadCount : s.unreadCount + 1,
            };
        });
    });

    socket.off('notification:count');
    socket.on('notification:count', ({ unreadCount } = {}) => {
        if (typeof unreadCount === 'number') {
            useNotificationStore.setState({ unreadCount });
        }
    });

    socket.off('notification:read');
    socket.on('notification:read', ({ notificationId, unreadCount } = {}) => {
        useNotificationStore.setState((s) => ({
            notifications: s.notifications.map((n) =>
                n._id === notificationId ? { ...n, isRead: true } : n
            ),
            unreadCount: typeof unreadCount === 'number' ? unreadCount : s.unreadCount,
        }));
    });

    socket.off('notification:delete');
    socket.on('notification:delete', ({ notificationId, unreadCount } = {}) => {
        useNotificationStore.setState((s) => ({
            notifications: s.notifications.filter((n) => n._id !== notificationId),
            unreadCount: typeof unreadCount === 'number' ? unreadCount : s.unreadCount,
        }));
    });

    // Legacy 'notification' event (support chat fallback)
    socket.off('notification');
    socket.on('notification', (data) => {
        const title = data.title || 'Notification';
        const message = data.message || '';
        toast(`${title}\n${message}`, { duration: 5000, icon: '💬' });
    });

    socket.off('notification_count');
    socket.on('notification_count', () => {
        useNotificationStore.getState().fetchUnreadCount?.();
    });
};

