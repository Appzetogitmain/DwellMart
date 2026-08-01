import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getAllBrands, getPublicBrands, createBrand, updateBrand, deleteBrand } from '../../modules/Admin/services/adminService';
import { toastService } from '../utils/toastService';

export const useBrandStore = create(
  persist(
    (set, get) => ({
      brands: [],
      isLoading: false,

      // Initialize brands
      initialize: async () => {
        set({ isLoading: true });
        try {
          const isVendorArea =
            typeof window !== 'undefined' &&
            window.location.pathname.startsWith('/vendor');
          const response = isVendorArea
            ? await getPublicBrands()
            : await getAllBrands();
          const normalizedBrands = response.data.map(brand => ({
            ...brand,
            id: brand._id // Ensure UI compatibility by aliasing _id to id
          }));
          set({ brands: normalizedBrands, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          // Error toast is handled in api.js interceptor
        }
      },

      // Get all brands
      getBrands: () => {
        const state = get();
        if (state.brands.length === 0) {
          state.initialize();
        }
        return get().brands;
      },

      // Get brand by ID
      getBrandById: (id) => {
        return get().brands.find((brand) => String(brand.id) === String(id));
      },

      // Create brand
      createBrand: async (brandData) => {
        set({ isLoading: true });
        try {
          const response = await createBrand(brandData);
          const newBrand = {
            ...response.data,
            id: response.data._id
          };

          set((state) => ({
            brands: [...state.brands, newBrand],
            isLoading: false
          }));
          toastService.success('Brand created successfully');
          return newBrand;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Update brand
      updateBrand: async (id, brandData) => {
        set({ isLoading: true });
        try {
          const response = await updateBrand(id, brandData);
          const updatedBrand = {
            ...response.data,
            id: response.data._id
          };

          set((state) => ({
            brands: state.brands.map((brand) =>
              String(brand.id) === String(id) ? updatedBrand : brand
            ),
            isLoading: false
          }));
          toastService.success('Brand updated successfully');
          return updatedBrand;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Delete brand
      deleteBrand: async (id) => {
        set({ isLoading: true });
        try {
          await deleteBrand(id);
          set((state) => ({
            brands: state.brands.filter((brand) => String(brand.id) !== String(id)),
            isLoading: false
          }));
          toastService.success('Brand deleted successfully');
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Bulk delete brands
      bulkDeleteBrands: async (ids) => {
        set({ isLoading: true });
        try {
          await Promise.all(ids.map(id => deleteBrand(id)));
          set((state) => ({
            brands: state.brands.filter(
              (brand) => !ids.map(String).includes(String(brand.id))
            ),
            isLoading: false
          }));
          toastService.success(`${ids.length} brands deleted successfully`);
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Toggle brand status
      toggleBrandStatus: (id) => {
        const brand = get().getBrandById(id);
        if (brand) {
          get().updateBrand(id, { isActive: !brand.isActive });
        }
      },
    }),
    {
      name: 'brand-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

