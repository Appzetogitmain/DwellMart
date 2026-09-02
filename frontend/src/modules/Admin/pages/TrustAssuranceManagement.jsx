import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiTruck,
  FiRotateCcw,
  FiShield,
  FiCheckCircle,
  FiUsers,
  FiBox,
  FiGrid,
  FiLock,
  FiAward,
  FiGlobe,
  FiTag,
  FiPercent,
  FiHeart,
  FiStar,
  FiClock,
  FiHeadphones,
  FiGift,
  FiDollarSign,
  FiZap,
  FiSave,
  FiRefreshCw,
  FiPlus,
  FiTrash2,
  FiArrowUp,
  FiArrowDown,
  FiEye,
  FiAlertCircle,
  FiCheck,
  FiDatabase,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';

// Icon mapping helpers
export const ICON_MAP = {
  truck: FiTruck,
  rotate: FiRotateCcw,
  shield: FiShield,
  check: FiCheckCircle,
  users: FiUsers,
  box: FiBox,
  grid: FiGrid,
  lock: FiLock,
  award: FiAward,
  globe: FiGlobe,
  tag: FiTag,
  percent: FiPercent,
  heart: FiHeart,
  star: FiStar,
  clock: FiClock,
  headset: FiHeadphones,
  gift: FiGift,
  dollar: FiDollarSign,
  zap: FiZap,
};

export const COLOR_SCHEMES = [
  { key: 'info', label: 'Blue (Info)', bgClass: 'bg-status-info/10 text-status-info' },
  { key: 'success', label: 'Green (Success)', bgClass: 'bg-status-success/10 text-status-success' },
  { key: 'primary', label: 'Gold / Brand (Primary)', bgClass: 'bg-brand-primary/10 text-brand-primary' },
  { key: 'warning', label: 'Amber / Orange (Warning)', bgClass: 'bg-status-warning/10 text-status-warning' },
  { key: 'purple', label: 'Purple (Royal)', bgClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  { key: 'rose', label: 'Rose / Red (Vibrant)', bgClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { key: 'teal', label: 'Teal (Ocean)', bgClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' },
];

export const FEATURE_ICON_OPTIONS = [
  { key: 'truck', label: 'Delivery Truck', icon: FiTruck },
  { key: 'rotate', label: 'Easy Returns / Rotate', icon: FiRotateCcw },
  { key: 'shield', label: 'Shield / Security', icon: FiShield },
  { key: 'check', label: 'Verified Checkmark', icon: FiCheckCircle },
  { key: 'box', label: 'Package Box', icon: FiBox },
  { key: 'award', label: 'Award / Ribbon', icon: FiAward },
  { key: 'lock', label: 'Security Lock', icon: FiLock },
  { key: 'globe', label: 'International Globe', icon: FiGlobe },
  { key: 'tag', label: 'Price / Deal Tag', icon: FiTag },
  { key: 'percent', label: 'Percent / Discount', icon: FiPercent },
  { key: 'heart', label: 'Heart / Care', icon: FiHeart },
  { key: 'star', label: 'Star / Quality', icon: FiStar },
  { key: 'clock', label: 'Clock / 24-7 Support', icon: FiClock },
  { key: 'headset', label: 'Headset / Customer Care', icon: FiHeadphones },
  { key: 'gift', label: 'Gift / Reward', icon: FiGift },
  { key: 'dollar', label: 'Dollar / Savings', icon: FiDollarSign },
  { key: 'zap', label: 'Lightning / Fast', icon: FiZap },
];

export const STAT_ICON_OPTIONS = [
  { key: 'users', label: 'Users / Vendors', icon: FiUsers },
  { key: 'box', label: 'Box / Products', icon: FiBox },
  { key: 'grid', label: 'Grid / Categories', icon: FiGrid },
  { key: 'lock', label: 'Lock / Security', icon: FiLock },
  { key: 'shield', label: 'Shield / Assurance', icon: FiShield },
  { key: 'award', label: 'Award / Brands', icon: FiAward },
  { key: 'star', label: 'Star / Ratings', icon: FiStar },
  { key: 'truck', label: 'Truck / Deliveries', icon: FiTruck },
  { key: 'dollar', label: 'Dollar / Transactions', icon: FiDollarSign },
  { key: 'check', label: 'Check / Verified', icon: FiCheckCircle },
  { key: 'globe', label: 'Globe / Cities', icon: FiGlobe },
  { key: 'tag', label: 'Tag / Deals', icon: FiTag },
];

const initialData = {
  badge: 'MARKETPLACE TRUST & ASSURANCE',
  title: 'Why Shop With Dwell Mart?',
  subtitle: 'We partner with top-rated sellers to guarantee authentic products, transparent pricing, and instant support.',
  isEnabled: true,
  featureCards: [
    {
      id: 'feature-1',
      title: 'Free Express Shipping',
      description: 'On all orders over ₹499 nationwide',
      icon: 'truck',
      colorScheme: 'info',
      isActive: true,
    },
    {
      id: 'feature-2',
      title: '7-Day Easy Returns',
      description: 'Hassle-free 100% money back guarantee',
      icon: 'rotate',
      colorScheme: 'success',
      isActive: true,
    },
    {
      id: 'feature-3',
      title: '100% Secure Payments',
      description: 'Encrypted checkout via UPI, Cards & NetBanking',
      icon: 'shield',
      colorScheme: 'primary',
      isActive: true,
    },
    {
      id: 'feature-4',
      title: 'Verified Marketplace Sellers',
      description: 'Quality-vetted vendors across India',
      icon: 'check',
      colorScheme: 'warning',
      isActive: true,
    },
  ],
  statCards: [
    {
      id: 'stat-1',
      value: '8+',
      label: 'VERIFIED STORES',
      icon: 'users',
      isActive: true,
    },
    {
      id: 'stat-2',
      value: '6+',
      label: 'CURATED PRODUCTS',
      icon: 'box',
      isActive: true,
    },
    {
      id: 'stat-3',
      value: '10+',
      label: 'CATEGORIES',
      icon: 'grid',
      isActive: true,
    },
    {
      id: 'stat-4',
      value: '100%',
      label: 'SECURE PAYMENTS',
      icon: 'lock',
      isActive: true,
    },
  ],
};

const TrustAssuranceManagement = () => {
  const [formData, setFormData] = useState(initialData);
  const [savedData, setSavedData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [liveCounts, setLiveCounts] = useState({ vendors: null, products: null, categories: null });
  const [isLoadingLiveCounts, setIsLoadingLiveCounts] = useState(false);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/admin/trust-assurance');
      const data = response?.data || response || {};
      const config = {
        badge: data.badge || initialData.badge,
        title: data.title || initialData.title,
        subtitle: data.subtitle || initialData.subtitle,
        isEnabled: data.isEnabled !== false,
        featureCards: Array.isArray(data.featureCards) && data.featureCards.length > 0
          ? data.featureCards
          : initialData.featureCards,
        statCards: Array.isArray(data.statCards) && data.statCards.length > 0
          ? data.statCards
          : initialData.statCards,
      };
      setFormData(config);
      setSavedData(config);
    } catch (error) {
      console.error('Failed to load Trust & Assurance configuration:', error);
      toast.error('Failed to load configuration from server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchLiveCounts = async () => {
    setIsLoadingLiveCounts(true);
    try {
      const [vendorsRes, productsRes, categoriesRes] = await Promise.allSettled([
        api.get('/vendors?limit=1'),
        api.get('/products?limit=1'),
        api.get('/categories/all'),
      ]);

      const vendorsTotal = vendorsRes.status === 'fulfilled' ? (vendorsRes.value?.data?.pagination?.total || vendorsRes.value?.pagination?.total || 0) : null;
      const productsTotal = productsRes.status === 'fulfilled' ? (productsRes.value?.data?.total || productsRes.value?.total || 0) : null;
      const categoriesTotal = categoriesRes.status === 'fulfilled' ? (Array.isArray(categoriesRes.value?.data) ? categoriesRes.value.data.length : (Array.isArray(categoriesRes.value) ? categoriesRes.value.length : 0)) : null;

      setLiveCounts({
        vendors: vendorsTotal,
        products: productsTotal,
        categories: categoriesTotal,
      });
      toast.success('Live database counts fetched!');
    } catch (err) {
      console.error('Failed to fetch live counts:', err);
      toast.error('Could not fetch database counts.');
    } finally {
      setIsLoadingLiveCounts(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleHeaderChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Feature Cards Handlers
  const handleFeatureChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.featureCards];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, featureCards: updated };
    });
  };

  const addFeatureCard = () => {
    if (formData.featureCards.length >= 8) {
      toast.error('Maximum 8 feature cards allowed.');
      return;
    }
    const newCard = {
      id: `feature-${Date.now()}`,
      title: 'New Benefit Title',
      description: 'Short customer benefit description',
      icon: 'shield',
      colorScheme: 'primary',
      isActive: true,
    };
    setFormData((prev) => ({
      ...prev,
      featureCards: [...prev.featureCards, newCard],
    }));
  };

  const removeFeatureCard = (index) => {
    if (formData.featureCards.length <= 1) {
      toast.error('At least 1 feature card is required.');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      featureCards: prev.featureCards.filter((_, idx) => idx !== index),
    }));
  };

  const moveFeatureCard = (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= formData.featureCards.length) return;
    setFormData((prev) => {
      const cards = [...prev.featureCards];
      const temp = cards[index];
      cards[index] = cards[targetIdx];
      cards[targetIdx] = temp;
      return { ...prev, featureCards: cards };
    });
  };

  // Stat Cards Handlers
  const handleStatChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.statCards];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, statCards: updated };
    });
  };

  const addStatCard = () => {
    if (formData.statCards.length >= 8) {
      toast.error('Maximum 8 stat cards allowed.');
      return;
    }
    const newCard = {
      id: `stat-${Date.now()}`,
      value: '100+',
      label: 'NEW STAT METRIC',
      icon: 'star',
      isActive: true,
    };
    setFormData((prev) => ({
      ...prev,
      statCards: [...prev.statCards, newCard],
    }));
  };

  const removeStatCard = (index) => {
    if (formData.statCards.length <= 1) {
      toast.error('At least 1 stat card is required.');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      statCards: prev.statCards.filter((_, idx) => idx !== index),
    }));
  };

  const moveStatCard = (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= formData.statCards.length) return;
    setFormData((prev) => {
      const cards = [...prev.statCards];
      const temp = cards[index];
      cards[index] = cards[targetIdx];
      cards[targetIdx] = temp;
      return { ...prev, statCards: cards };
    });
  };

  const applyLiveCountToStat = (index, value) => {
    if (value === null || value === undefined) return;
    handleStatChange(index, 'value', `${value}+`);
    toast.success(`Updated stat to ${value}+`);
  };

  // Save changes
  const handleSave = async (e) => {
    if (e) e.preventDefault();

    if (!formData.title?.trim()) {
      toast.error('Section title cannot be empty.');
      return;
    }
    for (let i = 0; i < formData.featureCards.length; i++) {
      if (!formData.featureCards[i].title?.trim()) {
        toast.error(`Feature Card #${i + 1} title cannot be empty.`);
        return;
      }
    }
    for (let i = 0; i < formData.statCards.length; i++) {
      if (!formData.statCards[i].value?.trim() || !formData.statCards[i].label?.trim()) {
        toast.error(`Stat Card #${i + 1} must have a value and label.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const response = await api.put('/admin/trust-assurance', formData);
      const data = response?.data || response || {};
      const saved = {
        badge: data.badge || formData.badge,
        title: data.title || formData.title,
        subtitle: data.subtitle || formData.subtitle,
        isEnabled: data.isEnabled !== false,
        featureCards: data.featureCards || formData.featureCards,
        statCards: data.statCards || formData.statCards,
      };
      setFormData(saved);
      setSavedData(saved);
      toast.success('Trust & Assurance cards saved successfully!');
    } catch (error) {
      console.error('Failed to save Trust & Assurance config:', error);
      const msg = error?.response?.data?.message || 'Failed to save configuration.';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(savedData);

  return (
    <div className="space-y-8 pb-16">
      {/* Top Banner & Quick Actions */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <FiShield className="text-amber-500 text-2xl" />
            Marketplace Trust & Assurance Settings
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Configure the 4 White Feature Cards & 4 Black Stat Cards shown in the homepage trust section.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchConfig}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 active:bg-amber-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <FiSave className="w-3.5 h-3.5" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Loading Trust & Assurance configuration...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-8">
          {/* Section 1: Section Header Settings */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                    Section Headline & Global Visibility
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Badge text, main title, subtitle, and homepage visibility switch.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-start sm:self-auto bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Section Enabled:
                </span>
                <button
                  type="button"
                  onClick={() => handleHeaderChange('isEnabled', !formData.isEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    formData.isEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.isEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Badge Text */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Top Pill Badge Text
                </label>
                <input
                  type="text"
                  value={formData.badge}
                  onChange={(e) => handleHeaderChange('badge', e.target.value)}
                  placeholder="e.g. MARKETPLACE TRUST & ASSURANCE"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:border-amber-500 focus:bg-white dark:focus:bg-gray-900"
                />
              </div>

              {/* Title */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Main Section Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleHeaderChange('title', e.target.value)}
                  placeholder="e.g. Why Shop With Dwell Mart?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-bold bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:border-amber-500 focus:bg-white dark:focus:bg-gray-900"
                  required
                />
              </div>

              {/* Subtitle */}
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Section Subtitle / Description
                </label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => handleHeaderChange('subtitle', e.target.value)}
                  placeholder="e.g. We partner with top-rated sellers to guarantee authentic products, transparent pricing, and instant support."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:border-amber-500 focus:bg-white dark:focus:bg-gray-900"
                />
              </div>
            </div>
          </div>

          {/* Section 2: White Feature Cards */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                    The White Feature Cards (Top Row)
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Edit benefits like Free Express Shipping, 7-Day Returns, 100% Secure Payments, etc.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={addFeatureCard}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm self-start sm:self-auto"
              >
                <FiPlus className="w-3.5 h-3.5" />
                Add Feature Card
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {formData.featureCards.map((card, index) => {
                const IconComp = ICON_MAP[card.icon] || FiShield;
                const currentScheme = COLOR_SCHEMES.find((s) => s.key === card.colorScheme) || COLOR_SCHEMES[0];

                return (
                  <div
                    key={card.id || index}
                    className="border border-gray-200 dark:border-gray-700/70 rounded-2xl p-4 sm:p-5 bg-gray-50/50 dark:bg-gray-800/30 space-y-4 hover:border-blue-400/50 transition-all"
                  >
                    {/* Header Controls */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-gray-200/60 dark:border-gray-700/60">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[10px] font-bold">
                          {index + 1}
                        </span>
                        Card #{index + 1}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveFeatureCard(index, -1)}
                          disabled={index === 0}
                          title="Move Left"
                          className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-white disabled:opacity-30"
                        >
                          <FiArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveFeatureCard(index, 1)}
                          disabled={index === formData.featureCards.length - 1}
                          title="Move Right"
                          className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-white disabled:opacity-30"
                        >
                          <FiArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFeatureChange(index, 'isActive', !card.isActive)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                            card.isActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                              : 'bg-gray-200 text-gray-500 dark:bg-gray-700'
                          }`}
                        >
                          {card.isActive ? 'Active' : 'Hidden'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFeatureCard(index)}
                          title="Delete Card"
                          className="p-1 rounded text-red-400 hover:text-red-600 transition-colors"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Visual Card Live Preview */}
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3.5 flex items-start gap-3 shadow-sm">
                      <div className={`h-10 w-10 rounded-xl ${currentScheme.bgClass} flex items-center justify-center shrink-0`}>
                        <IconComp className="text-lg" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-extrabold text-gray-900 dark:text-white leading-tight mb-0.5 truncate">
                          {card.title || 'Card Title'}
                        </h4>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium leading-normal line-clamp-2">
                          {card.description || 'Benefit description...'}
                        </p>
                      </div>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Card Title *
                        </label>
                        <input
                          type="text"
                          value={card.title}
                          onChange={(e) => handleFeatureChange(index, 'title', e.target.value)}
                          placeholder="e.g. Free Express Shipping"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-amber-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={card.description}
                          onChange={(e) => handleFeatureChange(index, 'description', e.target.value)}
                          placeholder="e.g. On all orders over ₹499 nationwide"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-amber-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Icon
                          </label>
                          <select
                            value={card.icon}
                            onChange={(e) => handleFeatureChange(index, 'icon', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-amber-500"
                          >
                            {FEATURE_ICON_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Color Theme
                          </label>
                          <select
                            value={card.colorScheme}
                            onChange={(e) => handleFeatureChange(index, 'colorScheme', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-amber-500"
                          >
                            {COLOR_SCHEMES.map((scheme) => (
                              <option key={scheme.key} value={scheme.key}>
                                {scheme.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Black Stat Cards */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                    The Black Stat Cards (Bottom Row)
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Edit dark social proof numbers (8+ Verified Stores, 6+ Curated Products, 10+ Categories, etc.).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={fetchLiveCounts}
                  disabled={isLoadingLiveCounts}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors border border-gray-200 dark:border-gray-700"
                >
                  <FiDatabase className={`w-3.5 h-3.5 text-amber-500 ${isLoadingLiveCounts ? 'animate-spin' : ''}`} />
                  Auto-Detect DB Counts
                </button>

                <button
                  type="button"
                  onClick={addStatCard}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors shadow-sm"
                >
                  <FiPlus className="w-3.5 h-3.5" />
                  Add Stat Card
                </button>
              </div>
            </div>

            {/* Live Counts Helper Banner */}
            {(liveCounts.vendors !== null || liveCounts.products !== null || liveCounts.categories !== null) && (
              <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 text-xs flex flex-wrap items-center gap-4 text-amber-900 dark:text-amber-200">
                <span className="font-bold flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <FiCheck className="text-base" /> Real Database Totals:
                </span>
                <span>Active Vendors: <strong>{liveCounts.vendors ?? '--'}</strong></span>
                <span>Active Products: <strong>{liveCounts.products ?? '--'}</strong></span>
                <span>Categories: <strong>{liveCounts.categories ?? '--'}</strong></span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {formData.statCards.map((card, index) => {
                const IconComp = ICON_MAP[card.icon] || FiUsers;

                return (
                  <div
                    key={card.id || index}
                    className="border border-gray-200 dark:border-gray-700/70 rounded-2xl p-4 sm:p-5 bg-gray-50/50 dark:bg-gray-800/30 space-y-4 hover:border-amber-400/50 transition-all"
                  >
                    {/* Header Controls */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-gray-200/60 dark:border-gray-700/60">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Stat #{index + 1}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveStatCard(index, -1)}
                          disabled={index === 0}
                          title="Move Left"
                          className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-white disabled:opacity-30"
                        >
                          <FiArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStatCard(index, 1)}
                          disabled={index === formData.statCards.length - 1}
                          title="Move Right"
                          className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-white disabled:opacity-30"
                        >
                          <FiArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatChange(index, 'isActive', !card.isActive)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                            card.isActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                              : 'bg-gray-200 text-gray-500 dark:bg-gray-700'
                          }`}
                        >
                          {card.isActive ? 'Active' : 'Hidden'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStatCard(index)}
                          title="Delete Card"
                          className="p-1 rounded text-red-400 hover:text-red-600 transition-colors"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Visual Dark Card Live Preview */}
                    <div className="bg-[#0f172a] rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-md border border-slate-800">
                      <IconComp className="text-amber-400 text-xl mb-1.5" />
                      <span className="text-2xl font-black text-amber-400 tracking-tight mb-0.5">
                        {card.value || '0+'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                        {card.label || 'STAT LABEL'}
                      </span>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Metric Value *
                        </label>
                        <input
                          type="text"
                          value={card.value}
                          onChange={(e) => handleStatChange(index, 'value', e.target.value)}
                          placeholder="e.g. 8+, 100%, 500+"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-bold text-amber-600 dark:text-amber-400 bg-white dark:bg-gray-900 focus:border-amber-500"
                          required
                        />
                        {liveCounts.vendors !== null && index === 0 && (
                          <button
                            type="button"
                            onClick={() => applyLiveCountToStat(index, liveCounts.vendors)}
                            className="mt-1 text-[10px] text-amber-600 hover:underline block"
                          >
                            Insert live vendors ({liveCounts.vendors}+)
                          </button>
                        )}
                        {liveCounts.products !== null && index === 1 && (
                          <button
                            type="button"
                            onClick={() => applyLiveCountToStat(index, liveCounts.products)}
                            className="mt-1 text-[10px] text-amber-600 hover:underline block"
                          >
                            Insert live products ({liveCounts.products}+)
                          </button>
                        )}
                        {liveCounts.categories !== null && index === 2 && (
                          <button
                            type="button"
                            onClick={() => applyLiveCountToStat(index, liveCounts.categories)}
                            className="mt-1 text-[10px] text-amber-600 hover:underline block"
                          >
                            Insert live categories ({liveCounts.categories}+)
                          </button>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Metric Label *
                        </label>
                        <input
                          type="text"
                          value={card.label}
                          onChange={(e) => handleStatChange(index, 'label', e.target.value)}
                          placeholder="e.g. VERIFIED STORES"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold uppercase bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-amber-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Icon
                        </label>
                        <select
                          value={card.icon}
                          onChange={(e) => handleStatChange(index, 'icon', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-amber-500"
                        >
                          {STAT_ICON_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 4: Live Storefront Combined Preview */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs">
                <FiEye />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                  Live Customer Storefront Preview
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This preview updates in real-time as you type or change any settings above.
                </p>
              </div>
            </div>

            <div className="bg-gray-100 dark:bg-gray-950 p-4 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800">
              <div className="max-w-5xl mx-auto bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 sm:p-10 shadow-lg text-center">
                {/* Top Pill Badge */}
                {formData.badge && (
                  <div className="inline-block px-4 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">
                    {formData.badge}
                  </div>
                )}

                {/* Title */}
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tight mb-2">
                  {formData.title}
                </h2>

                {/* Subtitle */}
                {formData.subtitle && (
                  <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm font-medium max-w-2xl mx-auto leading-relaxed mb-8">
                    {formData.subtitle}
                  </p>
                )}

                {/* White Feature Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 text-left">
                  {formData.featureCards
                    .filter((c) => c.isActive !== false)
                    .map((card, idx) => {
                      const IconComp = ICON_MAP[card.icon] || FiShield;
                      const scheme = COLOR_SCHEMES.find((s) => s.key === card.colorScheme) || COLOR_SCHEMES[0];

                      return (
                        <div
                          key={card.id || idx}
                          className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 rounded-2xl p-4 flex items-start gap-3 hover:shadow-md transition-all"
                        >
                          <div className={`h-11 w-11 rounded-xl ${scheme.bgClass} flex items-center justify-center shrink-0`}>
                            <IconComp className="text-xl" />
                          </div>
                          <div>
                            <h3 className="text-xs sm:text-sm font-extrabold text-gray-900 dark:text-white leading-tight mb-1">
                              {card.title}
                            </h3>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
                              {card.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Black Stat Cards Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {formData.statCards
                    .filter((c) => c.isActive !== false)
                    .map((card, idx) => {
                      const IconComp = ICON_MAP[card.icon] || FiUsers;

                      return (
                        <div
                          key={card.id || idx}
                          className="bg-[#0f172a] rounded-2xl p-5 sm:p-6 flex flex-col items-center justify-center text-center shadow-lg border border-slate-800"
                        >
                          <IconComp className="text-amber-400 text-2xl mb-2" />
                          <span className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight mb-1">
                            {card.value}
                          </span>
                          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                            {card.label}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="sticky bottom-4 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-gray-200 dark:border-gray-800 p-4 rounded-2xl shadow-xl flex items-center justify-between gap-4">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {hasChanges ? 'You have unsaved changes.' : 'All changes are saved.'}
            </span>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData(savedData)}
                disabled={!hasChanges || isSaving}
                className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-40 transition-colors"
              >
                Reset Changes
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 active:bg-amber-700 rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <FiSave className="w-3.5 h-3.5" />
                    Save All Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};

export default TrustAssuranceManagement;
