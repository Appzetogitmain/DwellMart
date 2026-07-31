import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiFilter, FiArrowLeft, FiGrid, FiList, FiX, FiSearch, FiTag } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import ProductListItem from "../components/Mobile/ProductListItem";
import { getProductsByBrand, getBrandById } from "../data/catalogData";
import PageTransition from "../../../shared/components/PageTransition";
import useInfiniteScroll from "../../../shared/hooks/useInfiniteScroll";
import LazyImage from "../../../shared/components/LazyImage";
import { getPlaceholderImage } from "../../../shared/utils/helpers";
import api from "../../../shared/utils/api";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import { getImageUrl, calculateDiscount } from "../../../shared/utils/helpers";

const normalizeBrand = (raw) => {
    const id = String(raw?.id || raw?._id || "");
    return {
        ...raw,
        id,
        _id: id,
        name: raw?.name || "",
        logo: getImageUrl(raw?.logo || raw?.image || raw?.brandLogo),
    };
};

const normalizeProduct = (raw) => {
    const id = String(raw?.id || raw?._id || "");
    const rawImage = raw?.image || raw?.mainImage || raw?.thumbnail || raw?.images?.[0] || "";
    const image = getImageUrl(rawImage);
    const images = (Array.isArray(raw?.images) ? raw.images : [rawImage])
        .filter(Boolean)
        .map(img => getImageUrl(img));

    const price = Number(raw?.price) || 0;
    const originalPrice = raw?.originalPrice !== undefined ? Number(raw.originalPrice) : undefined;
    const validOriginalPrice = originalPrice && originalPrice > price ? originalPrice : undefined;

    return {
        ...raw,
        id,
        _id: id,
        vendorId: String(raw?.vendorId?._id || raw?.vendorId || ""),
        brandId: String(raw?.brandId?._id || raw?.brandId || ""),
        image,
        images,
        price,
        originalPrice: validOriginalPrice,
        rating: Number(raw?.rating) || 0,
        reviewCount: Number(raw?.reviewCount) || 0,
    };
};

const sortProducts = (products = [], sortBy = "newest") => {
    const list = Array.isArray(products) ? [...products] : [];
    switch (sortBy) {
        case "price-asc":
            return list.sort((a, b) => Number(a?.price || 0) - Number(b?.price || 0));
        case "price-desc":
            return list.sort((a, b) => Number(b?.price || 0) - Number(a?.price || 0));
        case "rating":
            return list.sort((a, b) => Number(b?.rating || 0) - Number(a?.rating || 0));
        case "popular":
            return list.sort((a, b) => Number(b?.reviewCount || 0) - Number(a?.reviewCount || 0));
        case "newest":
        default:
            return list.sort((a, b) => {
                const aTime = new Date(a?.createdAt || 0).getTime();
                const bTime = new Date(b?.createdAt || 0).getTime();
                return bTime - aTime;
            });
    }
};

const Brand = () => {
    const { getTranslatedText: t } = usePageTranslation([
        "Loading brand...",
        "Brand Not Found",
        "Go Back Home",
        "Search in brand...",
        "available",
        "Filters",
        "Sort By",
        "Newest",
        "Most Popular",
        "Top Rated",
        "Price: Low to High",
        "Price: High to Low",
        "Price Range",
        "Min Price",
        "Max Price",
        "Minimum Rating",
        "Stars",
        "Clear All",
        "Apply Filters",
        "No products found",
        "There are no products available for this brand at the moment.",
        "Loading more products...",
        "Loading...",
        "Load More",
        "product",
        "products"
    ]);

    const { translateObject, translateArray } = useDynamicTranslation();
    const { id } = useParams();
    const navigate = useNavigate();
    const brandId = String(id ?? "").trim();
    const [catalogVersion, setCatalogVersion] = useState(0);
    const [remoteBrand, setRemoteBrand] = useState(null);
    const [remoteProducts, setRemoteProducts] = useState([]);
    const [isResolvingBrand, setIsResolvingBrand] = useState(true);

    // Get brand information
    const brand = useMemo(
        () => getBrandById(brandId) || remoteBrand,
        [brandId, catalogVersion, remoteBrand]
    );

    const [showFilters, setShowFilters] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'list'
    const [sortBy, setSortBy] = useState("newest");
    const [filters, setFilters] = useState({
        minPrice: "",
        maxPrice: "",
        minRating: "",
    });

    // Get products for this brand
    const rawBrandProducts = useMemo(() => {
        if (!brandId) return [];

        const local = getProductsByBrand(brandId);
        if (!remoteProducts.length) return local;

        const merged = [...remoteProducts];
        local.forEach((item) => {
            const exists = merged.some(
                (p) => String(p.id) === String(item.id)
            );
            if (!exists) merged.push(item);
        });
        return merged;
    }, [brandId, remoteProducts, catalogVersion]);

    const brandProducts = useMemo(() => {
        let result = rawBrandProducts;

        if (searchQuery) {
            result = result.filter((product) =>
                product.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        if (filters.minPrice) {
            result = result.filter(
                (product) => product.price >= parseFloat(filters.minPrice)
            );
        }
        if (filters.maxPrice) {
            result = result.filter(
                (product) => product.price <= parseFloat(filters.maxPrice)
            );
        }
        if (filters.minRating) {
            result = result.filter(
                (product) => product.rating >= parseFloat(filters.minRating)
            );
        }

        return sortProducts(result, sortBy);
    }, [rawBrandProducts, filters, searchQuery, sortBy]);

    const { displayedItems, hasMore, isLoading, loadMore, loadMoreRef } =
        useInfiniteScroll(brandProducts, 10, 10);

    const filterButtonRef = useRef(null);

    const handleFilterChange = (name, value) => {
        setFilters({ ...filters, [name]: value });
    };

    const clearFilters = () => {
        setFilters({
            minPrice: "",
            maxPrice: "",
            minRating: "",
        });
        setSearchQuery("");
        setSortBy("newest");
    };

    // Check if any filter is active
    const hasActiveFilters =
        filters.minPrice ||
        filters.maxPrice ||
        filters.minRating;

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

    useEffect(() => {
        const handleCatalogUpdate = () => setCatalogVersion((prev) => prev + 1);
        window.addEventListener("catalog-cache-updated", handleCatalogUpdate);
        return () => {
            window.removeEventListener("catalog-cache-updated", handleCatalogUpdate);
        };
    }, []);

    useEffect(() => {
        let active = true;
        const fetchBrandData = async () => {
            if (!brandId) {
                if (active) {
                    setRemoteBrand(null);
                    setRemoteProducts([]);
                    setIsResolvingBrand(false);
                }
                return;
            }

            setIsResolvingBrand(true);
            try {
                const [brandsRes, productsRes] = await Promise.all([
                    api.get("/brands/all"),
                    api.get("/products", { params: { brand: brandId, page: 1, limit: 100, sort: sortBy } }),
                ]);

                if (!active) return;

                const brandsPayload = brandsRes?.data ?? brandsRes;
                const productsPayload = productsRes?.data ?? productsRes;
                const brandsList = Array.isArray(brandsPayload)
                    ? brandsPayload.map(normalizeBrand)
                    : [];
                const matchedBrand =
                    brandsList.find((item) => String(item.id) === String(brandId)) || null;
                const allProducts = Array.isArray(productsPayload?.products)
                    ? [...productsPayload.products]
                    : [];
                const totalPages = Math.max(1, Number(productsPayload?.pages || 1));

                for (let page = 2; page <= totalPages; page += 1) {
                    const nextRes = await api.get("/products", {
                        params: { brand: brandId, page, limit: 100, sort: sortBy },
                    });
                    const nextPayload = nextRes?.data ?? nextRes;
                    if (Array.isArray(nextPayload?.products) && nextPayload.products.length) {
                        allProducts.push(...nextPayload.products);
                    }
                }

                const productList = sortProducts(
                    allProducts.map(normalizeProduct),
                    sortBy
                );

                const translatedBrand = matchedBrand ? await translateObject(matchedBrand, ['name', 'description']) : null;
                const translatedProducts = await translateArray(productList, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);

                setRemoteBrand(translatedBrand);
                setRemoteProducts(translatedProducts);
            } catch {
                if (!active) return;
                setRemoteBrand(null);
                setRemoteProducts([]);
            } finally {
                if (active) setIsResolvingBrand(false);
            }
        };

        fetchBrandData();
        return () => {
            active = false;
        };
    }, [brandId, sortBy]);

    if (isResolvingBrand) {
        return (
            <PageTransition>
                <MobileLayout showBottomNav={false} showCartBar={false}>
                    <div className="flex items-center justify-center min-h-[60vh] px-4">
                        <p className="text-gray-600">{t('Loading brand...')}</p>
                    </div>
                </MobileLayout>
            </PageTransition>
        );
    }

    if (!brand) {
        return (
            <PageTransition>
                <MobileLayout showBottomNav={false} showCartBar={false}>
                    <div className="flex items-center justify-center min-h-[60vh] px-4">
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-gray-800 mb-4">
                                {t('Brand Not Found')}
                            </h2>
                            <button
                                onClick={() => navigate("/home")}
                                className="bg-brand-primary text-black px-6 py-3 rounded-xl font-semibold hover:bg-brand-primaryHover transition-all">
                                {t('Go Back Home')}
                            </button>
                        </div>
                    </div>
                </MobileLayout>
            </PageTransition>
        );
    }

    return (
        <PageTransition>
            <MobileLayout showBottomNav={true} showCartBar={true}>
                <div className="w-full pb-24 lg:pb-12 max-w-7xl mx-auto min-h-screen bg-surface-muted">
                    {/* Header */}
                    <div className="bg-surface border-b border-border sticky top-0 z-30">
                        <div className="px-2 md:px-4 py-2 md:py-4">
                            <div className="flex items-center gap-2 md:gap-3 mb-4">
                                <button
                                    onClick={() => navigate(-1)}
                                    className="p-2 hover:bg-surface-muted rounded-full transition-colors">
                                    <FiArrowLeft className="text-xl text-content-secondary" />
                                </button>
                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-muted border border-border-light flex-shrink-0 p-1">
                                    <LazyImage
                                        src={brand.logo}
                                        alt={brand.name}
                                        className="w-full h-full object-contain"
                                        onError={(e) => {
                                            e.target.src = getPlaceholderImage(48, 48, "Brand");
                                        }}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h1 className="text-xl font-bold text-content truncate">
                                        {brand.name}
                                    </h1>
                                    <div className="relative mt-1">
                                        <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted text-xs" />
                                        <input
                                            type="text"
                                            placeholder={t("Search in brand...")}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-8 pr-8 py-2 bg-surface-muted border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary text-content shadow-inner"
                                        />
                                        {searchQuery && (
                                            <button
                                                onClick={() => setSearchQuery("")}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted p-1 hover:bg-border rounded-full transition-colors"
                                            >
                                                <FiX className="text-xs" />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-content-muted mt-1">
                                        {brandProducts.length} {brandProducts.length !== 1 ? t("products") : t("product")} {t('available')}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                    <div className="flex items-center bg-surface-muted rounded-lg p-1 border border-border">
                                        <button
                                            onClick={() => setViewMode("list")}
                                            className={`p-1.5 rounded transition-colors ${viewMode === "list"
                                                ? "bg-surface text-brand-primary shadow-sm"
                                                : "text-content-secondary"
                                                }`}>
                                            <FiList className="text-lg" />
                                        </button>
                                        <button
                                            onClick={() => setViewMode("grid")}
                                            className={`p-1.5 rounded transition-colors ${viewMode === "grid"
                                                ? "bg-surface text-brand-primary shadow-sm"
                                                : "text-content-secondary"
                                                }`}>
                                            <FiGrid className="text-lg" />
                                        </button>
                                    </div>
                                    <div ref={filterButtonRef} className="relative">
                                        <button
                                            onClick={() => setShowFilters(!showFilters)}
                                            className={`p-2 glass-card rounded-xl hover:bg-surface/80 transition-colors ${showFilters ? "bg-surface/80" : ""
                                                }`}>
                                            <FiFilter
                                                className={`text-lg transition-colors ${hasActiveFilters ? "text-brand-primary" : "text-content-secondary"
                                                    }`}
                                            />
                                        </button>

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
                                                        className="filter-dropdown absolute right-0 top-full w-56 bg-surface rounded-xl shadow-2xl border border-border z-[10001] overflow-hidden"
                                                        style={{ marginTop: "-50px" }}>
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
                                                                 <div>
                                                                    <h4 className="font-semibold text-content-secondary mb-1 text-xs">
                                                                        {t('Sort By')}
                                                                    </h4>
                                                                    <select
                                                                        value={sortBy}
                                                                        onChange={(e) => setSortBy(e.target.value)}
                                                                        className="w-full px-2 py-1.5 rounded-md border border-border bg-surface text-content focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                                                                    >
                                                                        <option value="newest">{t('Newest')}</option>
                                                                        <option value="popular">{t('Most Popular')}</option>
                                                                        <option value="rating">{t('Top Rated')}</option>
                                                                        <option value="price-asc">{t('Price: Low to High')}</option>
                                                                        <option value="price-desc">{t('Price: High to Low')}</option>
                                                                    </select>
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
                                                                                handleFilterChange(
                                                                                    "minPrice",
                                                                                    e.target.value
                                                                                )
                                                                            }
                                                                            className="w-full px-2 py-1.5 rounded-md border border-border bg-surface text-content focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                                                                        />
                                                                        <input
                                                                            type="number"
                                                                            placeholder={t("Max Price")}
                                                                            value={filters.maxPrice}
                                                                            onChange={(e) =>
                                                                                handleFilterChange(
                                                                                    "maxPrice",
                                                                                    e.target.value
                                                                                )
                                                                            }
                                                                            className="w-full px-2 py-1.5 rounded-md border border-border bg-surface text-content focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                                                                        />
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
                                                                                        filters.minRating ===
                                                                                        rating.toString()
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
                                                                                            filters.minRating ===
                                                                                                rating.toString()
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
                    </div>

                    {/* Products List */}
                    <div className="px-4 py-4 lg:p-6">
                        {brandProducts.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="text-6xl text-content-muted mx-auto mb-4 flex justify-center">
                                    <FiTag />
                                </div>
                                <h3 className="text-xl font-bold text-content mb-2">
                                    {t('No products found')}
                                </h3>
                                <p className="text-content-secondary">
                                    {t('There are no products available for this brand at the moment.')}
                                </p>
                            </div>
                        ) : viewMode === "grid" ? (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
                                    {displayedItems.map((product, index) => (
                                        <motion.div
                                            key={product.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.05 }}>
                                            <ProductCard product={product} />
                                        </motion.div>
                                    ))}
                                </div>

                                {hasMore && (
                                    <div
                                        ref={loadMoreRef}
                                        className="mt-6 flex flex-col items-center gap-4">
                                        {isLoading && (
                                            <div className="flex items-center gap-2 text-gray-600">
                                                <span className="text-sm">
                                                    {t('Loading more products...')}
                                                </span>
                                            </div>
                                        )}
                                        <button
                                            onClick={loadMore}
                                            disabled={isLoading}
                                            className="px-6 py-3 bg-brand-primary text-black rounded-xl font-semibold hover:bg-brand-primaryHover transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                            {isLoading ? t("Loading...") : t("Load More")}
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="space-y-3">
                                    {displayedItems.map((product, index) => (
                                        <ProductListItem
                                            key={product.id}
                                            product={product}
                                            index={index}
                                        />
                                    ))}
                                </div>

                                {hasMore && (
                                    <div
                                        ref={loadMoreRef}
                                        className="mt-6 flex flex-col items-center gap-4">
                                        {isLoading && (
                                            <div className="flex items-center gap-2 text-gray-600">
                                                <span className="text-sm">
                                                    {t('Loading more products...')}
                                                </span>
                                            </div>
                                        )}
                                        <button
                                            onClick={loadMore}
                                            disabled={isLoading}
                                            className="px-6 py-3 bg-brand-primary text-black rounded-xl font-semibold hover:bg-brand-primaryHover transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                            {isLoading ? t("Loading...") : t("Load More")}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div >
            </MobileLayout >
        </PageTransition >
    );
};

export default Brand;

