import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import { toastService } from '../utils/toastService';

export const useSupportStore = create((set, get) => ({
    tickets: [],
    isLoading: false,
    error: null,
    pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 1
    },

    fetchTickets: async (params = {}) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getAllTickets(params);
            set({
                tickets: response.data.tickets,
                pagination: response.data.pagination,
                isLoading: false
            });
        } catch (error) {
            set({ error: error.message, isLoading: false });
            toastService.error(error, 'Failed to fetch tickets');
        }
    },

    fetchTicketById: async (id) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getTicketById(id);
            set({ isLoading: false });
            return response.data;
        } catch (error) {
            set({ isLoading: false });
            toastService.error(error, 'Failed to fetch ticket details');
            return null;
        }
    },

    updateTicketStatus: async (id, status) => {
        try {
            await adminService.updateTicketStatus(id, status);
            set((state) => ({
                tickets: state.tickets.map((t) =>
                    t.id === id ? { ...t, status } : t
                )
            }));
            toastService.success('Status updated successfully');
            return true;
        } catch (error) {
            toastService.error(error, 'Failed to update status');
            return false;
        }
    },

    addReply: async (id, message) => {
        set({ isLoading: true });
        try {
            const response = await adminService.addTicketMessage(id, message);
            set({ isLoading: false });
            toastService.success('Reply added successfully');
            return response.data;
        } catch (error) {
            set({ isLoading: false });
            toastService.error(error, 'Failed to add reply');
            return null;
        }
    }
}));
