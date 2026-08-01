import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import { toastService } from '../utils/toastService';

export const useCouponStore = create((set, get) => ({
    coupons: [],
    isLoading: false,
    pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 1
    },

    fetchCoupons: async (params = {}) => {
        set({ isLoading: true });
        try {
            const { fetchAll = true, ...queryParams } = params || {};
            const pageSize = Math.max(Number.parseInt(queryParams.limit, 10) || 100, 1);
            let currentPage = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);
            let totalPages = 1;
            let latestPagination = {
                total: 0,
                page: currentPage,
                limit: pageSize,
                pages: 1,
            };
            const allCoupons = [];

            do {
                const response = await adminService.getAllCoupons({
                    ...queryParams,
                    page: currentPage,
                    limit: pageSize,
                });

                const pageCoupons = Array.isArray(response?.data?.coupons)
                    ? response.data.coupons
                    : [];
                allCoupons.push(...pageCoupons);

                const pagination = response?.data?.pagination || {};
                latestPagination = {
                    total: Number.isFinite(Number(pagination.total))
                        ? Number(pagination.total)
                        : allCoupons.length,
                    page: Number.isFinite(Number(pagination.page))
                        ? Number(pagination.page)
                        : currentPage,
                    limit: Number.isFinite(Number(pagination.limit))
                        ? Number(pagination.limit)
                        : pageSize,
                    pages: Math.max(Number.parseInt(pagination.pages, 10) || 1, 1),
                };

                totalPages = fetchAll ? latestPagination.pages : currentPage;
                currentPage += 1;
            } while (fetchAll && currentPage <= totalPages);

            set({
                coupons: allCoupons,
                pagination: fetchAll
                    ? {
                        total: latestPagination.total,
                        page: 1,
                        limit: latestPagination.limit,
                        pages: latestPagination.pages,
                    }
                    : latestPagination,
                isLoading: false
            });
        } catch (error) {
            set({ isLoading: false });
            toastService.error(error, 'Failed to fetch coupons');
        }
    },

    addCoupon: async (couponData) => {
        set({ isLoading: true });
        try {
            const response = await adminService.createCoupon(couponData);
            set(state => ({
                coupons: [response.data, ...state.coupons],
                isLoading: false
            }));
            toastService.success('Coupon created successfully');
            return response.data;
        } catch (error) {
            set({ isLoading: false });
            toastService.error(error, 'Failed to create coupon');
            throw error;
        }
    },

    updateCoupon: async (id, couponData) => {
        set({ isLoading: true });
        try {
            const response = await adminService.updateCoupon(id, couponData);
            set(state => ({
                coupons: state.coupons.map(c => c._id === id ? response.data : c),
                isLoading: false
            }));
            toastService.success('Coupon updated successfully');
            return response.data;
        } catch (error) {
            set({ isLoading: false });
            toastService.error(error, 'Failed to update coupon');
            throw error;
        }
    },

    deleteCoupon: async (id) => {
        set({ isLoading: true });
        try {
            await adminService.deleteCoupon(id);
            set(state => ({
                coupons: state.coupons.filter(c => c._id !== id),
                isLoading: false
            }));
            toastService.success('Coupon deleted successfully');
        } catch (error) {
            set({ isLoading: false });
            toastService.error(error, 'Failed to delete coupon');
            throw error;
        }
    }
}));
