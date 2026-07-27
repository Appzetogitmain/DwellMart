import { create } from "zustand";
import toast from "react-hot-toast";
import api from "../utils/api";
import logoImage from "../../../data/logos/ChatGPT Image Dec 2, 2025, 03_01_19 PM.png";

const defaultGeneralSettings = {
  storeName: "Dwell Mart",
  storeLogo: logoImage,
  storeDescription: "Your ultimate online shopping destination for premium quality products.",
  contactEmail: "contact@dwellmart.com",
  contactPhone: "+91 98765 43210",
  address: "123 Commerce Street, Tech Park, New Delhi, India",
  businessHours: "Mon-Sat 9AM-8PM",
  language: "en",
  socialMedia: {
    facebook: "",
    instagram: "",
    twitter: "",
    linkedin: "",
  },
  defaultCommissionRate: 10,
};

export const useSettingsStore = create((set, get) => ({
  settings: {
    general: defaultGeneralSettings,
  },
  isLoading: false,
  isInitialized: false,

  // Initialize and fetch settings from API (with public fallback)
  initialize: async () => {
    if (get().isInitialized && get().settings?.general?.storeName) return;
    set({ isLoading: true });
    try {
      // Try admin endpoint first, fallback to public endpoint
      let res;
      try {
        res = await api.get("/admin/settings/general");
      } catch (err) {
        res = await api.get("/settings/general");
      }

      const data = res?.data?.data || res?.data || {};
      const mergedGeneral = {
        ...defaultGeneralSettings,
        ...data,
        socialMedia: {
          ...defaultGeneralSettings.socialMedia,
          ...(data.socialMedia || {}),
        },
      };

      set({
        settings: {
          ...get().settings,
          general: mergedGeneral,
        },
        isLoading: false,
        isInitialized: true,
      });
    } catch (error) {
      set({ isLoading: false, isInitialized: true });
    }
  },

  // Save general settings via API
  updateGeneralSettings: async (generalData) => {
    set({ isLoading: true });
    try {
      const res = await api.put("/admin/settings/general", generalData);
      const updatedData = res?.data?.data || res?.data || generalData;

      const mergedGeneral = {
        ...defaultGeneralSettings,
        ...updatedData,
        socialMedia: {
          ...defaultGeneralSettings.socialMedia,
          ...(updatedData.socialMedia || {}),
        },
      };

      set((state) => ({
        settings: {
          ...state.settings,
          general: mergedGeneral,
        },
        isLoading: false,
      }));

      toast.success("General settings updated successfully");
      return mergedGeneral;
    } catch (error) {
      set({ isLoading: false });
      const msg = error?.response?.data?.message || "Failed to update settings";
      toast.error(msg);
      throw error;
    }
  },

  // Backward compatibility wrapper for updateSettings
  updateSettings: async (category, settingsData) => {
    if (category === "general" || category === "vendor") {
      const currentGeneral = get().settings?.general || defaultGeneralSettings;
      const merged = { ...currentGeneral, ...settingsData };
      return await get().updateGeneralSettings(merged);
    }
    return get().settings;
  },
}));
