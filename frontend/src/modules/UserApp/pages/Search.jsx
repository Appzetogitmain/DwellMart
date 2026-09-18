import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { FiSearch, FiFilter, FiX, FiMic, FiGrid, FiList, FiShoppingBag, FiChevronLeft, FiChevronRight, FiRefreshCw, FiGlobe, FiZap, FiBox } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from '../../../shared/components/ProductCard';
import ProductListItem from '../components/Mobile/ProductListItem';
import SearchSuggestions from '../components/Mobile/SearchSuggestions';
import { categories as fallbackCategories } from '../../../data/categories';
import PageTransition from '../../../shared/components/PageTransition';
import { useCategoryStore } from '../../../shared/store/categoryStore';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import { useSettingsStore } from '../../../shared/store/settingsStore';
import { useExperienceStore } from '../../../shared/store/experienceStore';
import { EXPERIENCES, getLocationQueryParams } from '../../../shared/utils/experience';
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import ProductGrid from '../../../shared/components/ProductGrid';
import { Input, Drawer, Chip, Button, Select, SkeletonLoader } from '../../../shared/components/ui';
import useInfiniteProducts from '../../../hooks/useInfiniteProducts';
import FacetedFilterSidebar from '../components/Filters/FacetedFilterSidebar';

const normalizeId = (value) => String(value ?? '').trim();

const PAGE_SIZE = 20;

const normalizeProduct = (raw) => {
  const vendorObj =
    raw?.vendor && typeof raw.vendor === 'object'
      ? raw.vendor
      : raw?.vendorId && typeof raw.vendorId === 'object'
        ? raw.vendorId
        : null;
  const brandObj =
    raw?.brand && typeof raw.brand === 'object'
      ? raw.brand
      : raw?.brandId && typeof raw.brandId === 'object'
        ? raw.brandId
        : null;
  const categoryObj =
    raw?.category && typeof raw.category === 'object'
      ? raw.category
      : raw?.categoryId && typeof raw.categoryId === 'object'
        ? raw.categoryId
        : null;

  const id = normalizeId(raw?.id || raw?._id);

  return {
    ...raw,
    id,
    _id: id,
    vendorId: normalizeId(vendorObj?._id || vendorObj?.id || raw?.vendorId),
    vendorName: raw?.vendorName || vendorObj?.storeName || vendorObj?.name || '',
    brandId: normalizeId(brandObj?._id || brandObj?.id || raw?.brandId),
    brandName: raw?.brandName || brandObj?.name || '',
    categoryId: normalizeId(categoryObj?._id || categoryObj?.id || raw?.categoryId),
    categoryName: raw?.categoryName || categoryObj?.name || '',
    image: raw?.image || raw?.images?.[0] || '',
    images: Array.isArray(raw?.images) ? raw.images : raw?.image ? [raw.image] : [],
    price: Number(raw?.price) || 0,
    rating: Number(raw?.rating) || 0,
  };
};

const MobileSearch = ({ isShopPage = false }) => {
  const { getTranslatedText: t } = usePageTranslation([
    "Search in shop...",
    "Search products...",
    "Found",
    "product(s)",
    "Newest",
    "Oldest",
    "Price: Low to High",
    "Price: High to Low",
    "Popular",
    "Top Rated",
    "Filters",
    "Category",
    "All Categories",
    "Price Range",
    "Min Price",
    "Max Price",
    "Vendor",
    "All Vendors",
    "Minimum Rating",
    "Stars",
    "Clear All",
    "Apply Filters",
    "Loading products...",
    "No products found",
    "Try adjusting your search or filters",
    "Clear Filters",
    "Voice search is not supported in your browser",
    "Voice recognition error",
    "Loading more products...",
    "Show results for",
    "Stores",
    "Loading...",
    "Showing",
    "to",
    "of",
    "products",
    "Previous",
    "Next",
    "All Products",
    "Marketplace",
    "Dwell Mart Express (10-30 Mins)",
    "No Dwell Mart Express Items Found",
    "Dwell Mart Express is expanding to your location soon. In the meantime, explore all standard delivery items in our Marketplace catalog!",
    "Show All Products"
  ]);

  const { translateObject, translateArray } = useDynamicTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories: storeCategories, initialize: initializeCategories } = useCategoryStore();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest');
  const [recentSearches, setRecentSearches] = useState(() => {
    const stored = localStorage.getItem('recentSearches');
    return stored ? JSON.parse(stored) : [];
  });
  const [approvedVendors, setApprovedVendors] = useState([]);
  const { settings, initialize: initializeSettings } = useSettingsStore();
  const { experience, setExperience, location: customerLocation } = useExperienceStore();
  const isQuickCommerce = experience === EXPERIENCES.QUICK_COMMERCE;
  const wholesaleMarketplaceEnabled =
    settings?.features?.wholesaleMarketplaceEnabled === true;

  const initialDeliveryMode = useMemo(() => {
    const urlDelivery = searchParams.get('delivery');
    if (urlDelivery && ['all', 'marketplace', 'express', 'wholesale'].includes(urlDelivery)) {
      return urlDelivery;
    }
    if (searchParams.get('experience') === EXPERIENCES.QUICK_COMMERCE) {
      return 'express';
    }
    if (searchParams.get('experience') === EXPERIENCES.WHOLESALE || experience === EXPERIENCES.WHOLESALE) {
      return 'wholesale';
    }
    return 'all';
  }, [searchParams, experience]);

  const [deliveryMode, setDeliveryMode] = useState(initialDeliveryMode);

  // Keep deliveryMode synchronized with URL and experience store
  useEffect(() => {
    const urlDelivery = searchParams.get('delivery');
    const urlExp = searchParams.get('experience');
    if (urlDelivery && ['all', 'marketplace', 'express', 'wholesale'].includes(urlDelivery)) {
      setDeliveryMode(urlDelivery);
    } else if (urlExp === EXPERIENCES.QUICK_COMMERCE) {
      setDeliveryMode('express');
    } else if (urlExp === EXPERIENCES.WHOLESALE) {
      setDeliveryMode('wholesale');
    } else if (!urlDelivery && experience === EXPERIENCES.WHOLESALE) {
      setDeliveryMode('wholesale');
    } else if (!urlDelivery) {
      setDeliveryMode('all');
    }
  }, [searchParams, experience]);

  const handleDeliveryModeChange = useCallback((mode) => {
    setDeliveryMode(mode);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('delivery', mode);
    newParams.delete('page');
    setSearchParams(newParams);

    if (mode === 'express') {
      setExperience(EXPERIENCES.QUICK_COMMERCE);
    } else if (mode === 'wholesale') {
      setExperience(EXPERIENCES.WHOLESALE);
    } else {
      setExperience(EXPERIENCES.MARKETPLACE);
    }
  }, [searchParams, setSearchParams, setExperience]);

  const [filters, setFilters] = useState({
    category: searchParams.get('category') || '',
    vendor: searchParams.get('vendor') || '',
    brand: searchParams.get('brand') || '',
    gender: searchParams.get('gender') || '',
    size: searchParams.get('size') || '',
    color: searchParams.get('color') || '',
    packSize: searchParams.get('packSize') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minRating: searchParams.get('minRating') || '',
    minDiscount: searchParams.get('minDiscount') || '',
    inStock: searchParams.get('inStock') || '',
    sellingChannel: searchParams.get('sellingChannel') || '',
    bulkDiscount: searchParams.get('bulkDiscount') === 'true',
    hasMoq: searchParams.get('hasMoq') === 'true',
    minMoq: searchParams.get('minMoq') || '',
    maxMoq: searchParams.get('maxMoq') || '',
  });

  const [facets, setFacets] = useState(null);
  const [loadingFacets, setLoadingFacets] = useState(false);

  // Sync searchQuery with URL params
  useEffect(() => {
    const q = searchParams.get('q') || '';
    const s = searchParams.get('sort') || 'newest';
    const newFilters = {
      category: searchParams.get('category') || '',
      vendor: searchParams.get('vendor') || '',
      brand: searchParams.get('brand') || '',
      gender: searchParams.get('gender') || '',
      size: searchParams.get('size') || '',
      color: searchParams.get('color') || '',
      packSize: searchParams.get('packSize') || '',
      minPrice: searchParams.get('minPrice') || '',
      maxPrice: searchParams.get('maxPrice') || '',
      minRating: searchParams.get('minRating') || '',
      minDiscount: searchParams.get('minDiscount') || '',
      inStock: searchParams.get('inStock') || '',
      sellingChannel: searchParams.get('sellingChannel') || '',
      bulkDiscount: searchParams.get('bulkDiscount') === 'true',
      hasMoq: searchParams.get('hasMoq') === 'true',
      minMoq: searchParams.get('minMoq') || '',
      maxMoq: searchParams.get('maxMoq') || '',
    };

    setSearchQuery((prev) => (prev !== q ? q : prev));
    setSortBy((prev) => (prev !== s ? s : prev));
    setFilters((prev) => {
      const isSame =
        prev.category === newFilters.category &&
        prev.vendor === newFilters.vendor &&
        prev.brand === newFilters.brand &&
        prev.gender === newFilters.gender &&
        prev.size === newFilters.size &&
        prev.color === newFilters.color &&
        prev.packSize === newFilters.packSize &&
        prev.minPrice === newFilters.minPrice &&
        prev.maxPrice === newFilters.maxPrice &&
        prev.minRating === newFilters.minRating &&
        prev.minDiscount === newFilters.minDiscount &&
        prev.inStock === newFilters.inStock &&
        prev.sellingChannel === newFilters.sellingChannel &&
        prev.bulkDiscount === newFilters.bulkDiscount &&
        prev.hasMoq === newFilters.hasMoq &&
        prev.minMoq === newFilters.minMoq &&
        prev.maxMoq === newFilters.maxMoq;
      return isSame ? prev : newFilters;
    });
  }, [searchParams]);

  useEffect(() => {
    initializeCategories();
    initializeSettings();
  }, [initializeCategories, initializeSettings]);

  useEffect(() => {
    let cancelled = false;
    const fetchVendors = async () => {
      try {
        const response = await api.get('/vendors/all', {
          params: { status: 'approved', page: 1, limit: 200 },
        });
        const payload = response?.data ?? response;
        const vendors = Array.isArray(payload?.vendors) ? payload.vendors : [];
        if (cancelled) return;
        const translatedVendors = await translateArray(vendors, ['storeName', 'name', 'storeDescription']);
        setApprovedVendors(translatedVendors);
      } catch {
        if (!cancelled) {
          setApprovedVendors([]);
        }
      }
    };

    fetchVendors();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recentSearches');
    if (stored) {
      setRecentSearches(JSON.parse(stored));
    }
  }, []);

  // Save recent searches to localStorage
  const saveRecentSearch = (query) => {
    if (!query.trim()) return;
    const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  const deleteRecentSearch = (index) => {
    const updated = recentSearches.filter((_, i) => i !== index);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  const handleVoiceSearch = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error(t('Voice search is not supported in your browser'));
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      setShowSuggestions(false);
      setIsListening(false);
      saveRecentSearch(transcript);
      // ── Trigger the actual search by updating URL params ──
      const newParams = new URLSearchParams(searchParams);
      newParams.set('sort', sortBy || 'newest');
      newParams.delete('page');
      if (transcript.trim()) {
        newParams.set('q', transcript.trim());
      } else {
        newParams.delete('q');
      }
      setSearchParams(newParams);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      // Show specific, actionable error messages
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        toast.error('Microphone access denied. Please allow microphone permission in your browser settings.');
      } else if (event.error === 'no-speech') {
        toast.error('No speech detected. Please try again and speak clearly.');
      } else if (event.error === 'network') {
        toast.error('Voice search requires an internet connection. Please check your connection.');
      } else if (event.error === 'aborted') {
        // User cancelled — no toast needed
      } else {
        toast.error(t('Voice recognition error') + ': ' + (event.error || 'unknown'));
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const categories = useMemo(() => {
    const activeStoreCategories = storeCategories.filter((cat) => cat.isActive !== false);
    if (activeStoreCategories.length) {
      return activeStoreCategories;
    }
    return fallbackCategories;
  }, [storeCategories]);

  // Construct query parameters for the generic infinite products hook
  const queryParams = useMemo(() => {
    const query = {
      sort: sortBy || 'newest',
    };

    const q = String(searchParams.get('q') || '').trim();
    if (q) query.q = q;

    if (filters.category) query.category = normalizeId(filters.category);
    if (filters.vendor) query.vendor = normalizeId(filters.vendor);
    if (filters.brand) query.brand = filters.brand;
    if (filters.gender) query.gender = filters.gender;
    if (filters.size) query.size = filters.size;
    if (filters.color) query.color = filters.color;
    if (filters.packSize) query.packSize = filters.packSize;
    if (filters.minPrice) query.minPrice = filters.minPrice;
    if (filters.maxPrice) query.maxPrice = filters.maxPrice;
    if (filters.minRating) query.minRating = filters.minRating;
    if (filters.minDiscount) query.minDiscount = filters.minDiscount;
    if (filters.inStock) query.inStock = filters.inStock;
    if (filters.sellingChannel) query.sellingChannel = filters.sellingChannel;
    if (filters.bulkDiscount) query.bulkDiscount = 'true';
    if (filters.hasMoq) query.hasMoq = 'true';
    if (filters.minMoq) query.minMoq = filters.minMoq;
    if (filters.maxMoq) query.maxMoq = filters.maxMoq;

    if (deliveryMode === 'wholesale' || experience === EXPERIENCES.WHOLESALE) {
      query.delivery = 'wholesale';
      query.experience = 'wholesale';
    } else if (deliveryMode === 'express') {
      query.delivery = 'express';
      query.experience = 'quick_commerce';
      Object.assign(query, getLocationQueryParams(customerLocation));
    } else if (deliveryMode === 'marketplace') {
      query.delivery = 'standard';
      query.experience = 'marketplace';
    } else {
      query.delivery = 'all';
      query.experience = 'marketplace';
    }

    return query;
  }, [
    sortBy,
    searchParams,
    filters.category,
    filters.vendor,
    filters.brand,
    filters.gender,
    filters.size,
    filters.color,
    filters.packSize,
    filters.minPrice,
    filters.maxPrice,
    filters.minRating,
    filters.minDiscount,
    filters.inStock,
    filters.sellingChannel,
    filters.bulkDiscount,
    filters.hasMoq,
    filters.minMoq,
    filters.maxMoq,
    deliveryMode,
    customerLocation,
    experience,
  ]);

  // Dynamic Facets Fetcher
  useEffect(() => {
    let cancelled = false;
    const fetchFacets = async () => {
      setLoadingFacets(true);
      try {
        const params = {
          category: searchParams.get('category') || undefined,
          search: searchParams.get('q') || undefined,
          experience: queryParams.experience,
          delivery: queryParams.delivery,
          sellingChannel: searchParams.get('sellingChannel') || undefined,
        };
        const res = await api.get('/products/facets', { params });
        const data = res?.data?.data || res?.data;
        if (!cancelled && data) {
          setFacets(data);
        }
      } catch (err) {
        console.error('Failed to fetch product facets:', err);
      } finally {
        if (!cancelled) setLoadingFacets(false);
      }
    };

    fetchFacets();
    return () => {
      cancelled = true;
    };
  }, [
    searchParams.get('category'),
    searchParams.get('q'),
    searchParams.get('sellingChannel'),
    queryParams.experience,
    queryParams.delivery,
  ]);

  const {
    products,
    total,
    hasMore,
    isLoadingInitial,
    isLoadingMore,
    isError,
    fetchNextPage,
    retry,
  } = useInfiniteProducts(queryParams, 20);

  const sentinelRef = useRef(null);

  // Preloading IntersectionObserver (400px threshold before page bottom)
  useEffect(() => {
    if (!hasMore || isLoadingInitial || isLoadingMore) return;
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px 0px' }
    );

    observer.observe(target);

    return () => {
      observer.unobserve(target);
      observer.disconnect();
    };
  }, [hasMore, isLoadingInitial, isLoadingMore, fetchNextPage]);

  const filteredProducts = useMemo(() => products, [products]);

  const filterButtonRef = useRef(null);

  const [draftMinPrice, setDraftMinPrice] = useState(searchParams.get('minPrice') || '');
  const [draftMaxPrice, setDraftMaxPrice] = useState(searchParams.get('maxPrice') || '');

  // Keep draft prices synchronized with searchParams
  useEffect(() => {
    setDraftMinPrice(searchParams.get('minPrice') || '');
    setDraftMaxPrice(searchParams.get('maxPrice') || '');
  }, [searchParams]);

  const applyFilters = useCallback(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sortBy || 'newest');
    newParams.delete('page');

    const minTrimmed = String(draftMinPrice || '').trim();
    const maxTrimmed = String(draftMaxPrice || '').trim();

    if (minTrimmed) {
      newParams.set('minPrice', minTrimmed);
    } else {
      newParams.delete('minPrice');
    }

    if (maxTrimmed) {
      newParams.set('maxPrice', maxTrimmed);
    } else {
      newParams.delete('maxPrice');
    }

    setFilters((prev) => ({
      ...prev,
      minPrice: minTrimmed,
      maxPrice: maxTrimmed,
    }));
    setSearchParams(newParams);
    setShowFilters(false);
  }, [searchParams, sortBy, draftMinPrice, draftMaxPrice, setSearchParams]);

  const handleFilterChange = useCallback((name, value) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    setFilters((prev) => ({ ...prev, [name]: normalizedValue }));
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sortBy || 'newest');
    newParams.delete('page');
    if (normalizedValue !== undefined && normalizedValue !== null && normalizedValue !== '' && normalizedValue !== false) {
      newParams.set(name, String(normalizedValue));
    } else {
      newParams.delete(name);
    }
    setSearchParams(newParams);
  }, [searchParams, sortBy, setSearchParams]);

  const handleToggleArrayFilter = useCallback((name, value) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('page');
    newParams.set('sort', sortBy || 'newest');
    const currentStr = searchParams.get(name) || '';
    const currentArr = currentStr ? currentStr.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const exists = currentArr.includes(value);
    const updatedArr = exists ? currentArr.filter((item) => item !== value) : [...currentArr, value];
    if (updatedArr.length > 0) {
      newParams.set(name, updatedArr.join(','));
    } else {
      newParams.delete(name);
    }
    setSearchParams(newParams);
  }, [searchParams, sortBy, setSearchParams]);

  // Toggle a boolean wholesale facet in the URL (single source of truth).
  const toggleBooleanFilter = (name) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('page');
    if (searchParams.get(name) === 'true') {
      newParams.delete(name);
    } else {
      newParams.set(name, 'true');
    }
    setSearchParams(newParams);
  };

  const setChannelFilter = (channel) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('page');
    if (!channel || searchParams.get('sellingChannel') === channel) {
      newParams.delete('sellingChannel');
    } else {
      newParams.set('sellingChannel', channel);
    }
    setSearchParams(newParams);
  };

  // Check if any filter is active
  const hasActiveFilters = Boolean(
    filters.minPrice ||
    filters.maxPrice ||
    filters.minRating ||
    filters.minDiscount ||
    filters.inStock ||
    filters.category ||
    filters.vendor ||
    filters.brand ||
    filters.gender ||
    filters.size ||
    filters.color ||
    filters.packSize ||
    filters.sellingChannel ||
    filters.bulkDiscount ||
    filters.hasMoq ||
    filters.minMoq ||
    filters.maxMoq ||
    searchQuery
  );

  // Close desktop filter popover when clicking outside
  useEffect(() => {
    if (!showFilters) return;

    const handleClickOutside = (event) => {
      if (
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target) &&
        !event.target.closest('.filter-dropdown')
      ) {
        setShowFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilters]);

  const handleSearch = (e) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sortBy || 'newest');
    newParams.delete('page');
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      newParams.set('q', trimmedQuery);
      saveRecentSearch(trimmedQuery);
    } else {
      newParams.delete('q');
    }
    setSearchParams(newParams);
    setShowSuggestions(false);
  };

  const handleSuggestionSelect = (query) => {
    const normalizedQuery = String(query || '').trim();
    setSearchQuery(normalizedQuery);
    setShowSuggestions(false);
    saveRecentSearch(normalizedQuery);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sortBy || 'newest');
    newParams.delete('page');
    if (normalizedQuery) {
      newParams.set('q', normalizedQuery);
    } else {
      newParams.delete('q');
    }
    setSearchParams(newParams);
  };

  const handleSortChange = (value) => {
    const nextSort = String(value || 'newest');
    setSortBy(nextSort);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', nextSort);
    newParams.delete('page');
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setDraftMinPrice('');
    setDraftMaxPrice('');
    setFilters({
      category: '',
      vendor: '',
      brand: '',
      gender: '',
      size: '',
      color: '',
      packSize: '',
      minPrice: '',
      maxPrice: '',
      minRating: '',
      minDiscount: '',
      inStock: '',
      sellingChannel: '',
      bulkDiscount: false,
      hasMoq: false,
      minMoq: '',
      maxMoq: '',
    });
    setSearchQuery('');
    setSortBy('newest');
    const resetParams = new URLSearchParams();
    resetParams.set('sort', 'newest');
    if (deliveryMode && deliveryMode !== 'all') resetParams.set('delivery', deliveryMode);
    if (experience && experience !== EXPERIENCES.MARKETPLACE) resetParams.set('experience', experience);
    setSearchParams(resetParams);
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full pb-24 lg:pb-12 max-w-7xl mx-auto min-h-screen bg-surface-muted">
          {/* Search Header */}
          <div className="px-4 py-4 bg-surface border-b border-border sticky top-1 z-30">
            <form onSubmit={handleSearch} className="mb-3 lg:hidden">
              <div className="relative">
                <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-xl z-10" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder={isShopPage ? t("Search in shop...") : t("Search products...")}
                  className="w-full pl-12 pr-20 py-3 glass-card rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary text-content placeholder:text-content-muted text-base"
                  autoFocus={!isShopPage}
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                  <motion.button
                    type="button"
                    onClick={handleVoiceSearch}
                    whileTap={{ scale: 0.9 }}
                    className={`p-2 rounded-lg transition-colors ${isListening
                      ? 'bg-status-errorBg text-status-error'
                      : 'hover:bg-surface-muted text-content-muted'
                      }`}
                  >
                    <motion.div
                      animate={isListening ? {
                        scale: [1, 1.2, 1],
                      } : {}}
                      transition={{ duration: 0.5, repeat: isListening ? Infinity : 0 }}
                    >
                      <FiMic className="text-lg" />
                    </motion.div>
                  </motion.button>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchParams({ sort: sortBy || 'newest' });
                        setShowSuggestions(false);
                      }}
                      className="p-2 hover:bg-surface-muted rounded-lg transition-colors text-content-muted"
                    >
                      <FiX className="text-lg" />
                    </button>
                  )}
                </div>
                <SearchSuggestions
                  query={searchQuery}
                  isOpen={showSuggestions}
                  onSelect={handleSuggestionSelect}
                  onClose={() => setShowSuggestions(false)}
                  recentSearches={recentSearches}
                  onDeleteRecent={deleteRecentSearch}
                  onClearRecent={clearRecentSearches}
                />
              </div>
            </form>

            {/* 4-Way Experience / Delivery Tabs */}
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide py-1 mb-3 select-none -mx-1 px-1">
              <button
                type="button"
                onClick={() => handleDeliveryModeChange('all')}
                className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  deliveryMode === 'all'
                    ? 'bg-[#ffc101] text-black shadow-sm ring-1 ring-[#ffc101]'
                    : 'bg-surface border border-border text-content-secondary hover:text-content hover:bg-surface-muted'
                }`}
              >
                <FiGlobe className="text-sm shrink-0" />
                <span>{t('All Products')}</span>
              </button>

              <button
                type="button"
                onClick={() => handleDeliveryModeChange('marketplace')}
                className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  deliveryMode === 'marketplace'
                    ? 'bg-[#ffc101] text-black shadow-sm ring-1 ring-[#ffc101]'
                    : 'bg-surface border border-border text-content-secondary hover:text-content hover:bg-surface-muted'
                }`}
              >
                <FiShoppingBag className="text-sm shrink-0" />
                <span>{t('Retail Store')}</span>
              </button>

              {wholesaleMarketplaceEnabled !== false && (
                <button
                  type="button"
                  onClick={() => handleDeliveryModeChange('wholesale')}
                  className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    deliveryMode === 'wholesale'
                      ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-600'
                      : 'bg-surface border border-border text-content-secondary hover:text-content hover:bg-surface-muted'
                  }`}
                >
                  <FiBox className="text-sm shrink-0" />
                  <span>{t('B2B Wholesale')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleDeliveryModeChange('express')}
                className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  deliveryMode === 'express'
                    ? 'bg-amber-500 text-black shadow-sm ring-1 ring-amber-500'
                    : 'bg-surface border border-border text-content-secondary hover:text-content hover:bg-surface-muted'
                }`}
              >
                <FiZap className="text-sm shrink-0" />
                <span>{t('Dwell Mart Express (10-30 Mins)')}</span>
              </button>
            </div>

            {/* Filter Toggle and View Mode */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm text-content-secondary font-medium truncate min-w-0">
                {t('Found')} {total} {t('product(s)')}
              </p>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="px-2 py-1.5 sm:px-2.5 sm:py-1.5 text-xs rounded-lg border border-border bg-surface text-content-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary max-w-[105px] sm:max-w-none truncate cursor-pointer"
                >
                  <option value="newest">{t('Newest')}</option>
                  <option value="oldest">{t('Oldest')}</option>
                  <option value="price-asc">{t('Price: Low to High')}</option>
                  <option value="price-desc">{t('Price: High to Low')}</option>
                  <option value="popular">{t('Popular')}</option>
                  <option value="rating">{t('Top Rated')}</option>
                </select>

                {/* View Toggle Buttons */}
                <div className="flex items-center bg-surface-muted rounded-lg p-0.5 sm:p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded transition-colors cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-surface text-brand-primary shadow-sm'
                        : 'text-content-secondary'
                    }`}
                    aria-label="List view"
                  >
                    <FiList className="text-base sm:text-lg" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded transition-colors cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-surface text-brand-primary shadow-sm'
                        : 'text-content-secondary'
                    }`}
                    aria-label="Grid view"
                  >
                    <FiGrid className="text-base sm:text-lg" />
                  </button>
                </div>

                <div ref={filterButtonRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowFilters((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                      showFilters || hasActiveFilters
                        ? "bg-brand-primary/10 border-brand-primary/40 text-brand-primary font-bold"
                        : "bg-surface border-border text-content-secondary hover:bg-surface-muted hover:text-content"
                    }`}
                  >
                    <FiFilter
                      className={`text-sm sm:text-base shrink-0 ${hasActiveFilters ? "text-brand-primary" : "text-content-secondary"}`}
                    />
                    <span className="font-semibold text-xs sm:text-sm">{t('Filters')}</span>
                    {hasActiveFilters && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0" />
                    )}
                  </button>

                  {/* Desktop Popover Filter Menu */}
                  <AnimatePresence>
                    {showFilters && (
                      <div className="hidden sm:block">
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          className="filter-dropdown absolute right-0 top-full mt-2 w-96 sm:w-[440px] max-w-[90vw] max-h-[82vh] bg-surface rounded-2xl shadow-2xl border border-border z-50 flex flex-col overflow-hidden"
                        >
                          <FacetedFilterSidebar
                            facets={facets}
                            loadingFacets={loadingFacets}
                            filters={filters}
                            categories={categories}
                            vendors={approvedVendors}
                            onFilterChange={handleFilterChange}
                            onToggleArrayFilter={handleToggleArrayFilter}
                            onClearFilters={clearFilters}
                            experience={queryParams.experience}
                            wholesaleMarketplaceEnabled={wholesaleMarketplaceEnabled}
                            isMobile={false}
                            onClose={() => setShowFilters(false)}
                          />
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Quick Active Filter Pills on Page Header */}
            {hasActiveFilters && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pt-2 mt-1 border-t border-border/40 text-xs">
                <span className="text-[11px] font-bold text-content-secondary uppercase tracking-wider shrink-0 mr-1">
                  {t('Active:')}
                </span>
                {filters.gender && filters.gender.split(',').map((g) => (
                  <span key={g} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 font-semibold shrink-0">
                    <span>{facets?.genders?.find((item) => item.id === g)?.label || g}</span>
                    <button type="button" onClick={() => handleToggleArrayFilter('gender', g)} className="hover:text-red-500 cursor-pointer">
                      <FiX className="text-xs" />
                    </button>
                  </span>
                ))}
                {filters.brand && filters.brand.split(',').map((bId) => {
                  const bObj = facets?.brands?.find((b) => b.id === bId || b._id === bId);
                  return (
                    <span key={bId} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 font-semibold shrink-0">
                      <span>{bObj?.name || bId}</span>
                      <button type="button" onClick={() => handleToggleArrayFilter('brand', bId)} className="hover:text-red-500 cursor-pointer">
                        <FiX className="text-xs" />
                      </button>
                    </span>
                  );
                })}
                {filters.size && filters.size.split(',').map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 font-semibold shrink-0">
                    <span>Size: {s}</span>
                    <button type="button" onClick={() => handleToggleArrayFilter('size', s)} className="hover:text-red-500 cursor-pointer">
                      <FiX className="text-xs" />
                    </button>
                  </span>
                ))}
                {filters.color && filters.color.split(',').map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 font-semibold shrink-0">
                    <span>Color: {c}</span>
                    <button type="button" onClick={() => handleToggleArrayFilter('color', c)} className="hover:text-red-500 cursor-pointer">
                      <FiX className="text-xs" />
                    </button>
                  </span>
                ))}
                {(filters.minPrice || filters.maxPrice) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 font-semibold shrink-0">
                    <span>{filters.minPrice ? `₹${filters.minPrice}` : '₹0'} - {filters.maxPrice ? `₹${filters.maxPrice}` : 'Above'}</span>
                    <button type="button" onClick={() => { handleFilterChange('minPrice', ''); handleFilterChange('maxPrice', ''); }} className="hover:text-red-500 cursor-pointer">
                      <FiX className="text-xs" />
                    </button>
                  </span>
                )}
                {filters.minDiscount && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 font-semibold shrink-0">
                    <span>{filters.minDiscount}%+ Off</span>
                    <button type="button" onClick={() => handleFilterChange('minDiscount', '')} className="hover:text-red-500 cursor-pointer">
                      <FiX className="text-xs" />
                    </button>
                  </span>
                )}
                {filters.inStock && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 font-semibold shrink-0">
                    <span>{t('In Stock')}</span>
                    <button type="button" onClick={() => handleFilterChange('inStock', '')} className="hover:text-red-500 cursor-pointer">
                      <FiX className="text-xs" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-bold text-red-500 hover:text-red-600 ml-1 underline cursor-pointer shrink-0"
                >
                  {t('Clear All')}
                </button>
              </div>
            )}
          </div>

          {/* Mobile Bottom Sheet Modal rendered in Portal */}
          {typeof document !== 'undefined' && createPortal(
            <AnimatePresence>
              {showFilters && (
                <div className="sm:hidden fixed inset-0 z-[100000] flex flex-col justify-end">
                  {/* Backdrop */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowFilters(false)}
                    className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                  />

                  {/* Bottom Sheet Card */}
                  <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 28, stiffness: 300 }}
                    className="filter-dropdown relative w-full max-h-[85vh] bg-surface rounded-t-3xl shadow-2xl border-t border-border flex flex-col overflow-hidden z-10"
                  >
                    <div className="w-12 h-1.5 bg-border rounded-full mx-auto my-2.5 shrink-0" />
                    <FacetedFilterSidebar
                      facets={facets}
                      loadingFacets={loadingFacets}
                      filters={filters}
                      categories={categories}
                      vendors={approvedVendors}
                      onFilterChange={handleFilterChange}
                      onToggleArrayFilter={handleToggleArrayFilter}
                      onClearFilters={clearFilters}
                      experience={queryParams.experience}
                      wholesaleMarketplaceEnabled={wholesaleMarketplaceEnabled}
                      isMobile={true}
                      onCloseMobile={() => setShowFilters(false)}
                      onClose={() => setShowFilters(false)}
                    />
                  </motion.div>
                </div>
              )}
            </AnimatePresence>,
            document.body
          )}

          {/* Products List */}
          <div className="px-3 py-4 md:px-4 lg:p-6">
            {deliveryMode === 'express' && filteredProducts.length === 0 && !isLoadingInitial ? (
              <div className="text-center py-10 px-4 my-6 bg-surface border border-amber-500/30 rounded-2xl max-w-lg mx-auto shadow-sm">
                <div className="w-14 h-14 mx-auto mb-3 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                  <FiZap className="text-2xl text-amber-500 fill-amber-500" />
                </div>
                <h3 className="text-base font-bold text-content mb-1.5">
                  {t('No Dwell Mart Express Items Found')}
                </h3>
                <p className="text-xs text-content-secondary mb-5 leading-relaxed">
                  {t('Dwell Mart Express is expanding to your location soon. In the meantime, explore all standard delivery items in our Marketplace catalog!')}
                </p>
                <button
                  type="button"
                  onClick={() => handleDeliveryModeChange('all')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary text-black text-xs font-extrabold shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                >
                  <FiGlobe className="text-sm" />
                  <span>{t('Show All Products')}</span>
                </button>
              </div>
            ) : viewMode === 'list' && filteredProducts.length > 0 && !isLoadingInitial ? (
              <div className="space-y-3">
                {filteredProducts.map((product, index) => (
                  <ProductListItem
                    key={product.id || product._id || index}
                    product={product}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <ProductGrid
                products={filteredProducts}
                loading={isLoadingInitial}
                skeletonCount={8}
                emptyTitle={t('No products found')}
                emptyDescription={t('Try adjusting your search or filters')}
              />
            )}

            {/* Sentinel Element for IntersectionObserver Preloading */}
            {hasMore && !isLoadingInitial && (
              <div
                ref={sentinelRef}
                className="h-10 w-full flex items-center justify-center my-2 pointer-events-none opacity-0"
                aria-hidden="true"
              />
            )}

            {/* Page 2+ Loading Skeletons */}
            {isLoadingMore && (
              <div className="mt-8 space-y-4" aria-live="polite" aria-label="Loading more products">
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-content-muted">
                  <FiRefreshCw className="animate-spin text-brand-primary text-sm" />
                  <span>{t('Loading more products...')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <SkeletonLoader.Card key={`infinite-skeleton-${idx}`} />
                  ))}
                </div>
              </div>
            )}

            {/* Page 2+ Error Retry Banner */}
            {isError && !isLoadingInitial && (
              <div className="mt-8 p-4 bg-surface rounded-2xl border border-red-200 text-center space-y-2 max-w-md mx-auto shadow-sm">
                <p className="text-xs sm:text-sm font-bold text-red-600">
                  {t("Couldn't load more products.")}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="px-4 py-2 bg-brand-primary text-black text-xs font-bold rounded-xl shadow-sm hover:bg-brand-primaryHover transition-all inline-flex items-center gap-1.5"
                >
                  <FiRefreshCw />
                  <span>{t('Retry')}</span>
                </button>
              </div>
            )}

            {/* End of Catalogue Indicator */}
            {!hasMore && !isLoadingInitial && products.length > 0 && (
              <div className="mt-12 py-8 border-t border-border text-center space-y-2" aria-live="polite">
                <div className="w-12 h-1 bg-brand-primary/40 mx-auto rounded-full mb-3" />
                <p className="text-sm font-extrabold text-content">
                  {t("You've reached the end")}
                </p>
                <p className="text-xs text-content-muted">
                  {t("No more products available")}
                </p>
              </div>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileSearch;

