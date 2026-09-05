import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiSearch, FiX, FiArrowLeft, FiTag, FiChevronLeft, FiChevronRight, FiCheck } from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import BrandCard from "../../../shared/components/BrandCard";
import { getCatalogBrands } from "../data/catalogData";
import api from "../../../shared/utils/api";
import { usePageTranslation } from "../../../hooks/usePageTranslation";

const normalizeBrand = (raw) => {
  const id = String(raw?.id || raw?._id || "").trim();
  return {
    ...raw,
    id,
    _id: id,
    name: raw?.name || "",
    logo: raw?.logo || raw?.image || raw?.brandLogo || "",
    productCount: Number(raw?.productCount || 0),
  };
};

const getPaginationRange = (current, total) => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
};

const SORT_OPTIONS = [
  { value: "most_products", label: "Most Products" },
  { value: "a-z", label: "Alphabetical (A-Z)" },
  { value: "z-a", label: "Alphabetical (Z-A)" },
];

const ITEMS_PER_PAGE = 24;

const Brands = () => {
  const navigate = useNavigate();
  const { getTranslatedText: t } = usePageTranslation([
    "All Brands & Official Stores",
    "Discover certified brands, authentic collections, and official partner stores",
    "Search brands...",
    "OFFICIAL BRANDS",
    "Sort By",
    "Most Products",
    "Alphabetical (A-Z)",
    "Alphabetical (Z-A)",
    "No brands found",
    "No brands matched your search criteria.",
    "Clear Search",
    "Showing",
    "of",
    "brands",
    "With Products",
    "All Brands",
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSort, setSelectedSort] = useState("most_products");
  const [hasProductsOnly, setHasProductsOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [remoteBrands, setRemoteBrands] = useState([]);
  const [catalogVersion, setCatalogVersion] = useState(0);

  // Sync with local cache updates
  useEffect(() => {
    const handleCatalogUpdate = () => setCatalogVersion((prev) => prev + 1);
    window.addEventListener("catalog-cache-updated", handleCatalogUpdate);
    return () => {
      window.removeEventListener("catalog-cache-updated", handleCatalogUpdate);
    };
  }, []);

  // Fetch live brands with productCount from backend
  const fetchBrands = useCallback(async () => {
    try {
      const res = await api.get("/brands/all");
      const payload = res?.data ?? res;
      const list = Array.isArray(payload) ? payload.map(normalizeBrand) : [];
      if (list.length > 0) {
        setRemoteBrands(list);
      }
    } catch {
      // Fallback silently handled via catalogData
    }
  }, []);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  // Combine remote and local cache brands
  const allBrands = useMemo(() => {
    const local = getCatalogBrands().map(normalizeBrand);
    if (!remoteBrands.length) return local;

    const map = new Map();
    local.forEach((b) => {
      if (b.id) map.set(b.id, b);
    });
    remoteBrands.forEach((b) => {
      if (b.id) map.set(b.id, b);
    });
    return Array.from(map.values());
  }, [remoteBrands, catalogVersion]);

  // Count of brands that have products
  const brandsWithProductsCount = useMemo(() => {
    return allBrands.filter((b) => Number(b.productCount || 0) > 0).length;
  }, [allBrands]);

  // Filter and sort
  const filteredBrands = useMemo(() => {
    let result = [...allBrands];

    // Filter by products availability
    if (hasProductsOnly) {
      result = result.filter((b) => Number(b.productCount || 0) > 0);
    }

    // Filter by search keyword
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((b) => b.name && b.name.toLowerCase().includes(q));
    }

    // Sorting
    result.sort((a, b) => {
      const countA = Number(a.productCount || 0);
      const countB = Number(b.productCount || 0);
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();

      if (selectedSort === "most_products") {
        if (countB !== countA) return countB - countA;
        return nameA.localeCompare(nameB);
      }
      if (selectedSort === "z-a") {
        return nameB.localeCompare(nameA);
      }
      return nameA.localeCompare(nameB);
    });

    return result;
  }, [allBrands, searchQuery, selectedSort, hasProductsOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredBrands.length / ITEMS_PER_PAGE));

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, hasProductsOnly, selectedSort]);

  const paginatedBrands = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredBrands.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredBrands, page]);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages || newPage === page) return;
    setPage(newPage);
    window.scrollTo({ top: 220, behavior: "smooth" });
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="min-h-screen bg-surface-background pb-16">
          {/* Header Banner */}
          <div className="bg-surface-header border-b border-border text-white px-4 py-8 sm:py-10">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-white"
                  aria-label="Go Back"
                >
                  <FiArrowLeft className="text-xl" />
                </button>
                <span className="inline-block px-3 py-1 bg-brand-primary/20 text-brand-primary rounded-full text-xs font-black uppercase tracking-wider border border-brand-primary/30">
                  {t("OFFICIAL BRANDS")}
                </span>
              </div>
              <div className="text-center space-y-2">
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white uppercase">
                  {t("All Brands & Official Stores")}
                </h1>
                <p className="text-xs sm:text-base text-gray-300 max-w-xl mx-auto font-medium">
                  {t(
                    "Discover certified brands, authentic collections, and official partner stores"
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Sticky Search & Sort Control Bar */}
          <div className="sticky top-0 z-30 bg-surface border-b border-border shadow-sm px-4 py-3">
            <div className="max-w-7xl mx-auto flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                {/* Search input */}
                <div className="relative flex-1 w-full">
                  <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-secondary text-base" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("Search brands...")}
                    className="w-full pl-10 pr-9 py-2.5 bg-surface-input border border-border rounded-input text-content text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/40 font-medium"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content"
                    >
                      <FiX className="text-sm" />
                    </button>
                  )}
                </div>

                {/* Sort selector */}
                <div className="w-full sm:w-auto flex items-center justify-end gap-2">
                  <span className="text-xs text-content-secondary font-medium hidden sm:inline">
                    {t("Sort By")}:
                  </span>
                  <select
                    value={selectedSort}
                    onChange={(e) => setSelectedSort(e.target.value)}
                    className="w-full sm:w-auto px-3 py-2 bg-surface border border-border rounded-input text-xs sm:text-sm font-bold text-content focus:outline-none focus:ring-2 focus:ring-brand-primary/40 cursor-pointer"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.label)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Filter Pills & Summary Counter */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-0.5">
                  <button
                    type="button"
                    onClick={() => setHasProductsOnly(true)}
                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      hasProductsOnly
                        ? "bg-brand-primary text-black shadow-xs font-black"
                        : "bg-surface-muted text-content-secondary hover:text-content border border-border"
                    }`}
                  >
                    {hasProductsOnly && <FiCheck className="text-xs" />}
                    {t("With Products")} ({brandsWithProductsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasProductsOnly(false)}
                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      !hasProductsOnly
                        ? "bg-brand-primary text-black shadow-xs font-black"
                        : "bg-surface-muted text-content-secondary hover:text-content border border-border"
                    }`}
                  >
                    {!hasProductsOnly && <FiCheck className="text-xs" />}
                    {t("All Brands")} ({allBrands.length})
                  </button>
                </div>

                <span className="text-xs font-semibold text-content-muted whitespace-nowrap hidden sm:inline">
                  {filteredBrands.length} {t("brands")}
                </span>
              </div>
            </div>
          </div>

          {/* Brands Content Grid */}
          <div className="max-w-7xl mx-auto px-4 py-6">
            {filteredBrands.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-full bg-surface-muted border border-border mx-auto flex items-center justify-center text-content-muted text-2xl mb-4">
                  <FiTag />
                </div>
                <h3 className="text-lg font-bold text-content mb-1">
                  {t("No brands found")}
                </h3>
                <p className="text-xs sm:text-sm text-content-secondary mb-4">
                  {t("No brands matched your search criteria.")}
                </p>
                {(searchQuery || hasProductsOnly) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setHasProductsOnly(false);
                    }}
                    className="px-5 py-2.5 bg-brand-primary text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-brand-primaryHover transition-colors"
                  >
                    {t("Clear Search")}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-5">
                  {paginatedBrands.map((brand, index) => (
                    <motion.div
                      key={brand.id || index}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.02, 0.2) }}
                    >
                      <BrandCard
                        brand={brand}
                        onClick={() => navigate(`/brand/${brand.id}`)}
                      />
                    </motion.div>
                  ))}
                </div>

                {/* Responsive Pagination Controls */}
                {totalPages > 1 && (
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 bg-white dark:bg-surface p-4 rounded-2xl border border-gray-100 dark:border-border shadow-xs">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-content-secondary font-medium text-center sm:text-left">
                      {t("Showing")}{" "}
                      <strong className="text-gray-900 dark:text-content font-bold">
                        {(page - 1) * ITEMS_PER_PAGE + 1}–
                        {Math.min(page * ITEMS_PER_PAGE, filteredBrands.length)}
                      </strong>{" "}
                      {t("of")}{" "}
                      <strong className="text-gray-900 dark:text-content font-bold">
                        {filteredBrands.length}
                      </strong>{" "}
                      {t("brands")}
                    </span>

                    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center">
                      <button
                        type="button"
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page <= 1}
                        className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-border text-gray-700 dark:text-content-secondary hover:bg-gray-50 dark:hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        aria-label="Previous Page"
                      >
                        <FiChevronLeft className="text-base" />
                      </button>

                      {getPaginationRange(page, totalPages).map((pItem, idx) => {
                        if (pItem === "...") {
                          return (
                            <span
                              key={`ellipsis-${idx}`}
                              className="w-6 sm:w-7 text-center text-xs font-black text-gray-400 dark:text-content-muted select-none"
                            >
                              •••
                            </span>
                          );
                        }
                        const isCurrent = pItem === page;
                        return (
                          <button
                            key={pItem}
                            type="button"
                            onClick={() => handlePageChange(pItem)}
                            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center ${
                              isCurrent
                                ? "bg-brand-primary text-black font-extrabold shadow-sm ring-2 ring-brand-primary/25"
                                : "bg-white dark:bg-surface border border-gray-200 dark:border-border text-gray-700 dark:text-content-secondary hover:text-black dark:hover:text-content hover:bg-gray-50 dark:hover:bg-surface-muted"
                            }`}
                            aria-label={`Page ${pItem}`}
                            aria-current={isCurrent ? "page" : undefined}
                          >
                            {pItem}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => handlePageChange(page + 1)}
                        disabled={page >= totalPages}
                        className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-border text-gray-700 dark:text-content-secondary hover:bg-gray-50 dark:hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        aria-label="Next Page"
                      >
                        <FiChevronRight className="text-base" />
                      </button>
                    </div>
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

export default Brands;
