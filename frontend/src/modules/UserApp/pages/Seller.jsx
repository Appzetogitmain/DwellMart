import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { FiFilter, FiArrowLeft, FiGrid, FiList, FiX, FiCheckCircle, FiStar, FiShoppingBag, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import ProductListItem from "../components/Mobile/ProductListItem";
import { getProductsByVendor, getVendorById } from "../data/catalogData";
import PageTransition from "../../../shared/components/PageTransition";
import LazyImage from "../../../shared/components/LazyImage";
import { getPlaceholderImage } from "../../../shared/utils/helpers";
import api from "../../../shared/utils/api";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import { VendorWholesaleBadge } from "../../../shared/components/WholesaleBadge";

const normalizeVendor = (raw) => ({
    ...raw,
    id: String(raw?.id || raw?._id || ""),
    _id: String(raw?.id || raw?._id || ""),
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
    isVerified: !!raw?.isVerified,
});

const normalizeProduct = (raw) => ({
    ...raw,
    id: String(raw?.id || raw?._id || ""),
    _id: String(raw?.id || raw?._id || ""),
    vendorId: String(raw?.vendorId?._id || raw?.vendorId || ""),
    brandId: String(raw?.brandId?._id || raw?.brandId || ""),
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images) ? raw.images : raw?.image ? [raw.image] : [],
    price: Number(raw?.price) || 0,
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
});

const Seller = () => {
    const { getTranslatedText: t } = usePageTranslation([
        "Loading seller...",
        "Seller Not Found",
        "Go Back Home",
        "Filters",
        "Price Range",
        "Min Price",
        "Max Price",
        "Minimum Rating",
        "Stars",
        "Clear All",
        "Apply Filters",
        "Ratings",
        "Products",
        "No products found",
        "This seller has no products available at the moment.",
        "Showing",
        "to",
        "of",
        "products"
    ]);

    const { translateObject, translateArray } = useDynamicTranslation();
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const vendorId = String(id ?? "").trim();
    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const currentPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const [catalogVersion, setCatalogVersion] = useState(0);
    const [remoteVendor, setRemoteVendor] = useState(null);
    const [vendorProducts, setVendorProducts] = useState([]);
    const [pagination, setPagination] = useState({
        total: 0,
        page: currentPage,
        pages: 1,
        limit: 12
    });
    const [isResolvingVendor, setIsResolvingVendor] = useState(true);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);

    const vendor = useMemo(
        () => getVendorById(vendorId) || remoteVendor,
        [vendorId, catalogVersion, remoteVendor]
    );

    const isWholesaleVendor = useMemo(() => {
        return (
            vendor?.vendorType === 'wholesale' ||
            (vendor?.sellingChannels?.wholesale?.enabled === true && vendor?.sellingChannels?.retail?.enabled !== true)
        );
    }, [vendor]);

    const [showFilters, setShowFilters] = useState(false);
    const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'list'
    const [filters, setFilters] = useState({
        minPrice: "",
        maxPrice: "",
        minRating: "",
    });

    const filterButtonRef = useRef(null);

    const handleFilterChange = (name, value) => {
        setFilters({ ...filters, [name]: value });
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("page", "1");
            return next;
        });
    };

    const clearFilters = () => {
        setFilters({
            minPrice: "",
            maxPrice: "",
            minRating: "",
        });
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("page", "1");
            return next;
        });
    };

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

    // Fetch vendor details
    useEffect(() => {
        let active = true;
        const fetchVendorData = async () => {
            if (!vendorId) {
                if (active) {
                    setRemoteVendor(null);
                    setIsResolvingVendor(false);
                }
                return;
            }

            setIsResolvingVendor(true);
            try {
                const res = await api.get(`/vendors/${vendorId}`, {
                    params: { experience: 'marketplace' },
                    silent: true,
                });
                const vendorPayload = res?.data ?? res;
                let vendorDoc = vendorPayload ? normalizeVendor(vendorPayload) : null;
                if (vendorDoc) {
                    try {
                        const translatedVendor = await translateObject(vendorDoc, ['storeName', 'name', 'storeDescription']);
                        if (translatedVendor) vendorDoc = translatedVendor;
                    } catch (tErr) {
                        console.warn('[Seller] Vendor translation skipped:', tErr);
                    }
                }
                if (active) setRemoteVendor(vendorDoc);
            } catch {
                if (active) setRemoteVendor(null);
            } finally {
                if (active) setIsResolvingVendor(false);
            }
        };

        fetchVendorData();
        return () => {
            active = false;
        };
    }, [vendorId]);

    // Fetch paginated vendor products
    useEffect(() => {
        let active = true;
        const fetchProducts = async () => {
            if (!vendorId) return;
            setIsLoadingProducts(true);
            try {
                const params = {
                    experience: 'marketplace',
                    page: currentPage,
                    limit: 12,
                    ...(filters.minPrice && { minPrice: filters.minPrice }),
                    ...(filters.maxPrice && { maxPrice: filters.maxPrice }),
                    ...(filters.minRating && { minRating: filters.minRating }),
                };

                const res = await api.get(`/vendors/${vendorId}/products`, { params, silent: true });
                const payload = res?.data ?? res;
                if (!active) return;

                const rawList = Array.isArray(payload?.products)
                    ? payload.products
                    : Array.isArray(payload)
                    ? payload
                    : null;

                if (rawList && rawList.length > 0) {
                    let normalized = rawList.map(normalizeProduct);
                    try {
                        const translated = await translateArray(normalized, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
                        if (Array.isArray(translated) && translated.length > 0) {
                            normalized = translated;
                        }
                    } catch (tErr) {
                        console.warn('[Seller] Products translation skipped:', tErr);
                    }
                    if (active) {
                        setVendorProducts(normalized);
                        setPagination({
                            total: Number(payload?.total || normalized.length),
                            page: Number(payload?.page || currentPage),
                            pages: Math.max(1, Number(payload?.pages || 1)),
                            limit: Number(payload?.limit || 12),
                        });
                    }
                } else if (rawList && rawList.length === 0) {
                    if (active) {
                        setVendorProducts([]);
                        setPagination({
                            total: 0,
                            page: 1,
                            pages: 1,
                            limit: 12,
                        });
                    }
                } else {
                    const local = getProductsByVendor(vendorId);
                    if (active) {
                        setVendorProducts(local);
                        setPagination({
                            total: local.length,
                            page: 1,
                            pages: 1,
                            limit: 12,
                        });
                    }
                }
            } catch {
                if (active) {
                    const local = getProductsByVendor(vendorId);
                    setVendorProducts(local);
                    setPagination({
                        total: local.length,
                        page: 1,
                        pages: 1,
                        limit: 12,
                    });
                }
            } finally {
                if (active) setIsLoadingProducts(false);
            }
        };

        fetchProducts();
        return () => {
            active = false;
        };
    }, [vendorId, currentPage, filters, catalogVersion]);

    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > pagination.pages || newPage === currentPage) return;
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("page", String(newPage));
            return next;
        });
        window.scrollTo({ top: 250, behavior: "smooth" });
    };

    if (isResolvingVendor) {
        return (
            <PageTransition>
                <MobileLayout showBottomNav={false} showCartBar={false}>
                    <div className="flex items-center justify-center min-h-[60vh] px-4">
                        <p className="text-gray-600">{t('Loading seller...')}</p>
                    </div>
                </MobileLayout>
            </PageTransition>
        );
    }

    if (!vendor) {
        return (
            <PageTransition>
                <MobileLayout showBottomNav={false} showCartBar={false}>
                    <div className="flex items-center justify-center min-h-[60vh] px-4">
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-gray-800 mb-4">
                                {t('Seller Not Found')}
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
                            <div className="flex items-center gap-3 mb-4">
                                <button
                                    onClick={() => navigate(-1)}
                                    className="p-2 hover:bg-surface-muted rounded-full transition-colors"
                                >
                                    <FiArrowLeft className="text-xl text-content-secondary" />
                                </button>
                                <div className="flex-1">
                                    <h1 className="text-xl font-bold text-content line-clamp-1">{vendor.storeName || vendor.name}</h1>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center bg-surface-muted rounded-lg p-1 border border-border">
                                        <button
                                            onClick={() => setViewMode("list")}
                                            className={`p-1.5 rounded transition-colors ${viewMode === "list"
                                                ? "bg-surface text-brand-primary shadow-sm"
                                                : "text-content-secondary"
                                                }`}
                                        >
                                            <FiList className="text-lg" />
                                        </button>
                                        <button
                                            onClick={() => setViewMode("grid")}
                                            className={`p-1.5 rounded transition-colors ${viewMode === "grid"
                                                ? "bg-surface text-brand-primary shadow-sm"
                                                : "text-content-secondary"
                                                }`}
                                        >
                                            <FiGrid className="text-lg" />
                                        </button>
                                    </div>
                                    <div ref={filterButtonRef} className="relative">
                                        <button
                                            onClick={() => setShowFilters(!showFilters)}
                                            className={`p-2.5 glass-card rounded-xl hover:bg-surface/80 transition-colors ${showFilters ? "bg-surface/80" : ""
                                                }`}
                                        >
                                            <FiFilter
                                                className={`text-lg transition-colors ${hasActiveFilters ? "text-brand-primary" : "text-content-secondary"
                                                    }`}
                                            />
                                        </button>
                                        {/* Filter Dropdown */}
                                        <AnimatePresence>
                                            {showFilters && (
                                                <>
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
                                                        className="filter-dropdown absolute right-0 top-full w-56 bg-surface rounded-xl shadow-2xl border border-border z-[10001] overflow-hidden"
                                                        style={{ marginTop: "10px" }}
                                                    >
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
                                                        <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                                                            <div className="p-2 space-y-2">
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

                            {/* Vendor Profile Card */}
                            <div className="bg-surface rounded-xl border border-border p-3 md:p-4 flex flex-col items-center text-center gap-3">
                                <div className="w-20 h-20 rounded-full bg-surface-muted p-1 border border-border-light shadow-sm overflow-hidden">
                                    <LazyImage
                                        src={vendor.storeLogo}
                                        alt={vendor.storeName || vendor.name}
                                        className="w-full h-full object-cover rounded-full"
                                        onError={(e) => {
                                            e.target.src = getPlaceholderImage(80, 80, (vendor.storeName || vendor.name).charAt(0));
                                        }}
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center justify-center gap-1 mb-1 flex-wrap">
                                        <h2 className="font-bold text-content text-lg">{vendor.storeName || vendor.name}</h2>
                                        {vendor.isVerified && <FiCheckCircle className="text-status-info text-sm" />}
                                        <VendorWholesaleBadge vendor={vendor} />
                                    </div>
                                    <div className="flex items-center justify-center gap-4 text-sm text-content-secondary">
                                        <div className="flex items-center gap-1">
                                            <FiStar className="text-status-warning fill-status-warning" />
                                            <span>{vendor.rating} {t('Ratings')}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <FiShoppingBag className="text-content-muted" />
                                            <span>{pagination.total || vendorProducts.length} {t('Products')}</span>
                                        </div>
                                    </div>
                                    {isWholesaleVendor && (
                                        <div className="mt-2 text-xs text-status-success bg-status-success/10 border border-status-success/20 rounded-full px-3 py-0.5 inline-flex items-center gap-1 font-medium">
                                            <span>📦 Wholesale Catalog • Bulk Order Pricing</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Products List */}
                    <div className="px-4 py-4 lg:p-6">
                        {isLoadingProducts ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="h-64 bg-gray-200 rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : vendorProducts.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="text-6xl text-content-muted mx-auto mb-4">🏪</div>
                                <h3 className="text-xl font-bold text-content mb-2">
                                    {t('No products found')}
                                </h3>
                                <p className="text-content-secondary">
                                    {t('This seller has no products available at the moment.')}
                                </p>
                            </div>
                        ) : viewMode === "grid" ? (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
                                    {vendorProducts.map((product, index) => (
                                        <motion.div
                                            key={product.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.05 }}>
                                            <ProductCard product={product} />
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Pagination Controls */}
                                {pagination.pages > 1 && (
                                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                                        <span className="text-xs sm:text-sm text-gray-500 font-medium">
                                            {t("Showing")} {((currentPage - 1) * pagination.limit) + 1} {t("to")}{" "}
                                            {Math.min(currentPage * pagination.limit, pagination.total)} {t("of")}{" "}
                                            {pagination.total} {t("products")}
                                        </span>

                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => handlePageChange(currentPage - 1)}
                                                disabled={currentPage <= 1 || isLoadingProducts}
                                                className="p-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            >
                                                <FiChevronLeft className="text-lg" />
                                            </button>

                                            {[...Array(pagination.pages)].map((_, i) => {
                                                const pNum = i + 1;
                                                const isCurrent = pNum === currentPage;
                                                return (
                                                    <button
                                                        key={pNum}
                                                        onClick={() => handlePageChange(pNum)}
                                                        disabled={isLoadingProducts}
                                                        className={`w-9 h-9 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                                                            isCurrent
                                                                ? "gradient-green text-white shadow-md"
                                                                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        {pNum}
                                                    </button>
                                                );
                                            })}

                                            <button
                                                onClick={() => handlePageChange(currentPage + 1)}
                                                disabled={currentPage >= pagination.pages || isLoadingProducts}
                                                className="p-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            >
                                                <FiChevronRight className="text-lg" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="space-y-3">
                                    {vendorProducts.map((product, index) => (
                                        <ProductListItem
                                            key={product.id}
                                            product={product}
                                            index={index}
                                        />
                                    ))}
                                </div>

                                {/* Pagination Controls */}
                                {pagination.pages > 1 && (
                                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface p-4 rounded-2xl border border-border shadow-xs">
                                        <span className="text-xs sm:text-sm text-content-secondary font-medium">
                                            {t("Showing")} {((currentPage - 1) * pagination.limit) + 1} {t("to")}{" "}
                                            {Math.min(currentPage * pagination.limit, pagination.total)} {t("of")}{" "}
                                            {pagination.total} {t("products")}
                                        </span>

                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => handlePageChange(currentPage - 1)}
                                                disabled={currentPage <= 1 || isLoadingProducts}
                                                className="p-2 rounded-xl border border-border text-content-secondary hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            >
                                                <FiChevronLeft className="text-lg" />
                                            </button>

                                            {[...Array(pagination.pages)].map((_, i) => {
                                                const pNum = i + 1;
                                                const isCurrent = pNum === currentPage;
                                                return (
                                                    <button
                                                        key={pNum}
                                                        onClick={() => handlePageChange(pNum)}
                                                        disabled={isLoadingProducts}
                                                        className={`w-9 h-9 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                                                            isCurrent
                                                                ? "bg-brand-primary text-black shadow-md"
                                                                : "bg-surface border border-border text-content-secondary hover:bg-surface-muted"
                                                        }`}
                                                    >
                                                        {pNum}
                                                    </button>
                                                );
                                            })}

                                            <button
                                                onClick={() => handlePageChange(currentPage + 1)}
                                                disabled={currentPage >= pagination.pages || isLoadingProducts}
                                                className="p-2 rounded-xl border border-border text-content-secondary hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            >
                                                <FiChevronRight className="text-lg" />
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

export default Seller;
