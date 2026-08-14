import { create } from "zustand";
import {
  getAllVendors,
  getVendorById,
  updateVendorStatus as updateVendorStatusApi,
  updateCommissionRate as updateCommissionRateApi,
} from "../services/adminService";

const normalizeVendor = (vendor) => {
  if (!vendor || typeof vendor !== "object") return vendor;
  const id = String(vendor.id || vendor._id || "");
  return {
    ...vendor,
    id,
    _id: String(vendor._id || id),
  };
};

export const useVendorStore = create((set, get) => ({
  vendors: [],
  selectedVendor: null,
  isLoading: false,

  initialize: async () => {
    set({ isLoading: true });
    try {
      const vendors = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await getAllVendors({ page, limit: 200 });
        const payload = response?.data ?? response;
        const pageVendors = Array.isArray(payload?.vendors)
          ? payload.vendors.map(normalizeVendor)
          : [];

        vendors.push(...pageVendors);
        totalPages = Math.max(Number(payload?.pages) || 1, 1);
        page += 1;
      } while (page <= totalPages);

      set({ vendors, isLoading: false });
      return vendors;
    } catch {
      set({ isLoading: false });
      return [];
    }
  },

  getAllVendors: () => get().vendors,

  getVendor: async (id) => {
    if (!id || id === 'undefined' || id === 'null') return null;

    const existing = get().vendors.find(
      (v) => String(v.id || v._id) === String(id)
    );
    if (existing) {
      set({ selectedVendor: existing });
      return existing;
    }

    try {
      const response = await getVendorById(id);
      const payload = response?.data?.vendor ?? response?.data ?? response;
      const vendor = normalizeVendor(payload);
      if (!vendor || (!vendor.id && !vendor._id)) return null;
      set((state) => ({
        selectedVendor: vendor,
        vendors: state.vendors.some(
          (v) => String(v.id || v._id) === String(vendor.id || vendor._id)
        )
          ? state.vendors.map((v) =>
            String(v.id || v._id) === String(vendor.id || vendor._id) ? vendor : v
          )
          : [...state.vendors, vendor],
      }));
      return vendor;
    } catch {
      return null;
    }
  },

  updateVendorStatus: async (id, status, reason = "", vendorType = null, approvedChannels = null) => {
    try {
      const response = await updateVendorStatusApi(id, status, reason, vendorType, approvedChannels);
      const vendor = normalizeVendor(response?.data ?? response);
      if (!vendor) return false;
      set((state) => ({
        vendors: state.vendors.map((v) =>
          String(v.id || v._id) === String(id) ? { ...v, ...vendor } : v
        ),
        selectedVendor:
          state.selectedVendor &&
          String(state.selectedVendor.id || state.selectedVendor._id) ===
          String(id)
            ? { ...state.selectedVendor, ...vendor }
            : state.selectedVendor,
      }));
      return true;
    } catch {
      return false;
    }
  },


  updateCommissionRate: async (id, commissionRate) => {
    try {
      const response = await updateCommissionRateApi(id, commissionRate);
      const vendor = normalizeVendor(response?.data ?? response);
      if (!vendor) return false;
      set((state) => ({
        vendors: state.vendors.map((v) =>
          String(v.id || v._id) === String(id) ? { ...v, ...vendor } : v
        ),
        selectedVendor:
          state.selectedVendor &&
          String(state.selectedVendor.id || state.selectedVendor._id) ===
          String(id)
            ? { ...state.selectedVendor, ...vendor }
            : state.selectedVendor,
      }));
      return true;
    } catch {
      return false;
    }
  },
}));
