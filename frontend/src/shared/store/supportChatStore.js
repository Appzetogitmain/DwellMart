import { create } from 'zustand';
import * as supportApi from '../services/supportApi';
import { joinConversationRoom, leaveConversationRoom } from '../services/socketService';
import { toastService } from '../utils/toastService';

const sortByLastMessageAt = (list = []) => {
    return [...list].sort((a, b) => {
        const timeA = new Date(a.lastMessageAt || a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.lastMessageAt || b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
    });
};

export const useSupportChatStore = create((set, get) => ({
    conversations: [],
    activeConversation: null,
    messages: [],
    isLoading: false,
    isSending: false,
    error: null,
    typingUser: null,
    pagination: {
        total: 0,
        page: 1,
        limit: 30,
        pages: 1,
    },
    filters: {
        role: '',
        status: '',
        search: '',
        page: 1,
    },

    setFilters: (newFilters) => {
        set((state) => ({ filters: { ...state.filters, ...newFilters } }));
        get().fetchConversations();
    },

    fetchConversations: async (customParams = {}) => {
        set({ isLoading: true, error: null });
        try {
            const params = { ...get().filters, ...customParams };
            const res = await supportApi.getConversations(params);
            const data = res?.data || {};
            const rawList = data.conversations || [];
            set({
                conversations: sortByLastMessageAt(rawList),
                pagination: data.pagination || { total: 0, page: 1, limit: 30, pages: 1 },
                isLoading: false,
            });
        } catch (err) {
            set({ isLoading: false, error: err.message });
        }
    },

    selectConversation: async (conversationId) => {
        const currentActive = get().activeConversation;
        if (currentActive?._id) {
            leaveConversationRoom(currentActive._id);
        }

        if (!conversationId) {
            set({ activeConversation: null, messages: [] });
            return;
        }

        set({ isLoading: true });
        try {
            joinConversationRoom(conversationId);
            const res = await supportApi.getConversationById(conversationId);
            const data = res?.data || {};
            set({
                activeConversation: data.conversation,
                messages: data.messages || [],
                isLoading: false,
            });

            // Update conversation unread count locally & keep sorted
            set((state) => ({
                conversations: state.conversations.map((c) =>
                    c._id === conversationId ? { ...c, unreadAdmin: 0, unreadUser: 0 } : c
                ),
            }));
        } catch (err) {
            set({ isLoading: false });
            toastService.error(err, 'Failed to load conversation details.');
        }
    },

    createNewConversation: async (payload) => {
        set({ isSending: true });
        try {
            const res = await supportApi.createConversation(payload);
            const data = res?.data || {};
            toastService.success('Support ticket created successfully!');
            await get().fetchConversations();
            if (data.conversation?._id) {
                await get().selectConversation(data.conversation._id);
            }
            set({ isSending: false });
            return true;
        } catch (err) {
            set({ isSending: false });
            toastService.error(err, 'Failed to create support ticket.');
            return false;
        }
    },

    sendMessage: async ({ message, attachments = [] }) => {
        const active = get().activeConversation;
        if (!active?._id) return false;

        set({ isSending: true });
        try {
            await supportApi.sendMessage(active._id, { message, attachments });
            set({ isSending: false });
            return true;
        } catch (err) {
            set({ isSending: false });
            toastService.error(err, 'Failed to send message.');
            return false;
        }
    },

    updateStatus: async (conversationId, status) => {
        try {
            const res = await supportApi.updateStatus(conversationId, status);
            const updated = res?.data;
            toastService.success(`Status updated to ${status.replace('_', ' ')}`);

            set((state) => {
                const nextActive =
                    state.activeConversation?._id === conversationId
                        ? { ...state.activeConversation, status, isClosed: status === 'closed', lastMessageAt: new Date() }
                        : state.activeConversation;
                const nextList = state.conversations.map((c) =>
                    c._id === conversationId
                        ? { ...c, status, isClosed: status === 'closed', lastMessageAt: new Date() }
                        : c
                );
                return {
                    activeConversation: nextActive,
                    conversations: sortByLastMessageAt(nextList),
                };
            });
            return true;
        } catch (err) {
            toastService.error(err, 'Failed to update status.');
            return false;
        }
    },

    uploadAttachment: async (file) => {
        try {
            const res = await supportApi.uploadAttachment(file);
            return res?.data;
        } catch (err) {
            toastService.error(err, 'Failed to upload file.');
            return null;
        }
    },

    // Real-Time Socket Event Handlers
    handleConversationCreated: (payload) => {
        const conversation = payload?.conversation;
        if (conversation) {
            set((state) => ({
                conversations: sortByLastMessageAt([
                    conversation,
                    ...state.conversations.filter((c) => c._id !== conversation._id),
                ]),
            }));
        }
    },

    handleConversationUpdated: (updated) => {
        if (!updated?._id) return;
        set((state) => {
            const exists = state.conversations.some((c) => c._id === updated._id);
            const nextList = exists
                ? state.conversations.map((c) => (c._id === updated._id ? { ...c, ...updated } : c))
                : [updated, ...state.conversations];

            return {
                activeConversation:
                    state.activeConversation?._id === updated._id
                        ? { ...state.activeConversation, ...updated }
                        : state.activeConversation,
                conversations: sortByLastMessageAt(nextList),
            };
        });
    },

    handleReceiveMessage: (message) => {
        if (!message?.conversation) return;
        const conversationId = String(message.conversation);
        const activeId = get().activeConversation?._id;

        if (activeId === conversationId) {
            set((state) => ({
                messages: [...state.messages.filter((m) => m._id !== message._id), message],
            }));
        }

        // Move conversation to top of list by updating lastMessage and lastMessageAt
        set((state) => {
            const updatedTime = message.createdAt ? new Date(message.createdAt) : new Date();
            const updatedText = message.message || 'Attachment';

            const nextList = state.conversations.map((c) =>
                c._id === conversationId
                    ? {
                          ...c,
                          lastMessage: updatedText,
                          lastMessageAt: updatedTime,
                      }
                    : c
            );

            return {
                conversations: sortByLastMessageAt(nextList),
            };
        });
    },

    handleTypingStart: (data) => {
        const activeId = get().activeConversation?._id;
        if (activeId === data.conversationId) {
            set({ typingUser: data.name || 'User' });
        }
    },

    handleTypingStop: (data) => {
        const activeId = get().activeConversation?._id;
        if (activeId === data.conversationId) {
            set({ typingUser: null });
        }
    },
}));
