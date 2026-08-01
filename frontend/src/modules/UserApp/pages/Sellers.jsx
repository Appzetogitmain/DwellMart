import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiSliders, FiCheckCircle, FiStar, FiShoppingBag, FiX, FiRefreshCw, FiMapPin } from 'react-icons/fi';
import MobileLayout from '../components/Layout/MobileLayout';
import VendorShowcaseCard from '../components/Mobile/VendorShowcaseCard';
import Pagination from '../../../shared/components/ui/Pagination/Pagination';
import EmptyState from '../../../shared/components/ui/EmptyState/EmptyState';
import Button from '../../../shared/components/ui/Button/Button';
import PageTransition from '../../../shared/components/PageTransition';
import api from '../../../shared/utils/api';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import { getApprovedVendors } from '../data/catalogData';

const SORT_OPTIONS = [
  { value: 'best_selling', label: 'Best Selling' },
  { value: 'highest_rated', label: 'Highest Rated' },
  { value: 'most_products', label: 'Most Products' },
  { value: 'newest', label: 'Newest Sellers' },
  { value: 'a-z', label: 'Alphabetical (A-Z)' },
];

const MobileSellers = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "Best Sellers & Top Stores",
    "Discover verified marketplace sellers nationwide",
    "Search sellers...",
    "Sort By",
    "Filters",
    "Verified Only",
    "4+ Rating",
    "Has Products",
    "Clear Filters",
    "No sellers matched your search.",
    "Try changing your filters or search keywords.",
    "Loading sellers..."
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSort, setSelectedSort] = useState('best_selling');
  const [isVerifiedOnly, setIsVerifiedOnly] = useState(false);
  const [hasProductsOnly, setHasProductsOnly] = useState(false);
  const [minRatingFilter, setMinRatingFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);

  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    pages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch vendors from API
  const fetchVendors = useCallback(async (targetPage = 1) => {
    setIsLoading(true);
    try {
      const params = {
        page: targetPage,
        limit: 12,
        sort: selectedSort,
        status: 'approved',
      };

      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (isVerifiedOnly) params.isVerified = 'true';
      if (hasProductsOnly) params.hasProducts = 'true';
      if (minRatingFilter) params.minRating = minRatingFilter;
      if (cityFilter.trim()) params.city = cityFilter.trim();

      const response = await api.get('/vendors', { params });
      const payload = response?.data || response;
      const dataObj = payload?.data || payload;

      if (Array.isArray(dataObj?.vendors)) {
        setVendors(dataObj.vendors);
        setPagination({
          page: dataObj.pagination?.page || targetPage,
          limit: dataObj.pagination?.limit || 12,
          total: dataObj.pagination?.total || dataObj.vendors.length,
          pages: dataObj.pagination?.pages || Math.ceil((dataObj.pagination?.total || dataObj.vendors.length) / 12),
          hasNext: !!dataObj.pagination?.hasNext,
          hasPrev: !!dataObj.pagination?.hasPrev,
        });
      } else {
        // Catalog data fallback
        const fallback = getApprovedVendors();
        setVendors(fallback);
        setPagination({ page: 1, limit: 12, total: fallback.length, pages: 1, hasNext: false, hasPrev: false });
      }
    } catch {
      const fallback = getApprovedVendors();
      setVendors(fallback);
      setPagination({ page: 1, limit: 12, total: fallback.length, pages: 1, hasNext: false, hasPrev: false });
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, selectedSort, isVerifiedOnly, hasProductsOnly, minRatingFilter, cityFilter]);

  useEffect(() => {
    fetchVendors(1);
  }, [fetchVendors]);

  const handlePageChange = (newPage) => {
    fetchVendors(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSelectedSort('best_selling');
    setIsVerifiedOnly(false);
    setHasProductsOnly(false);
    setMinRatingFilter('');
    setCityFilter('');
    setShowFiltersDrawer(false);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (isVerifiedOnly) count++;
    if (hasProductsOnly) count++;
    if (minRatingFilter) count++;
    if (cityFilter.trim()) count++;
    return count;
  }, [isVerifiedOnly, hasProductsOnly, minRatingFilter, cityFilter]);

  return (
    <PageTransition>
      <MobileLayout>
        <div className="min-h-screen bg-surface-background pb-12">
          {/* Header Banner */}
          <div className="bg-surface-header border-b border-border text-white px-4 py-8 sm:py-10">
            <div className="max-w-7xl mx-auto text-center space-y-2">
              <span className="inline-block px-3 py-1 bg-brand-primary/20 text-brand-primary rounded-full text-xs font-black uppercase tracking-wider border border-brand-primary/30">
                MARKETPLACE DIRECTORY
              </span>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white uppercase">
                {t("Best Sellers & Top Stores")}
              </h1>
              <p className="text-xs sm:text-base text-gray-300 max-w-xl mx-auto font-medium">
                {t("Discover verified marketplace sellers nationwide")}
              </p>
            </div>
          </div>

          {/* Search & Filter Control Bar */}
          <div className="sticky top-0 z-30 bg-surface border-b border-border shadow-sm px-4 py-3">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 w-full">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-secondary text-base" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("Search sellers...")}
                  className="w-full pl-10 pr-9 py-2.5 bg-surface-input border border-border rounded-input text-content text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/40 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content"
                  >
                    <FiX className="text-sm" />
                  </button>
                )}
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
                {/* Sort Selector */}
                <select
                  value={selectedSort}
                  onChange={(e) => setSelectedSort(e.target.value)}
                  className="px-3 py-2.5 bg-surface border border-border rounded-input text-xs sm:text-sm font-bold text-content focus:outline-none focus:ring-2 focus:ring-brand-primary/40 cursor-pointer flex-1 sm:flex-initial"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.label)}
                    </option>
                  ))}
                </select>

                {/* Filter Drawer Button */}
                <button
                  type="button"
                  onClick={() => setShowFiltersDrawer(!showFiltersDrawer)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-button text-xs font-bold border transition-colors relative ${
                    activeFilterCount > 0
                      ? 'bg-brand-primary text-black border-brand-primary'
                      : 'bg-surface border-border text-content hover:border-brand-primary'
                  }`}
                >
                  <FiSliders className="text-sm" />
                  <span>{t("Filters")}</span>
                  {activeFilterCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-black flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Filter Chips */}
            <div className="max-w-7xl mx-auto flex items-center gap-2 mt-3 overflow-x-auto scrollbar-hide">
              <button
                type="button"
                onClick={() => setIsVerifiedOnly(!isVerifiedOnly)}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border transition-all flex-shrink-0 ${
                  isVerifiedOnly
                    ? 'bg-brand-primary/20 text-brand-primary border-brand-primary/40 font-black'
                    : 'bg-surface-muted text-content-secondary border-border hover:border-brand-primary/40'
                }`}
              >
                <FiCheckCircle className="text-xs" />
                <span>{t("Verified Only")}</span>
              </button>

              <button
                type="button"
                onClick={() => setMinRatingFilter(minRatingFilter === '4' ? '' : '4')}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border transition-all flex-shrink-0 ${
                  minRatingFilter === '4'
                    ? 'bg-brand-primary/20 text-brand-primary border-brand-primary/40 font-black'
                    : 'bg-surface-muted text-content-secondary border-border hover:border-brand-primary/40'
                }`}
              >
                <FiStar className="text-xs fill-current" />
                <span>{t("4+ Rating")}</span>
              </button>

              <button
                type="button"
                onClick={() => setHasProductsOnly(!hasProductsOnly)}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border transition-all flex-shrink-0 ${
                  hasProductsOnly
                    ? 'bg-brand-primary/20 text-brand-primary border-brand-primary/40 font-black'
                    : 'bg-surface-muted text-content-secondary border-border hover:border-brand-primary/40'
                }`}
              >
                <FiShoppingBag className="text-xs" />
                <span>{t("Has Products")}</span>
              </button>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="flex items-center gap-1 px-3 py-1 text-xs text-status-error hover:underline font-bold ml-auto flex-shrink-0"
                >
                  <FiRefreshCw className="text-xs" />
                  <span>{t("Clear Filters")}</span>
                </button>
              )}
            </div>
          </div>

          {/* Main Seller Grid Content */}
          <div className="max-w-7xl mx-auto px-4 py-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  {t("Loading sellers...")}
                </p>
              </div>
            ) : vendors.length === 0 ? (
              <EmptyState
                variant="no-results"
                title={t("No sellers matched your search.")}
                description={t("Try changing your filters or search keywords.")}
                titleClassName="text-content font-bold text-lg"
                descriptionClassName="text-content-secondary text-sm"
                action={
                  <Button onClick={handleClearFilters} variant="primary" size="md">
                    {t("Clear Filters")}
                  </Button>
                }
              />
            ) : (
              <div className="space-y-8">
                {/* Vendors Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                  {vendors.map((vendor, index) => (
                    <VendorShowcaseCard
                      key={vendor.id || vendor._id || index}
                      vendor={vendor}
                      index={index}
                    />
                  ))}
                </div>

                {/* Enterprise Pagination */}
                {pagination.pages > 1 && (
                  <div className="flex justify-center pt-6">
                    <Pagination
                      currentPage={pagination.page}
                      totalPages={pagination.pages}
                      onPageChange={handlePageChange}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileSellers;
