import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import { toastService } from '../utils/toastService';

export const useAnalyticsStore = create((set, get) => ({
    dashboardStats: null,
    revenueData: [],
    financialSummary: [],
    inventoryStats: null,
    isLoading: false,
    error: null,

    fetchDashboardStats: async () => {
        set({ isLoading: true });
        try {
            const response = await adminService.getDashboardStats();
            set({ dashboardStats: response.data, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },

    fetchFinancialSummary: async (period = 'monthly', params = {}) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getFinancialSummary(period, params);
            set({ financialSummary: response.data, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
            toastService.error(error, 'Failed to fetch financial data');
        }
    },

    fetchInventoryStats: async () => {
        set({ isLoading: true });
        try {
            const response = await adminService.getInventoryStats();
            set({ inventoryStats: response.data, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },

    fetchRevenueData: async (period = 'monthly', params = {}) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getRevenueData(period, params);
            set({ revenueData: response.data, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    }
}));
