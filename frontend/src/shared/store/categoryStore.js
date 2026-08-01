import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { categories as initialCategories } from '../../data/categories';
import {
  getAllCategories,
  getPublicCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories as reorderCategoriesApi,
  seedCategoriesApi,
} from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useCategoryStore = create(
  persist(
    (set, get) => ({
      categories: [],
      isLoading: false,
      // Which category tree is currently loaded. Null means the default
      // (Marketplace) tree, matching pre-Quick-Commerce behaviour.
      loadedExperience: null,

      /**
       * Initialize categories.
       * @param {string} [experience] Admin only — which category tree to load.
       *   Omitted loads the Marketplace tree, so existing callers are unchanged.
       */
      initialize: async (experience) => {
        set({ isLoading: true });
        try {
          const isAdminArea =
            typeof window !== 'undefined' &&
            window.location.pathname.startsWith('/admin');
          const response = isAdminArea
            ? await getAllCategories(experience)
            : await getPublicCategories();
          const normalizedCategories = response.data.map(cat => ({
            ...cat,
            id: cat._id // Ensure UI compatibility by aliasing _id to id
          }));
          set({
            categories: normalizedCategories,
            loadedExperience: experience || null,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          // Error toast is handled in api.js interceptor
        }
      },

      // Get all categories
      getCategories: () => {
        const state = get();
        if (state.categories.length === 0) {
          state.initialize();
        }
        return get().categories;
      },

      // Get category by ID
      getCategoryById: (id) => {
        return get().categories.find((cat) => String(cat.id) === String(id));
      },

      // Create category
      createCategory: async (categoryData) => {
        set({ isLoading: true });
        try {
          const response = await createCategory(categoryData);
          const newCategory = {
            ...response.data,
            id: response.data._id
          };

          set((state) => ({
            categories: [...state.categories, newCategory],
            isLoading: false
          }));
          toast.success('Category created successfully');
          return newCategory;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Update category
      updateCategory: async (id, categoryData) => {
        set({ isLoading: true });
        try {
          const response = await updateCategory(id, categoryData);
          const updatedCategory = {
            ...response.data,
            id: response.data._id
          };

          set((state) => ({
            categories: state.categories.map((cat) =>
              String(cat.id) === String(id) ? updatedCategory : cat
            ),
            isLoading: false
          }));
          toast.success('Category updated successfully');
          return updatedCategory;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Delete category
      deleteCategory: async (id) => {
        set({ isLoading: true });
        try {
          await deleteCategory(id);
          set((state) => ({
            categories: state.categories.filter((cat) => String(cat.id) !== String(id)),
            isLoading: false
          }));
          toast.success('Category deleted successfully');
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Bulk delete categories
      bulkDeleteCategories: async (ids) => {
        set({ isLoading: true });
        try {
          // Sequentially delete for now, or updating backend to support bulk delete would be better
          // But to stick to constraints and existing service, we'll map
          await Promise.all(ids.map(id => deleteCategory(id)));

          set((state) => ({
            categories: state.categories.filter(
              (cat) => !ids.map(String).includes(String(cat.id))
            ),
            isLoading: false
          }));
          toast.success(`${ids.length} categories deleted successfully`);
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Toggle category status
      toggleCategoryStatus: (id) => {
        const category = get().getCategoryById(id);
        if (category) {
          get().updateCategory(id, { isActive: !category.isActive });
        }
      },

      // Get categories by parent
      getCategoriesByParent: (parentId) => {
        return get().categories.filter((cat) => {
          const normalizedParent = typeof cat.parentId === 'object'
            ? (cat.parentId?._id ?? cat.parentId?.id ?? null)
            : cat.parentId;
          const catParentId = normalizedParent ? String(normalizedParent) : null;
          const targetParentId = parentId ? String(parentId) : null;
          return catParentId === targetParentId;
        });
      },

      // Get root categories
      getRootCategories: () => {
        return get().categories.filter((cat) => !cat.parentId);
      },

      // Reorder categories
      reorderCategories: async (categoryIds) => {
        set({ isLoading: true });
        try {
          const response = await reorderCategoriesApi(categoryIds);
          const normalizedCategories = (response.data || []).map((cat) => ({
            ...cat,
            id: cat._id,
          }));
          set({ categories: normalizedCategories, isLoading: false });
          toast.success('Category order updated successfully');
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Seed marketplace categories
      seedCategories: async () => {
        set({ isLoading: true });
        try {
          const response = await seedCategoriesApi();
          const categoriesList = response.data?.categories || [];
          const normalizedCategories = categoriesList.map((cat) => ({
            ...cat,
            id: cat._id,
          }));
          set({ categories: normalizedCategories, isLoading: false });
          toast.success('Marketplace categories seeded successfully');
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },
    }),
    {
      name: 'category-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
