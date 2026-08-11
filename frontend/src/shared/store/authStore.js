import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '../utils/api';
import { useNotificationStore } from './useNotificationStore';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      pendingEmail: null,

      // Login action
      login: async (email, password, rememberMe = false) => {
        set({ isLoading: true });
        const normalizedEmail = String(email || '').trim().toLowerCase();
        try {
          const response = await api.post('/user/auth/login', { email: normalizedEmail, password });
          const payload = response?.data ?? response;
          const accessToken = payload?.accessToken;
          const refreshToken = payload?.refreshToken;
          const user = payload?.user;

          if (!accessToken || !refreshToken || !user) {
            throw new Error('Invalid login response from server.');
          }

          set({
            user,
            token: accessToken,
            refreshToken,
            isAuthenticated: true,
            pendingEmail: null,
            isLoading: false,
          });

          localStorage.setItem('token', accessToken);
          localStorage.setItem('refresh-token', refreshToken);

          try {
            useNotificationStore.getState().registerDeviceToken();
          } catch {}

          return { success: true, user };
        } catch (error) {
          const backendMessage = String(
            error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.message ||
            ''
          ).toLowerCase();
          if (
            backendMessage.includes('email not verified') ||
            backendMessage.includes('verify your email')
          ) {
            set({ pendingEmail: normalizedEmail, isLoading: false });
            throw error;
          }
          set({ isLoading: false });
          throw error;
        }
      },

      // Register action
      register: async (name, email, password, phone) => {
        set({ isLoading: true });
        try {
          const normalizedPhone = String(phone || '').replace(/\D/g, '').slice(-10);
          const payload = {
            name,
            email,
            password,
            ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          };

          await api.post('/user/auth/register', payload);

          set({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            pendingEmail: email,
            isLoading: false,
          });

          localStorage.removeItem('token');
          localStorage.removeItem('refresh-token');

          return { success: true, email };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Verify OTP and complete login
      verifyOTP: async (email, otp) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          const response = await api.post('/user/auth/verify-otp', { email: normalizedEmail, otp });
          const payload = response?.data ?? response;
          const accessToken = payload?.accessToken;
          const refreshToken = payload?.refreshToken;
          const user = payload?.user;

          if (!accessToken || !refreshToken || !user) {
            throw new Error('Invalid OTP verification response from server.');
          }

          set({
            user,
            token: accessToken,
            refreshToken,
            isAuthenticated: true,
            pendingEmail: null,
            isLoading: false,
          });

          localStorage.setItem('token', accessToken);
          localStorage.setItem('refresh-token', refreshToken);

          try {
            useNotificationStore.getState().registerDeviceToken();
          } catch {}

          return { success: true, user };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Resend OTP
      resendOTP: async (email) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          await api.post('/user/auth/resend-otp', { email: normalizedEmail });
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      forgotPassword: async (email) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          await api.post('/user/auth/forgot-password', { email: normalizedEmail });
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      verifyResetOtp: async (email, otp) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          await api.post('/user/auth/verify-reset-otp', { email: normalizedEmail, otp });
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      resetPassword: async (email, password, confirmPassword) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase();
          await api.post('/user/auth/reset-password', { email: normalizedEmail, password, confirmPassword });
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Logout action
      logout: async () => {
        try {
          await useNotificationStore.getState().unregisterDeviceToken();
        } catch {}
        const refreshToken = localStorage.getItem('refresh-token');
        if (refreshToken) {
          api.post('/user/auth/logout', { refreshToken }).catch(() => {});
        }

        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          pendingEmail: null,
        });
        localStorage.removeItem('token');
        localStorage.removeItem('refresh-token');
        localStorage.removeItem('cart-storage');
        localStorage.removeItem('wishlist-storage');
        localStorage.removeItem('address-storage');
      },

      // Delete account action
      deleteAccount: async () => {
        set({ isLoading: true });
        try {
          await api.delete('/user/auth/account');
          // Run full cleanup identical to logout
          try {
            await useNotificationStore.getState().unregisterDeviceToken();
          } catch {}
          set({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            pendingEmail: null,
          });
          localStorage.removeItem('token');
          localStorage.removeItem('refresh-token');
          localStorage.removeItem('cart-storage');
          localStorage.removeItem('wishlist-storage');
          localStorage.removeItem('address-storage');
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Update user profile
      updateProfile: async (profileData) => {
        set({ isLoading: true });
        try {
          const response = await api.put('/user/auth/profile', {
            name: profileData?.name,
            phone: profileData?.phone,
          });
          const payload = response?.data ?? response;
          const currentUser = get().user || {};
          const updatedUser = {
            ...currentUser,
            ...payload,
            email: currentUser.email || payload.email,
          };

          set({
            user: updatedUser,
            isLoading: false,
          });
          
          return { success: true, user: updatedUser };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Change password
      changePassword: async (currentPassword, newPassword) => {
        set({ isLoading: true });
        try {
          await api.post('/user/auth/change-password', {
            currentPassword,
            newPassword,
          });
          set({ isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Upload profile avatar
      uploadProfileAvatar: async (file) => {
        if (!file) {
          throw new Error('Avatar file is required.');
        }

        set({ isLoading: true });
        try {
          const formData = new FormData();
          formData.append('avatar', file);

          const response = await api.post('/user/auth/profile/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          const payload = response?.data ?? response;
          const currentUser = get().user || {};
          const nextUser = {
            ...currentUser,
            ...(payload?.user || {}),
            avatar: payload?.avatar || payload?.user?.avatar || currentUser.avatar,
            email: currentUser.email || payload?.user?.email,
          };

          set({
            user: nextUser,
            isLoading: false,
          });

          return { success: true, user: nextUser };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Initialize auth state from localStorage
      initialize: () => {
        set({ isLoading: false });
        const token = localStorage.getItem('token');
        if (token) {
          const storedState = JSON.parse(localStorage.getItem('auth-storage') || '{}');
          const refreshToken = localStorage.getItem('refresh-token');
          if (storedState.state?.user) {
            set({
              user: storedState.state.user,
              token,
              refreshToken: refreshToken || null,
              isAuthenticated: true,
            });
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        pendingEmail: state.pendingEmail,
      }),
    }
  )
);

