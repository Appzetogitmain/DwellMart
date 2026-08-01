import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import api from "../../../shared/utils/api";
import {
  registerVendor,
  updateVendorProfile,
  updateVendorSellingChannels,
  forgotVendorPassword,
  verifyVendorResetOTP,
  resetVendorPassword,
} from "../services/vendorService";

export const useVendorAuthStore = create(
  persist(
    (set, get) => ({
      vendor: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      // Vendor login action
      login: async (email, password, rememberMe = false) => {
        set({ isLoading: true });
        try {
          const normalizedEmail = String(email || "").trim().toLowerCase();
          const response = await api.post("/vendor/auth/login", {
            email: normalizedEmail,
            password,
          });
          const authData = response?.data || {};
          const vendor = authData.vendor;
          const accessToken = authData.accessToken;
          const refreshToken = authData.refreshToken;

          if (!vendor || !accessToken || !refreshToken) {
            throw new Error("Invalid login response");
          }

          set({
            vendor,
            token: accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          // Store token for vendor API requests
          localStorage.setItem("vendor-token", accessToken);
          localStorage.setItem("vendor-refresh-token", refreshToken);

          return { success: true, vendor };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Vendor registration action — calls real POST /vendor/auth/register
      // Backend sends an OTP email; vendor is NOT authenticated until OTP verified.
      register: async (vendorData) => {
        set({ isLoading: true });
        try {
          const response = await registerVendor(vendorData);
          // response is already unwrapped by api.js interceptor → response.data
          const data = response?.data ?? response;

          set({ isLoading: false });

          return {
            success: true,
            message:
              data?.message ||
              "Registration successful! Please check your email for the OTP.",
          };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      forgotPassword: async (email) => {
        set({ isLoading: true });
        try {
          const response = await forgotVendorPassword(email);
          const data = response?.data ?? response;
          set({ isLoading: false });
          return { success: true, message: data?.message };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      verifyResetOtp: async (email, otp) => {
        set({ isLoading: true });
        try {
          const response = await verifyVendorResetOTP(email, otp);
          const data = response?.data ?? response;
          set({ isLoading: false });
          return { success: true, message: data?.message };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      resetPassword: async (email, password, confirmPassword) => {
        set({ isLoading: true });
        try {
          const response = await resetVendorPassword(email, password, confirmPassword);
          const data = response?.data ?? response;
          set({ isLoading: false });
          return { success: true, message: data?.message };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Vendor logout action
      logout: () => {
        const refreshToken = localStorage.getItem("vendor-refresh-token");
        if (refreshToken) {
          api.post("/vendor/auth/logout", { refreshToken }).catch(() => {});
        }

        set({
          vendor: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
        });
        localStorage.removeItem("vendor-token");
        localStorage.removeItem("vendor-refresh-token");
      },

      // Update vendor profile — calls real PUT /vendor/auth/profile
      updateProfile: async (profileData) => {
        set({ isLoading: true });
        try {
          const response = await updateVendorProfile(profileData);
          const data = response?.data ?? response;
          // Merge returned vendor data back into state so UI stays in sync
          const updatedVendor =
            data && (data._id || data.id)
              ? data
              : (data?.vendor ?? { ...get().vendor, ...profileData });

          set({
            vendor: updatedVendor,
            isLoading: false,
          });

          return { success: true, vendor: updatedVendor };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Update vendor selling channels — calls real PUT /vendor/auth/selling-channels
      updateSellingChannels: async (payload) => {
        set({ isLoading: true });
        try {
          const response = await updateVendorSellingChannels(payload);
          const data = response?.data ?? response;
          const updatedVendor =
            data && (data._id || data.id)
              ? data
              : (data?.vendor ?? { ...get().vendor, ...payload });

          set({
            vendor: updatedVendor,
            isLoading: false,
          });

          return { success: true, vendor: updatedVendor };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Initialize vendor auth state from localStorage
      initialize: () => {
        const token = localStorage.getItem("vendor-token");
        if (token) {
          const storedState = JSON.parse(
            localStorage.getItem("vendor-auth-storage") || "{}"
          );
          const refreshToken = localStorage.getItem("vendor-refresh-token");
          const persistedVendor = storedState.state?.vendor || null;
          if (persistedVendor) {
            set({
              vendor: persistedVendor,
              token,
              refreshToken: refreshToken || null,
              isAuthenticated: true,
              isLoading: false,
            });
          }
        }
      },
    }),
    {
      name: "vendor-auth-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
