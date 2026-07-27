import { connectSocket } from './socketService';
import { useSupportChatStore } from '../store/supportChatStore';
import { useNotificationStore } from '../../modules/Admin/store/notificationStore';
import toast from 'react-hot-toast';

export const initNotificationListeners = () => {
    const socket = connectSocket();
    if (!socket) return;

    // Listen for live messages
    socket.off('receive_message');
    socket.on('receive_message', (message) => {
        useSupportChatStore.getState().handleReceiveMessage(message);
    });

    // Listen for conversation updates (re-ordering & metadata)
    socket.off('conversation_updated');
    socket.on('conversation_updated', (conversation) => {
        useSupportChatStore.getState().handleConversationUpdated(conversation);
    });

    // Listen for new conversation creations
    socket.off('conversation_created');
    socket.on('conversation_created', (payload) => {
        useSupportChatStore.getState().handleConversationCreated(payload);
    });

    // Listen for typing indicators
    socket.off('typing_start');
    socket.on('typing_start', (data) => {
        useSupportChatStore.getState().handleTypingStart(data);
    });

    socket.off('typing_stop');
    socket.on('typing_stop', (data) => {
        useSupportChatStore.getState().handleTypingStop(data);
    });

    // Listen for notifications
    socket.off('notification');
    socket.on('notification', (data) => {
        const title = data.title || 'Support Notification';
        const message = data.message || '';

        toast(`${title}\n${message}`, {
            duration: 5000,
            icon: '💬',
        });

        if (useNotificationStore?.getState()?.addNotification) {
            useNotificationStore.getState().addNotification(data);
        }
    });

    socket.off('notification_count');
    socket.on('notification_count', () => {
        if (useNotificationStore?.getState()?.fetchNotifications) {
            useNotificationStore.getState().fetchNotifications(1);
        }
    });
};
