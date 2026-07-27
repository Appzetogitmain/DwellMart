import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSearch, FiFilter, FiX, FiMic, FiGrid, FiList, FiShoppingBag } from 'react-icons/fi';
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
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import ProductGridSkeleton from '../../../shared/components/Skeletons/ProductGridSkeleton';

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
    "Load More"
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
  const [products, setProducts] = useState([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({
    category: searchParams.get('category') || '',
    vendor: searchParams.get('vendor') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minRating: searchParams.get('minRating') || '',
  });

  // Sync searchQuery with URL params
  useEffect(() => {
    const q = searchParams.get('q');
    setSearchQuery(q || '');
    setSortBy(searchParams.get('sort') || 'newest');

    setFilters({
      category: searchParams.get('category') || '',
      vendor: searchParams.get('vendor') || '',
      minPrice: searchParams.get('minPrice') || '',
      maxPrice: searchParams.get('maxPrice') || '',
      minRating: searchParams.get('minRating') || '',
    });
  }, [searchParams]);

  useEffect(() => {
    initializeCategories();
  }, [initializeCategories]);

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
    };

    recognition.onerror = () => {
      setIsListening(false);
      toast.error(t('Voice recognition error'));
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

  const buildQueryParams = useCallback(
    (pageNumber) => {
      const query = {
        page: pageNumber,
        limit: PAGE_SIZE,
        sort: sortBy || 'newest',
      };

      const q = String(searchParams.get('q') || '').trim();
      if (q) query.q = q;

      if (filters.category) query.category = normalizeId(filters.category);
      if (filters.vendor) query.vendor = normalizeId(filters.vendor);
      if (filters.minPrice) query.minPrice = filters.minPrice;
      if (filters.maxPrice) query.maxPrice = filters.maxPrice;
      if (filters.minRating) query.minRating = filters.minRating;

      return query;
    },
    [filters.category, filters.vendor, filters.minPrice, filters.maxPrice, sortBy, searchParams]
  );

  const fetchResults = useCallback(
    async ({ pageNumber = 1, append = false } = {}) => {
      const query = buildQueryParams(pageNumber);
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoadingResults(true);
      }

      try {
        const response = await api.get('/products', { params: query });
        const payload = response?.data ?? response;
        const list = Array.isArray(payload?.products)
          ? payload.products.map(normalizeProduct).filter((item) => item.id)
          : [];
        const page = Number(payload?.page || pageNumber || 1);
        const pages = Number(payload?.pages || 1);
        const total = Number(payload?.total || list.length || 0);

        const translatedProducts = await translateArray(list, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
        setProducts((prev) => (append ? [...prev, ...translatedProducts] : translatedProducts));
        setPagination({ page, pages, total });
      } catch {
        if (!append) {
          setProducts([]);
          setPagination({ page: 1, pages: 1, total: 0 });
        }
      } finally {
        if (append) {
          setIsLoadingMore(false);
        } else {
          setIsLoadingResults(false);
        }
      }
    },
    [buildQueryParams]
  );

  useEffect(() => {
    fetchResults({ pageNumber: 1, append: false });
  }, [fetchResults, searchParams, sortBy]);

  const filteredProducts = useMemo(() => products, [products]);

  const hasMore = pagination.page < pagination.pages;
  const loadMoreRef = useRef(null);

  const loadMore = useCallback(() => {
    if (isLoadingMore || isLoadingResults || !hasMore) return;
    fetchResults({ pageNumber: pagination.page + 1, append: true });
  }, [fetchResults, hasMore, isLoadingMore, isLoadingResults, pagination.page]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || isLoadingMore || isLoadingResults) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { root: null, rootMargin: '120px', threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [loadMore, hasMore, isLoadingMore, isLoadingResults]);

  const filterButtonRef = useRef(null);

  const handleFilterChange = (name, value) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    setFilters({ ...filters, [name]: normalizedValue });
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sortBy || 'newest');
    if (normalizedValue) {
      newParams.set(name, normalizedValue);
    } else {
      newParams.delete(name);
    }
    setSearchParams(newParams);
  };

  // Check if any filter is active
  const hasActiveFilters =
    filters.minPrice || filters.maxPrice || filters.minRating || filters.category || filters.vendor || searchQuery;

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
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setFilters({
      category: '',
      vendor: '',
      minPrice: '',
      maxPrice: '',
      minRating: '',
    });
    setSearchQuery('');
    setSortBy('newest');
    setSearchParams({ sort: 'newest' });
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full pb-24 lg:pb-12 max-w-7xl mx-auto min-h-screen bg-gray-50">
          {/* Search Header */}
          <div className="px-4 py-4 bg-white border-b border-gray-200 sticky top-1 z-30">
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
                  className="w-full pl-12 pr-20 py-3 glass-card rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-700 placeholder:text-gray-400 text-base"
                  autoFocus={!isShopPage}
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                  <motion.button
                    type="button"
                    onClick={handleVoiceSearch}
                    whileTap={{ scale: 0.9 }}
                    className={`p-2 rounded-lg transition-colors ${isListening
                      ? 'bg-red-100 text-red-600'
                      : 'hover:bg-gray-100 text-gray-400'
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
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
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
              <p className="text-sm text-gray-600">
                {t('Found')} {pagination.total} {t('product(s)')}
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="newest">{t('Newest')}</option>
                  <option value="oldest">{t('Oldest')}</option>
                  <option value="price-asc">{t('Price: Low to High')}</option>
                  <option value="price-desc">{t('Price: High to Low')}</option>
                  <option value="popular">{t('Popular')}</option>
                  <option value="rating">{t('Top Rated')}</option>
                </select>
                {/* View Toggle Buttons */}
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded transition-colors ${viewMode === 'list'
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-gray-600'
                      }`}
                  >
                    <FiList className="text-lg" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded transition-colors ${viewMode === 'grid'
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-gray-600'
                      }`}
                  >
                    <FiGrid className="text-lg" />
                  </button>
                </div>
                <div ref={filterButtonRef} className="relative">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-4 py-2 glass-card rounded-xl hover:bg-white/80 transition-colors ${showFilters ? "bg-white/80" : ""
                      }`}
                  >
                    <FiFilter
                      className={`text-lg transition-colors ${hasActiveFilters ? "text-blue-600" : "text-gray-600"
                        }`}
                    />
                    <span className="font-semibold text-gray-700 text-sm">{t('Filters')}</span>
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
                          className="filter-dropdown absolute right-0 top-full w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 z-[10001] overflow-hidden"
                          style={{ marginTop: "10px" }}>
                          {/* Header */}
                          <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 bg-gray-50">
                            <div className="flex items-center gap-1.5">
                              <FiFilter className="text-sm text-gray-700" />
                              <h3 className="text-sm font-bold text-gray-800">
                                {t('Filters')}
                              </h3>
                            </div>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="p-0.5 hover:bg-gray-200 rounded-full transition-colors">
                              <FiX className="text-sm text-gray-600" />
                            </button>
                          </div>

                          {/* Filter Content */}
                          <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                            <div className="p-2 space-y-2">
                              {/* Category Filter */}
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">
                                  {t('Category')}
                                </h4>
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowCategoryDropdown(!showCategoryDropdown);
                                      setShowVendorDropdown(false);
                                    }}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm flex items-center justify-between text-gray-700"
                                  >
                                    <span>{filters.category ? categories.find(c => normalizeId(c.id) === normalizeId(filters.category))?.name : t("All Categories")}</span>
                                    <motion.div
                                      animate={{ rotate: showCategoryDropdown ? 180 : 0 }}
                                      transition={{ duration: 0.2 }}
                                    >
                                      <FiFilter className="text-gray-400 text-xs" />
                                    </motion.div>
                                  </button>

                                  <AnimatePresence>
                                    {showCategoryDropdown && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="mt-1 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden"
                                      >
                                        <div
                                          onClick={() => {
                                            handleFilterChange("category", "");
                                            setShowCategoryDropdown(false);
                                          }}
                                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-white transition-colors ${!filters.category ? "bg-white text-primary-700 font-bold" : "text-gray-600"}`}
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
                                            className={`px-3 py-2 text-sm cursor-pointer hover:bg-white transition-colors ${normalizeId(filters.category) === normalizeId(cat.id) ? "bg-white text-primary-700 font-bold" : "text-gray-600"}`}
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
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">
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
                                    className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 text-xs"
                                  />
                                  <input
                                    type="number"
                                    placeholder={t("Max Price")}
                                    value={filters.maxPrice}
                                    onChange={(e) =>
                                      handleFilterChange("maxPrice", e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 text-xs"
                                  />
                                </div>
                              </div>

                              {/* Vendor Filter */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                                    <FiShoppingBag className="text-primary-600" />
                                    {t('Vendor')}
                                  </h4>
                                  <span className="text-xs text-primary-600 font-semibold bg-primary-50 px-2 py-0.5 rounded-full">
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
                                    className="w-full px-3 py-2.5 rounded-xl border-2 border-primary-100 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-bold flex items-center justify-between text-gray-800 shadow-sm"
                                  >
                                    <span className="truncate pr-2">
                                      {filters.vendor ? approvedVendors.find(v => normalizeId(v.id) === normalizeId(filters.vendor))?.storeName || approvedVendors.find(v => normalizeId(v.id) === normalizeId(filters.vendor))?.name : t("All Vendors")}
                                    </span>
                                    <motion.div
                                      animate={{ rotate: showVendorDropdown ? 180 : 0 }}
                                      transition={{ duration: 0.2 }}
                                    >
                                      <FiFilter className="text-primary-500" />
                                    </motion.div>
                                  </button>

                                  <AnimatePresence>
                                    {showVendorDropdown && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="mt-2 bg-gray-50 border border-primary-50 rounded-2xl overflow-hidden"
                                      >
                                        <div
                                          onClick={() => {
                                            handleFilterChange("vendor", "");
                                            setShowVendorDropdown(false);
                                          }}
                                          className={`p-3 text-sm cursor-pointer hover:bg-white transition-colors border-b border-gray-100 flex items-center justify-between ${!filters.vendor ? "bg-white text-primary-700 font-bold" : "text-gray-600"}`}
                                        >
                                          <span>{t('All Vendors')}</span>
                                          {!filters.vendor && <FiFilter className="text-primary-500" />}
                                        </div>
                                        {approvedVendors.map((vendor) => (
                                          <div
                                            key={vendor.id}
                                            onClick={() => {
                                              handleFilterChange("vendor", normalizeId(vendor.id));
                                              setShowVendorDropdown(false);
                                            }}
                                            className={`p-3 text-sm cursor-pointer hover:bg-white transition-colors border-b last:border-0 border-gray-100 flex items-center justify-between ${normalizeId(filters.vendor) === normalizeId(vendor.id) ? "bg-white text-primary-700 font-bold" : "text-gray-600"}`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <span>{vendor.storeName || vendor.name}</span>
                                              {vendor.isVerified && <span className="text-blue-500 text-xs">✓</span>}
                                            </div>
                                            {normalizeId(filters.vendor) === normalizeId(vendor.id) && <FiFilter className="text-primary-500" />}
                                          </div>
                                        ))}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>

                              {/* Rating Filter */}
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">
                                  {t('Minimum Rating')}
                                </h4>
                                <div className="space-y-0.5">
                                  {[4, 3, 2, 1].map((rating) => (
                                    <label
                                      key={rating}
                                      className="flex items-center gap-1.5 cursor-pointer p-1 rounded-md hover:bg-gray-50 transition-colors">
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
                                        className="w-3 h-3 appearance-none rounded-full border-2 border-gray-300 bg-white checked:bg-white checked:border-primary-500 relative cursor-pointer"
                                        style={{
                                          backgroundImage:
                                            filters.minRating === rating.toString()
                                              ? "radial-gradient(circle, #10b981 40%, transparent 40%)"
                                              : "none",
                                        }}
                                      />
                                      <span className="text-xs text-gray-700">
                                        {rating}+ {t('Stars')}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="border-t border-gray-200 p-2 bg-gray-50 space-y-1.5">
                            <button
                              onClick={clearFilters}
                              className="w-full py-1.5 bg-gray-200 text-gray-700 rounded-md font-semibold text-xs hover:bg-gray-300 transition-colors">
                              {t('Clear All')}
                            </button>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="w-full py-1.5 gradient-green text-white rounded-md font-semibold text-xs hover:shadow-glow-green transition-all">
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
            {isLoadingResults ? (
              <ProductGridSkeleton count={12} columns={viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7' : 'grid-cols-1'} />
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <FiSearch className="text-6xl text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-800 mb-2">{t('No products found')}</h3>
                <p className="text-gray-600 mb-6">{t('Try adjusting your search or filters')}</p>
                <button
                  onClick={clearFilters}
                  className="gradient-green text-white px-6 py-3 rounded-xl font-semibold"
                >
                  {t('Clear Filters')}
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 md:gap-4 lg:gap-6">
                  {filteredProducts.map((product, index) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <ProductCard product={product} />
                    </motion.div>
                  ))}
                </div>

                {hasMore && (
                  <div ref={loadMoreRef} className="mt-6 flex flex-col items-center gap-4">
                    {isLoadingMore && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full"
                        />
                        <span className="text-sm">{t('Loading more products...')}</span>
                      </div>
                    )}
                    <button
                      onClick={loadMore}
                      disabled={isLoadingMore}
                      className="px-6 py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoadingMore ? (
                        <span className="flex items-center gap-2">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                          />
                          {t('Loading...')}
                        </span>
                      ) : t('Load More')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-3">
                  {filteredProducts.map((product, index) => (
                    <ProductListItem
                      key={product.id}
                      product={product}
                      index={index}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div ref={loadMoreRef} className="mt-6 flex flex-col items-center gap-4">
                    {isLoadingMore && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full"
                        />
                        <span className="text-sm">{t('Loading more products...')}</span>
                      </div>
                    )}
                    <button
                      onClick={loadMore}
                      disabled={isLoadingMore}
                      className="px-6 py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoadingMore ? (
                        <span className="flex items-center gap-2">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                          />
                          {t('Loading...')}
                        </span>
                      ) : (
                        t('Load More')
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileSearch;

