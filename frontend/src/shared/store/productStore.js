import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import { toastService } from '../utils/toastService';
import { getPlaceholderImage } from '../utils/helpers';

            const placeholder = getPlaceholderImage(50, 50, 'Product');
            const normalizedProducts = productsData.map(p => ({
                ...p,
                id: p._id,
                stockQuantity: p.stockQuantity || 0,
                price: p.price || 0,
                image: p.image || p.images?.[0] || placeholder
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
