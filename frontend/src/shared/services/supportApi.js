import api from '../utils/api';

export const createConversation = async (data) => {
    return api.post('/support/conversations', data);
};

export const getConversations = async (params = {}) => {
    return api.get('/support/conversations', { params });
};

export const getConversationById = async (id) => {
    return api.get(`/support/conversations/${id}`);
};

export const sendMessage = async (id, data) => {
    return api.post(`/support/conversations/${id}/messages`, data);
};

export const updateStatus = async (id, status) => {
    return api.patch(`/support/conversations/${id}/status`, { status });
};

export const assignAdmin = async (id, assignedAdminId) => {
    return api.patch(`/support/conversations/${id}/assign`, { assignedAdminId });
};

export const markAsRead = async (id) => {
    return api.patch(`/support/conversations/${id}/read`);
};

export const getUnreadCount = async () => {
    return api.get('/support/unread-count');
};

export const deleteMessage = async (conversationId, messageId) => {
    return api.delete(`/support/conversations/${conversationId}/messages/${messageId}`);
};

export const uploadAttachment = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/support/upload-attachment', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
};
