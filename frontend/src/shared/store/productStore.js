import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import { toastService } from '../utils/toastService';
import { getPlaceholderImage } from '../utils/helpers';

const PRODUCT_IMAGE_PLACEHOLDER = getPlaceholderImage(50, 50, 'Product');

export const useProductStore = create((set, get) => ({
    products: [],
    isLoading: false,
    pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 1
    },

    fetchProducts: async (params = {}) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getAllProducts(params);
            const productsData = Array.isArray(response.data) ? response.data : (response.data.products || []);
            const normalizedProducts = productsData.map(p => ({
                ...p,
                id: p._id,
                stockQuantity: p.stockQuantity || 0,
                price: p.price || 0,
                image: p.image || p.images?.[0] || PRODUCT_IMAGE_PLACEHOLDER
            }));

            set({
                products: normalizedProducts,
                pagination: response.data.pagination || get().pagination,
                isLoading: false
            });
        } catch (error) {
            set({ isLoading: false });
            toastService.error(error, 'Failed to fetch products');
        }
    }
}));
