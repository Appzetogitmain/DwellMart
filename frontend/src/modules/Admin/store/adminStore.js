import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { adminLogin as apiLogin } from '../services/adminService';
import api from '../../../shared/utils/api';

const persistedAuthState = (state) => ({
  admin: state.admin,
  token: state.token,
  refreshToken: state.refreshToken,
  isAuthenticated: state.isAuthenticated,
});

export const useAdminAuthStore = create(
  persist(
    (set, get) => ({
      admin: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      // Helper to check permission
      can: (permissionToken) => {
        const { admin } = get();
        if (!admin) return false;
        if (admin.role === 'superadmin') return true;
        const permissions = Array.isArray(admin.permissions) ? admin.permissions : [];
        return permissions.includes(permissionToken);
      },

      canAny: (...permissionTokens) => {
        const { admin } = get();
        if (!admin) return false;
        if (admin.role === 'superadmin') return true;
        const permissions = Array.isArray(admin.permissions) ? admin.permissions : [];
        return permissionTokens.some((t) => permissions.includes(t));
      },

      // Admin login - calls backend
      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await apiLogin(email, password);
          const data = response?.data || response;
          const { accessToken, refreshToken, admin } = data;

          localStorage.setItem('adminToken', accessToken);
          localStorage.setItem('adminRefreshToken', refreshToken);

          set({
            admin,
            token: accessToken,
            refreshToken,
            isAuthenticated: true,
          });

          return { success: true, admin };
        } finally {
          set({ isLoading: false });
        }
      },

      // Update active admin profile in store
      setAdmin: (updatedAdmin) => {
        set((state) => ({
          admin: { ...state.admin, ...updatedAdmin },
        }));
      },

      // Admin logout
      logout: () => {
        const refreshToken = localStorage.getItem('adminRefreshToken');
        if (refreshToken) {
          api.post('/admin/auth/logout', { refreshToken }).catch(() => {});
        }

        set({
          admin: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminRefreshToken');
      },
    }),
    {
      name: 'admin-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: persistedAuthState,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState || {}),
        isLoading: false,
      }),
      version: 3,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState;
        }
        const { isLoading, ...rest } = persistedState;
        return rest;
      },
    }
  )
);
