import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSearch, FiFilter, FiX, FiMic, FiGrid, FiList, FiShoppingBag, FiChevronLeft, FiChevronRight, FiRefreshCw } from 'react-icons/fi';
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
    "Next"
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
  const { experience, location: customerLocation } = useExperienceStore();
  const isQuickCommerce = experience === EXPERIENCES.QUICK_COMMERCE;
  const wholesaleMarketplaceEnabled =
    settings?.features?.wholesaleMarketplaceEnabled === true;
  const [filters, setFilters] = useState({
    category: searchParams.get('category') || '',
    vendor: searchParams.get('vendor') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minRating: searchParams.get('minRating') || '',
    sellingChannel: searchParams.get('sellingChannel') || '',
    bulkDiscount: searchParams.get('bulkDiscount') === 'true',
    hasMoq: searchParams.get('hasMoq') === 'true',
  });

  // Sync searchQuery with URL params
  useEffect(() => {
    const q = searchParams.get('q') || '';
    const s = searchParams.get('sort') || 'newest';
    const newFilters = {
      category: searchParams.get('category') || '',
      vendor: searchParams.get('vendor') || '',
      minPrice: searchParams.get('minPrice') || '',
      maxPrice: searchParams.get('maxPrice') || '',
      minRating: searchParams.get('minRating') || '',
      sellingChannel: searchParams.get('sellingChannel') || '',
      bulkDiscount: searchParams.get('bulkDiscount') === 'true',
      hasMoq: searchParams.get('hasMoq') === 'true',
    };

    setSearchQuery((prev) => (prev !== q ? q : prev));
    setSortBy((prev) => (prev !== s ? s : prev));
    setFilters((prev) => {
      const isSame =
        prev.category === newFilters.category &&
        prev.vendor === newFilters.vendor &&
        prev.minPrice === newFilters.minPrice &&
        prev.maxPrice === newFilters.maxPrice &&
        prev.minRating === newFilters.minRating &&
        prev.sellingChannel === newFilters.sellingChannel &&
        prev.bulkDiscount === newFilters.bulkDiscount &&
        prev.hasMoq === newFilters.hasMoq;
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
    if (filters.minPrice) query.minPrice = filters.minPrice;
    if (filters.maxPrice) query.maxPrice = filters.maxPrice;
    if (filters.minRating) query.minRating = filters.minRating;
    if (filters.sellingChannel) query.sellingChannel = filters.sellingChannel;
    if (filters.bulkDiscount) query.bulkDiscount = 'true';
    if (filters.hasMoq) query.hasMoq = 'true';

    if (isQuickCommerce) {
      Object.assign(query, getLocationQueryParams(customerLocation));
    }

    return query;
  }, [
    sortBy,
    searchParams,
    filters.category,
    filters.vendor,
    filters.minPrice,
    filters.maxPrice,
    filters.minRating,
    filters.sellingChannel,
    filters.bulkDiscount,
    filters.hasMoq,
    isQuickCommerce,
    customerLocation,
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

  const handleFilterChange = (name, value) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    setFilters({ ...filters, [name]: normalizedValue });
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sortBy || 'newest');
    newParams.delete('page');
    if (normalizedValue) {
      newParams.set(name, normalizedValue);
    } else {
      newParams.delete(name);
    }
    setSearchParams(newParams);
  };

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
  const hasActiveFilters =
    filters.minPrice || filters.maxPrice || filters.minRating || filters.category || filters.vendor ||
    filters.sellingChannel || filters.bulkDiscount || filters.hasMoq || searchQuery;

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showFilters &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target) &&
        !event.target.closest(".filter-dropdown")
      ) {
        setShowFilters(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
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
    setFilters({
      category: '',
      vendor: '',
      minPrice: '',
      maxPrice: '',
      minRating: '',
      sellingChannel: '',
      bulkDiscount: false,
      hasMoq: false,
    });
    setSearchQuery('');
    setSortBy('newest');
    setSearchParams({ sort: 'newest' });
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

            {/* Filter Toggle and View Mode */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-content-secondary">
                {t('Found')} {total} {t('product(s)')}
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-border bg-surface text-content-secondary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                >
                  <option value="newest">{t('Newest')}</option>
                  <option value="oldest">{t('Oldest')}</option>
                  <option value="price-asc">{t('Price: Low to High')}</option>
                  <option value="price-desc">{t('Price: High to Low')}</option>
                  <option value="popular">{t('Popular')}</option>
                  <option value="rating">{t('Top Rated')}</option>
                </select>
                {/* View Toggle Buttons */}
                <div className="flex items-center bg-surface-muted rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded transition-colors ${viewMode === 'list'
                      ? 'bg-surface text-brand-primary shadow-sm'
                      : 'text-content-secondary'
                      }`}
                  >
                    <FiList className="text-lg" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded transition-colors ${viewMode === 'grid'
                      ? 'bg-surface text-brand-primary shadow-sm'
                      : 'text-content-secondary'
                      }`}
                  >
                    <FiGrid className="text-lg" />
                  </button>
                </div>
                <div ref={filterButtonRef} className="relative">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-4 py-2 glass-card rounded-xl hover:bg-surface/80 transition-colors ${showFilters ? "bg-surface/80" : ""
                      }`}
                  >
                    <FiFilter
                      className={`text-lg transition-colors ${hasActiveFilters ? "text-brand-primary" : "text-content-secondary"
                        }`}
                    />
                    <span className="font-semibold text-content-secondary text-sm">{t('Filters')}</span>
                  </button>

                  {/* Filter Dropdown */}
                  <AnimatePresence>
                    {showFilters && (
                      <>
                        {/* Backdrop */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setShowFilters(false)}
                          className="fixed inset-0 bg-black/20 z-[10000]"
                        />
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                          }}
                          className="filter-dropdown absolute right-0 top-full w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-surface rounded-2xl shadow-2xl border border-border z-[10001] overflow-hidden"
                          style={{ marginTop: "10px" }}>
                          {/* Header */}
                          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-surface-muted">
                            <div className="flex items-center gap-1.5">
                              <FiFilter className="text-sm text-content-secondary" />
                              <h3 className="text-sm font-bold text-content">
                                {t('Filters')}
                              </h3>
                            </div>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="p-0.5 hover:bg-border rounded-full transition-colors">
                              <FiX className="text-sm text-content-secondary" />
                            </button>
                          </div>

                          {/* Filter Content */}
                          <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                            <div className="p-2 space-y-2">
                              {/* Wholesale Filters — hidden unless the marketplace feature is on */}
                              {wholesaleMarketplaceEnabled && (
                                <div>
                                  <h4 className="font-semibold text-content-secondary mb-1 text-xs">
                                    {t('Selling Channel')}
                                  </h4>
                                  <div className="flex flex-wrap gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setChannelFilter('retail')}
                                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                        filters.sellingChannel === 'retail'
                                          ? 'bg-brand-primary text-content-inverse border-brand-primary'
                                          : 'bg-surface-muted text-content-secondary border-border hover:bg-surface'
                                      }`}
                                    >
                                      {t('Retail Only')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setChannelFilter('wholesale')}
                                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                        filters.sellingChannel === 'wholesale'
                                          ? 'bg-brand-primary text-content-inverse border-brand-primary'
                                          : 'bg-surface-muted text-content-secondary border-border hover:bg-surface'
                                      }`}
                                    >
                                      {t('Wholesale Available')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleBooleanFilter('bulkDiscount')}
                                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                        filters.bulkDiscount
                                          ? 'bg-brand-primary text-content-inverse border-brand-primary'
                                          : 'bg-surface-muted text-content-secondary border-border hover:bg-surface'
                                      }`}
                                    >
                                      {t('Bulk Discount')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleBooleanFilter('hasMoq')}
                                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                        filters.hasMoq
                                          ? 'bg-brand-primary text-content-inverse border-brand-primary'
                                          : 'bg-surface-muted text-content-secondary border-border hover:bg-surface'
                                      }`}
                                    >
                                      {t('MOQ Products')}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Category Filter */}
                              <div>
                                <h4 className="font-semibold text-content-secondary mb-1 text-xs">
                                  {t('Category')}
                                </h4>
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowCategoryDropdown(!showCategoryDropdown);
                                      setShowVendorDropdown(false);
                                    }}
                                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm flex items-center justify-between text-content-secondary"
                                  >
                                    <span>{filters.category ? categories.find(c => normalizeId(c.id) === normalizeId(filters.category))?.name : t("All Categories")}</span>
                                    <motion.div
                                      animate={{ rotate: showCategoryDropdown ? 180 : 0 }}
                                      transition={{ duration: 0.2 }}
                                    >
                                      <FiFilter className="text-content-muted text-xs" />
                                    </motion.div>
                                  </button>

                                  <AnimatePresence>
                                    {showCategoryDropdown && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="mt-1 bg-surface-muted rounded-xl border border-border-light overflow-hidden"
                                      >
                                        <div
                                          onClick={() => {
                                            handleFilterChange("category", "");
                                            setShowCategoryDropdown(false);
                                          }}
                                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-surface transition-colors ${!filters.category ? "bg-surface text-brand-primary font-bold" : "text-content-secondary"}`}
                                        >
                                          {t('All Categories')}
                                        </div>
                                        {categories.map((cat) => (
                                          <div
                                            key={cat.id}
                                            onClick={() => {
                                              handleFilterChange("category", normalizeId(cat.id));
                                              setShowCategoryDropdown(false);
                                            }}
                                            className={`px-3 py-2 text-sm cursor-pointer hover:bg-surface transition-colors ${normalizeId(filters.category) === normalizeId(cat.id) ? "bg-surface text-brand-primary font-bold" : "text-content-secondary"}`}
                                          >
                                            {cat.name}
                                          </div>
                                        ))}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>

                              {/* Price Range */}
                              <div>
                                <h4 className="font-semibold text-content-secondary mb-1 text-xs">
                                  {t('Price Range')}
                                </h4>
                                <div className="space-y-1.5">
                                  <input
                                    type="number"
                                    placeholder={t("Min Price")}
                                    value={filters.minPrice}
                                    onChange={(e) =>
                                      handleFilterChange("minPrice", e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 rounded-md border border-border bg-surface focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                                  />
                                  <input
                                    type="number"
                                    placeholder={t("Max Price")}
                                    value={filters.maxPrice}
                                    onChange={(e) =>
                                      handleFilterChange("maxPrice", e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 rounded-md border border-border bg-surface focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                                  />
                                </div>
                              </div>

                              {/* Vendor Filter */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-bold text-content text-sm flex items-center gap-1.5">
                                    <FiShoppingBag className="text-brand-primary" />
                                    {t('Vendor')}
                                  </h4>
                                  <span className="text-xs text-brand-primary font-semibold bg-surface-muted px-2 py-0.5 rounded-full border border-border">
                                    {approvedVendors.length}+ {t('Stores')}
                                  </span>
                                </div>
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowVendorDropdown(!showVendorDropdown);
                                      setShowCategoryDropdown(false);
                                    }}
                                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-brand-primary text-sm font-bold flex items-center justify-between text-content shadow-sm"
                                  >
                                    <span className="truncate pr-2">
                                      {filters.vendor ? approvedVendors.find(v => normalizeId(v.id) === normalizeId(filters.vendor))?.storeName || approvedVendors.find(v => normalizeId(v.id) === normalizeId(filters.vendor))?.name : t("All Vendors")}
                                    </span>
                                    <motion.div
                                      animate={{ rotate: showVendorDropdown ? 180 : 0 }}
                                      transition={{ duration: 0.2 }}
                                    >
                                      <FiFilter className="text-brand-primary" />
                                    </motion.div>
                                  </button>

                                  <AnimatePresence>
                                    {showVendorDropdown && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="mt-2 bg-surface-muted border border-border rounded-2xl overflow-hidden"
                                      >
                                        <div
                                          onClick={() => {
                                            handleFilterChange("vendor", "");
                                            setShowVendorDropdown(false);
                                          }}
                                          className={`p-3 text-sm cursor-pointer hover:bg-surface transition-colors border-b border-border-light flex items-center justify-between ${!filters.vendor ? "bg-surface text-brand-primary font-bold" : "text-content-secondary"}`}
                                        >
                                          <span>{t('All Vendors')}</span>
                                          {!filters.vendor && <FiFilter className="text-brand-primary" />}
                                        </div>
                                        {approvedVendors.map((vendor) => (
                                          <div
                                            key={vendor.id}
                                            onClick={() => {
                                              handleFilterChange("vendor", normalizeId(vendor.id));
                                              setShowVendorDropdown(false);
                                            }}
                                            className={`p-3 text-sm cursor-pointer hover:bg-surface transition-colors border-b last:border-0 border-border-light flex items-center justify-between ${normalizeId(filters.vendor) === normalizeId(vendor.id) ? "bg-surface text-brand-primary font-bold" : "text-content-secondary"}`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <span>{vendor.storeName || vendor.name}</span>
                                              {vendor.isVerified && <span className="text-status-info text-xs">✓</span>}
                                            </div>
                                            {normalizeId(filters.vendor) === normalizeId(vendor.id) && <FiFilter className="text-brand-primary" />}
                                          </div>
                                        ))}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>

                              {/* Rating Filter */}
                              <div>
                                <h4 className="font-semibold text-content-secondary mb-1 text-xs">
                                  {t('Minimum Rating')}
                                </h4>
                                <div className="space-y-0.5">
                                  {[4, 3, 2, 1].map((rating) => (
                                    <label
                                      key={rating}
                                      className="flex items-center gap-1.5 cursor-pointer p-1 rounded-md hover:bg-surface-muted transition-colors">
                                      <input
                                        type="radio"
                                        name="minRating"
                                        value={rating}
                                        checked={
                                          filters.minRating === rating.toString()
                                        }
                                        onChange={(e) =>
                                          handleFilterChange(
                                            "minRating",
                                            e.target.value
                                          )
                                        }
                                        className="w-3 h-3 appearance-none rounded-full border-2 border-border bg-surface checked:bg-surface checked:border-brand-primary relative cursor-pointer"
                                        style={{
                                          backgroundImage:
                                            filters.minRating === rating.toString()
                                              ? "radial-gradient(circle, var(--color-brand-primary) 40%, transparent 40%)"
                                              : "none",
                                        }}
                                      />
                                      <span className="text-xs text-content-secondary">
                                        {rating}+ {t('Stars')}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="border-t border-border p-2 bg-surface-muted space-y-1.5">
                            <button
                              onClick={clearFilters}
                              className="w-full py-1.5 bg-border text-content-secondary rounded-md font-semibold text-xs hover:bg-border-strong transition-colors">
                              {t('Clear All')}
                            </button>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="w-full py-1.5 bg-brand-primary text-black rounded-md font-semibold text-xs hover:bg-brand-primaryHover transition-all">
                              {t('Apply Filters')}
                            </button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* Products List */}
          <div className="px-3 py-4 md:px-4 lg:p-6">
            <ProductGrid
              products={filteredProducts}
              loading={isLoadingInitial}
              skeletonCount={8}
              emptyTitle={t('No products found')}
              emptyDescription={t('Try adjusting your search or filters')}
            />

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

