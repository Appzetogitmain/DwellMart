import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import { toastService } from '../utils/toastService';

const getReassignmentMeta = (campaign) => {
  const movedCount = Number(campaign?._reassignment?.movedCount || 0);
  if (!Number.isFinite(movedCount) || movedCount <= 0) return null;

  const movedProducts = Array.isArray(campaign?._reassignment?.movedProducts)
    ? campaign._reassignment.movedProducts
    : [];
  const movedTypes = [...new Set(
    movedProducts
      .map((item) => String(item?.fromCampaignType || '').trim())
      .filter(Boolean)
  )];
  return { movedCount, movedTypes };
};

export const useCampaignStore = create((set, get) => ({
  campaigns: [],
  isLoading: false,

  initialize: async (params = {}) => {
    await get().fetchCampaigns(params);
  },

  fetchCampaigns: async (params = {}) => {
    set({ isLoading: true });
    try {
      const response = await adminService.getAllCampaigns(params);
      set({ campaigns: response.data, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      toastService.error(error, 'Failed to fetch campaigns');
    }
  },

  createCampaign: async (campaignData) => {
    set({ isLoading: true });
    try {
      const response = await adminService.createCampaign(campaignData);
      const reassignment = getReassignmentMeta(response?.data);
      set(state => ({
        campaigns: [...state.campaigns, response.data],
        isLoading: false
      }));
      if (reassignment) {
        const fromText = reassignment.movedTypes.length
          ? ` from ${reassignment.movedTypes.join(', ')}`
          : '';
        toastService.success(`${reassignment.movedCount} product(s) moved${fromText}. Latest-added wins.`);
      } else {
        toastService.success('Campaign created successfully');
      }
      return response.data;
    } catch (error) {
      set({ isLoading: false });
      toastService.error(error, 'Failed to create campaign');
      throw error;
    }
  },

  updateCampaign: async (id, campaignData) => {
    set({ isLoading: true });
    try {
      const response = await adminService.updateCampaign(id, campaignData);
      const reassignment = getReassignmentMeta(response?.data);
      set(state => ({
        campaigns: state.campaigns.map(c => c._id === id ? response.data : c),
        isLoading: false
      }));
      if (reassignment) {
        const fromText = reassignment.movedTypes.length
          ? ` from ${reassignment.movedTypes.join(', ')}`
          : '';
        toastService.success(`${reassignment.movedCount} product(s) moved${fromText}. Latest-added wins.`);
      } else {
        toastService.success('Campaign updated successfully');
      }
      return response.data;
    } catch (error) {
      set({ isLoading: false });
      toastService.error(error, 'Failed to update campaign');
      throw error;
    }
  },

  deleteCampaign: async (id) => {
    set({ isLoading: true });
    try {
      await adminService.deleteCampaign(id);
      set(state => ({
        campaigns: state.campaigns.filter(c => c._id !== id),
        isLoading: false
      }));
      toastService.success('Campaign deleted successfully');
    } catch (error) {
      set({ isLoading: false });
      toastService.error(error, 'Failed to delete campaign');
      throw error;
    }
  },

  toggleCampaignStatus: async (id) => {
    const campaign = get().campaigns.find(c => c._id === id);
    if (!campaign) return;
    await get().updateCampaign(id, { isActive: !campaign.isActive });
  },

  getCampaignsByType: (type) => {
    if (!type) return get().campaigns;
    return get().campaigns.filter((campaign) => campaign.type === type);
  }
}));

export const generateSlug = (name, existingCampaigns = []) => {
  if (!name) return '';

  let slug = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();

  let finalSlug = slug;
  let counter = 1;

  while (existingCampaigns.some(c => c.slug === finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  return finalSlug;
};
