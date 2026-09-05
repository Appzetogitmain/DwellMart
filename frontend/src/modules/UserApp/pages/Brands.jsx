import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiSearch, FiX, FiArrowLeft, FiTag } from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import BrandCard from "../../../shared/components/BrandCard";
import { getCatalogBrands } from "../data/catalogData";
import api from "../../../shared/utils/api";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { getImageUrl } from "../../../shared/utils/helpers";

const normalizeBrand = (raw) => {
  const id = String(raw?.id || raw?._id || "").trim();
  return {
    ...raw,
    id,
    _id: id,
    name: raw?.name || "",
    logo: getImageUrl(raw?.logo || raw?.image || raw?.brandLogo),
  };
};

const SORT_OPTIONS = [
  { value: "a-z", label: "Alphabetical (A-Z)" },
  { value: "z-a", label: "Alphabetical (Z-A)" },
];

const Brands = () => {
  const navigate = useNavigate();
  const { getTranslatedText: t } = usePageTranslation([
    "All Brands & Official Stores",
    "Discover certified brands, authentic collections, and official partner stores",
    "Search brands...",
    "OFFICIAL BRANDS",
    "Sort By",
    "Alphabetical (A-Z)",
    "Alphabetical (Z-A)",
    "No brands found",
    "No brands matched your search criteria.",
    "Clear Search",
    "brands available",
    "brand available",
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSort, setSelectedSort] = useState("a-z");
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

  // Fetch live brands from backend
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

  // Filter and sort
  const filteredBrands = useMemo(() => {
    let result = [...allBrands];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((b) => b.name && b.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      if (selectedSort === "z-a") {
        return nameB.localeCompare(nameA);
      }
      return nameA.localeCompare(nameB);
    });

    return result;
  }, [allBrands, searchQuery, selectedSort]);

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
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center gap-3">
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

              {/* Controls */}
              <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
                <span className="text-xs font-semibold text-content-muted whitespace-nowrap">
                  {filteredBrands.length}{" "}
                  {filteredBrands.length === 1
                    ? t("brand available")
                    : t("brands available")}
                </span>
                <select
                  value={selectedSort}
                  onChange={(e) => setSelectedSort(e.target.value)}
                  className="px-3 py-2.5 bg-surface border border-border rounded-input text-xs sm:text-sm font-bold text-content focus:outline-none focus:ring-2 focus:ring-brand-primary/40 cursor-pointer"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.label)}
                    </option>
                  ))}
                </select>
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
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="px-5 py-2.5 bg-brand-primary text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-brand-primaryHover transition-colors"
                  >
                    {t("Clear Search")}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-5">
                {filteredBrands.map((brand, index) => (
                  <motion.div
                    key={brand.id || index}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.3) }}
                  >
                    <BrandCard
                      brand={brand}
                      onClick={() => navigate(`/brand/${brand.id}`)}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default Brands;
