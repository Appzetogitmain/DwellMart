import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import { toastService } from '../utils/toastService';

export const useReviewStore = create((set, get) => ({
    reviews: [],
    isLoading: false,
    error: null,
    pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 1
    },

    fetchReviews: async (params = {}) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getAllReviews(params);
            set({
                reviews: response.data.reviews,
                pagination: response.data.pagination,
                isLoading: false
            });
        } catch (error) {
            set({ error: error.message, isLoading: false });
            toastService.error(error, 'Failed to fetch reviews');
        }
    },

    updateReviewStatus: async (id, status) => {
        try {
            await adminService.updateReviewStatus(id, status);
            set((state) => ({
                reviews: state.reviews.map((r) =>
                    r.id === id ? { ...r, status } : r
                )
            }));
            toastService.success(`Review ${status}`);
            return true;
        } catch (error) {
            toastService.error(error, 'Failed to update review status');
            return false;
        }
    },

    deleteReview: async (id) => {
        if (!window.confirm('Are you sure you want to delete this review?')) return false;

        try {
            await adminService.deleteReview(id);
            set((state) => ({
                reviews: state.reviews.filter(r => r.id !== id)
            }));
            toastService.success('Review deleted successfully');
            return true;
        } catch (error) {
            toastService.error(error, 'Failed to delete review');
            return false;
        }
    }
}));
