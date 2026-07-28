import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  FiStar,
  FiHeart,
  FiShoppingBag,
  FiMinus,
  FiPlus,
  FiArrowLeft,
  FiShare2,
  FiCheckCircle,
  FiTrash2,
} from "react-icons/fi";
import { motion } from "framer-motion";
import { useCartStore, useUIStore } from "../../../shared/store/useStore";
import { useWishlistStore } from "../../../shared/store/wishlistStore";
import { useReviewsStore } from "../../../shared/store/reviewsStore";
import { useOrderStore } from "../../../shared/store/orderStore";
import { useAuthStore } from "../../../shared/store/authStore";
import {
  getProductById,
  getSimilarProducts,
  getVendorById,
  getBrandById,
} from "../data/catalogData";
import api from "../../../shared/utils/api";
import { formatPrice, getImageUrl, calculateDiscount } from "../../../shared/utils/helpers";
import Price from "../../../shared/components/Price";
import toast from "react-hot-toast";
import MobileLayout from "../components/Layout/MobileLayout";
import ImageGallery from "../../../shared/components/Product/ImageGallery";
import VariantSelector from "../../../shared/components/Product/VariantSelector";
import ReviewForm from "../../../shared/components/Product/ReviewForm";
import PageTransition from "../../../shared/components/PageTransition";
import Badge from "../../../shared/components/Badge";
import ProductCard from "../../../shared/components/ProductCard";
import { getVariantSignature } from "../../../shared/utils/variant";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import LazyImage from "../../../shared/components/LazyImage";

const resolveVariantPrice = (product, selectedVariant) => {
  const basePrice = Number(product?.price) || 0;
  if (!selectedVariant || !product?.variants?.prices) return basePrice;

  const entries =
    product.variants.prices instanceof Map
      ? Array.from(product.variants.prices.entries())
      : Object.entries(product.variants.prices || {});
  const dynamicKey = getVariantSignature(selectedVariant || {});
  if (dynamicKey) {
    const direct = entries.find(([key]) => String(key).trim() === dynamicKey);
    if (direct) {
      const parsed = Number(direct[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const normalized = entries.find(
      ([key]) => String(key).trim().toLowerCase() === dynamicKey.toLowerCase()
    );
    if (normalized) {
      const parsed = Number(normalized[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  const size = String(selectedVariant.size || "").trim().toLowerCase();
  const color = String(selectedVariant.color || "").trim().toLowerCase();

  const candidates = [
    `${size}|${color}`,
    `${size}-${color}`,
    `${size}_${color}`,
    `${size}:${color}`,
    size && !color ? size : null,
    color && !size ? color : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const exact = entries.find(([key]) => String(key).trim() === candidate);
    if (exact) {
      const parsed = Number(exact[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const normalized = entries.find(
      ([key]) => String(key).trim().toLowerCase() === candidate
    );
    if (normalized) {
      const parsed = Number(normalized[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  return basePrice;
};

const isMongoId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ""));
const normalizeProduct = (raw) => {
  if (!raw) return null;

  const vendorObj =
    raw?.vendor && typeof raw.vendor === "object"
      ? raw.vendor
      : raw?.vendorId && typeof raw.vendorId === "object"
        ? raw.vendorId
        : null;
  const brandObj =
    raw?.brand && typeof raw.brand === "object"
      ? raw.brand
      : raw?.brandId && typeof raw.brandId === "object"
        ? raw.brandId
        : null;
  const categoryObj =
    raw?.category && typeof raw.category === "object"
      ? raw.category
      : raw?.categoryId && typeof raw.categoryId === "object"
        ? raw.categoryId
        : null;

  const id = String(raw?.id || raw?._id || "").trim();
  if (!id) return null;

  const vendorId = String(vendorObj?._id || vendorObj?.id || raw?.vendorId || "").trim();
  const brandId = String(brandObj?._id || brandObj?.id || raw?.brandId || "").trim();
  const categoryId = String(categoryObj?._id || categoryObj?.id || raw?.categoryId || "").trim();
  const rawImage = raw?.image || raw?.mainImage || raw?.thumbnail || raw?.images?.[0] || "";
  const image = getImageUrl(rawImage);
  const images = (Array.isArray(raw?.images) ? raw.images : [rawImage])
    .filter(Boolean)
    .map(img => getImageUrl(img));

  const price = Number(raw?.price) || 0;
  const originalPrice = raw?.originalPrice !== undefined && raw?.originalPrice !== null
    ? Number(raw.originalPrice)
    : undefined;

  // Ensure original price is always >= selling price for display logic
  const validOriginalPrice = originalPrice && originalPrice > price ? originalPrice : undefined;

  return {
    ...raw,
    id,
    _id: id,
    vendorId,
    brandId,
    categoryId,
    image,
    images,
    price,
    originalPrice: validOriginalPrice,
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
    isActive: raw?.isActive !== false,
    stockQuantity: Number(raw?.stockQuantity) || 0,
    vendorName: raw?.vendorName || vendorObj?.storeName || vendorObj?.name || "",
    brandName: raw?.brandName || brandObj?.name || "",
    categoryName: raw?.categoryName || categoryObj?.name || "",
    vendor: vendorObj
      ? {
        ...vendorObj,
        id: String(vendorObj?.id || vendorObj?._id || vendorId),
        storeLogo: getImageUrl(vendorObj?.storeLogo || vendorObj?.logo || vendorObj?.image),
      }
      : null,
    brand: brandObj
      ? {
        ...brandObj,
        id: String(brandObj?.id || brandObj?._id || brandId),
        logo: getImageUrl(brandObj?.logo || brandObj?.image || brandObj?.brandLogo),
      }
      : null,
    stock:
      raw?.stock ||
      (Number(raw?.stockQuantity) > 0 ? "in_stock" : "out_of_stock"),
    description: String(raw?.description || "").trim(),
  };
};

const MobileProductDetail = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "Loading product...",
    "Product Not Found",
    "Go Back Home",
    "Product is out of stock",
    "Please select required variant options",
    "Selected variant is out of stock",
    "Only available for selected variant",
    "Added to cart!",
    "Removed from cart!",
    "Removed from wishlist",
    "Added to wishlist",
    "Link copied to clipboard",
    "You can review only after this product is delivered",
    "Unable to submit review",
    "Back",
    "Flash Sale - Limited Time Offer",
    "Verified Vendor",
    "Reviews",
    "In Stock",
    "Low Stock",
    "Out of Stock",
    "OFF",
    "Best price guaranteed",
    "Quantity",
    "available",
    "Remove from Cart",
    "Add to Cart",
    "Product Description",
    "Product FAQs",
    "Reviews are available after product delivery.",
    "Customer Reviews",
    "Response from Seller",
    "Similar Products",
    "No similar products yet",
    "You might also like",
    "item(s) available for selected variant",
    "Check out",
    "High-quality",
    "available in",
    "This product is carefully selected to ensure the best quality and freshness.",
    "Remove"
  ]);

  const { translateObject, translateArray } = useDynamicTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const localFallbackProduct = useMemo(() => normalizeProduct(getProductById(id)), [id]);
  const [product, setProduct] = useState(localFallbackProduct);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState(null);

  const { items, addItem, removeItem } = useCartStore();
  const triggerCartAnimation = useUIStore(
    (state) => state.triggerCartAnimation
  );
  const {
    addItem: addToWishlist,
    removeItem: removeFromWishlist,
    isInWishlist,
  } = useWishlistStore();
  const { fetchReviews, sortReviews, addReview } = useReviewsStore();
  const { getAllOrders } = useOrderStore();
  const { user, isAuthenticated } = useAuthStore();
  const vendor = useMemo(() => {
    if (!product) return null;
    if (product.vendor?.id) return product.vendor;
    return getVendorById(product.vendorId);
  }, [product]);
  const brand = useMemo(() => {
    if (!product) return null;
    if (product.brand?.id) return product.brand;
    return getBrandById(product.brandId);
  }, [product]);

  // Stable logos to prevent flashing during re-renders/translations
  const stableBrandLogo = useMemo(() => {
    if (!brand) return null;
    const catalogBrand = getBrandById(brand.id);
    return catalogBrand?.logo || brand.logo;
  }, [brand]);

  const stableVendorLogo = useMemo(() => {
    if (!vendor) return null;
    const catalogVendor = getVendorById(vendor.id);
    return catalogVendor?.storeLogo || vendor.storeLogo;
  }, [vendor]);

  const isFavorite = product ? isInWishlist(product.id) : false;
  const selectedVariantSignature = getVariantSignature(selectedVariant || {});
  const isInCart = product
    ? items.some(
      (item) =>
        String(item.id) === String(product.id) &&
        getVariantSignature(item.variant || {}) === selectedVariantSignature
    )
    : false;
  const productReviews = useMemo(() => {
    return product ? sortReviews(product.id, "newest") : [];
  }, [product, sortReviews]);

  useEffect(() => {
    let active = true;
    setIsLoadingProduct(true);

    const loadProductDetail = async () => {
      try {
        const [detailRes, similarRes] = await Promise.allSettled([
          api.get(`/products/${id}`),
          api.get(`/similar/${id}`),
        ]);

        const detailPayload =
          detailRes.status === "fulfilled"
            ? detailRes.value?.data ?? detailRes.value
            : null;
        const resolvedProduct = normalizeProduct(detailPayload) || localFallbackProduct;

        const similarPayload =
          similarRes.status === "fulfilled"
            ? similarRes.value?.data ?? similarRes.value
            : null;
        const resolvedSimilar = Array.isArray(similarPayload)
          ? similarPayload
            .map(normalizeProduct)
            .filter(
              (item) => item?.id && String(item.id) !== String(resolvedProduct?.id || "")
            )
            .slice(0, 5)
          : [];

        if (!active) return;

        const translatedProduct = await translateObject(resolvedProduct, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
        const translatedSimilar = await translateArray(resolvedSimilar, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);

        if (!active) return;
        setProduct(translatedProduct);
        if (translatedSimilar.length > 0) {
          setSimilarProducts(translatedSimilar);
        } else if (translatedProduct?.id) {
          const localSimilar = getSimilarProducts(translatedProduct.id, 5);
          const translatedLocalSimilar = await translateArray(localSimilar, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
          if (active) setSimilarProducts(translatedLocalSimilar);
        } else {
          setSimilarProducts([]);
        }
      } catch {
        if (!active) return;
        const translatedFallback = await translateObject(localFallbackProduct, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
        if (active) setProduct(translatedFallback);
        if (translatedFallback?.id) {
          const localSimilar = getSimilarProducts(translatedFallback.id, 5);
          const translatedLocalSimilar = await translateArray(localSimilar, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
          if (active) setSimilarProducts(translatedLocalSimilar);
        } else {
          setSimilarProducts([]);
        }
      } finally {
        if (active) setIsLoadingProduct(false);
      }
    };

    loadProductDetail();
    return () => {
      active = false;
    };
  }, [id, localFallbackProduct]);

  useEffect(() => {
    if (product?.variants?.defaultSelection && typeof product.variants.defaultSelection === "object") {
      setSelectedVariant(product.variants.defaultSelection);
      return;
    }
    if (product?.variants?.defaultVariant) {
      setSelectedVariant(product.variants.defaultVariant);
      return;
    }
    setSelectedVariant({});
  }, [product]);

  useEffect(() => {
    if (product?.id) {
      fetchReviews(product.id, { sort: "newest", limit: 50 });
    }
  }, [product?.id, fetchReviews]);

  const handleAddToCart = () => {
    if (!product) return;
    if (product.stock === "out_of_stock") {
      toast.error(t("Product is out of stock"));
      return;
    }
    const attributeAxes = Array.isArray(product?.variants?.attributes)
      ? product.variants.attributes.filter((attr) => Array.isArray(attr?.values) && attr.values.length > 0)
      : [];
    const hasDynamicAxes = attributeAxes.length > 0;
    const hasSizeVariants = Array.isArray(product?.variants?.sizes) && product.variants.sizes.length > 0;
    const hasColorVariants = Array.isArray(product?.variants?.colors) && product.variants.colors.length > 0;
    const isMissingDynamicAxis = hasDynamicAxes
      ? attributeAxes.some((attr) => !String(selectedVariant?.[attr.name] || selectedVariant?.[String(attr.name || "").toLowerCase().replace(/\s+/g, "_")] || "").trim())
      : false;
    const selectedSize = String(selectedVariant?.size || "").trim();
    const selectedColor = String(selectedVariant?.color || "").trim();
    if (isMissingDynamicAxis || ((hasSizeVariants && !selectedSize) || (hasColorVariants && !selectedColor))) {
      toast.error(t("Please select required variant options"));
      return;
    }

    const finalPrice = resolveVariantPrice(product, selectedVariant);
    const variantKey = getVariantSignature(selectedVariant || {});
    const variantStockValue = Number(
      product?.variants?.stockMap?.[variantKey] ??
      product?.variants?.stockMap?.get?.(variantKey)
    );
    const effectiveStock = Number.isFinite(variantStockValue)
      ? variantStockValue
      : Number(product.stockQuantity || 0);
    if (effectiveStock <= 0) {
      toast.error(t("Selected variant is out of stock"));
      return;
    }
    if (quantity > effectiveStock) {
      toast.error(`${t('Only')} ${effectiveStock} ${t('item(s) available for selected variant')}`);
      return;
    }

    const addedToCart = addItem({
      id: product.id,
      name: product.name,
      price: finalPrice,
      image: product.image,
      quantity: quantity,
      variant: selectedVariant,
      stockQuantity: effectiveStock,
      vendorId: product.vendorId,
      vendorName: vendor?.storeName || vendor?.name || product.vendorName,
    });
    if (!addedToCart) return;
    triggerCartAnimation();
    toast.success(t("Added to cart!"));
  };

  const handleRemoveFromCart = () => {
    if (!product) return;
    removeItem(product.id, selectedVariant || {});
    toast.success(t("Removed from cart!"));
  };

  const handleFavorite = () => {
    if (!product) return;
    if (isFavorite) {
      removeFromWishlist(product.id);
      toast.success(t("Removed from wishlist"));
    } else {
      const addedToWishlist = addToWishlist({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
      });
      if (addedToWishlist) {
        toast.success(t("Added to wishlist"));
      }
    }
  };

  const handleQuantityChange = (change) => {
    const newQuantity = quantity + change;
    const variantKey = getVariantSignature(selectedVariant || {});
    const variantStockValue = Number(
      product?.variants?.stockMap?.[variantKey] ??
      product?.variants?.stockMap?.get?.(variantKey)
    );
    const maxStock = Number.isFinite(variantStockValue)
      ? Math.max(0, variantStockValue)
      : Number(product?.stockQuantity || 0);
    if (newQuantity >= 1 && newQuantity <= (maxStock || 10)) {
      setQuantity(newQuantity);
    }
  };

  const productImages = useMemo(() => {
    if (!product) return [];
    const selectedVariantKey = getVariantSignature(selectedVariant || {});
    const variantImage = String(
      product?.variants?.imageMap?.[selectedVariantKey] ||
      product?.variants?.imageMap?.get?.(selectedVariantKey) ||
      ""
    ).trim();
    const images =
      Array.isArray(product.images) && product.images.length > 0
        ? product.images.filter(Boolean)
        : product.image
          ? [product.image]
          : [];
    if (variantImage) {
      return [variantImage, ...images.filter((img) => img !== variantImage)];
    }
    return images;
  }, [product, selectedVariant]);

  const currentPrice = useMemo(() => {
    return resolveVariantPrice(product, selectedVariant);
  }, [product, selectedVariant]);

  const selectedAvailableStock = useMemo(() => {
    const variantKey = getVariantSignature(selectedVariant || {});
    const variantStockValue = Number(
      product?.variants?.stockMap?.[variantKey] ??
      product?.variants?.stockMap?.get?.(variantKey)
    );
    if (Number.isFinite(variantStockValue)) {
      return Math.max(0, variantStockValue);
    }
    return Number(product?.stockQuantity || 0);
  }, [product, selectedVariant]);

  const productFaqs = useMemo(() => {
    if (!Array.isArray(product?.faqs)) return [];
    return product.faqs
      .map((faq) => ({
        question: String(faq?.question || "").trim(),
        answer: String(faq?.answer || "").trim(),
      }))
      .filter((faq) => faq.question && faq.answer);
  }, [product?.faqs]);

  const eligibleDeliveredOrderId = useMemo(() => {
    if (!isAuthenticated || !user?.id || !isMongoId(product?.id)) return null;
    const userOrders = getAllOrders(user.id) || [];
    const eligibleOrder = userOrders.find((order) => {
      if (String(order?.status || "").toLowerCase() !== "delivered") return false;
      const items = Array.isArray(order?.items) ? order.items : [];
      return items.some(
        (item) => String(item?.productId || item?.id || "") === String(product.id)
      );
    });
    return eligibleOrder?._id || null;
  }, [isAuthenticated, user?.id, product?.id, getAllOrders]);

  const [translatedVendor, setTranslatedVendor] = useState(null);
  const [translatedBrand, setTranslatedBrand] = useState(null);

  useEffect(() => {
    let active = true;
    const translateVendorAndBrand = async () => {
      if (vendor) {
        const translated = await translateObject(vendor, ['storeName', 'name', 'storeDescription']);
        if (active) setTranslatedVendor(translated);
      } else {
        if (active) setTranslatedVendor(null);
      }

      if (brand) {
        const translated = await translateObject(brand, ['name', 'description']);
        if (active) setTranslatedBrand(translated);
      } else {
        if (active) setTranslatedBrand(null);
      }
    };
    translateVendorAndBrand();
    return () => { active = false; };
  }, [vendor, brand, translateObject]);

  const [translatedProductReviews, setTranslatedProductReviews] = useState([]);
  useEffect(() => {
    let active = true;
    const translateReviews = async () => {
      if (productReviews.length > 0) {
        const translated = await translateArray(productReviews, ['comment', 'user', 'vendorResponse']);
        if (active) setTranslatedProductReviews(translated);
      } else {
        if (active) setTranslatedProductReviews([]);
      }
    };
    translateReviews();
    return () => { active = false; };
  }, [productReviews, translateArray]);

  const [translatedFaqs, setTranslatedFaqs] = useState([]);
  useEffect(() => {
    let active = true;
    const translateFaqs = async () => {
      if (productFaqs.length > 0) {
        const translated = await translateArray(productFaqs, ['question', 'answer']);
        if (active) setTranslatedFaqs(translated);
      } else {
        if (active) setTranslatedFaqs([]);
      }
    };
    translateFaqs();
    return () => { active = false; };
  }, [productFaqs, translateArray]);

  const handleSubmitReview = async (reviewData) => {
    if (!eligibleDeliveredOrderId) {
      toast.error(t("You can review only after this product is delivered"));
      return false;
    }

    const ok = await addReview(product.id, {
      ...reviewData,
      orderId: eligibleDeliveredOrderId,
    });
    if (!ok) {
      toast.error(t("Unable to submit review"));
      return false;
    }

    await fetchReviews(product.id, { sort: "newest", limit: 50 });
    return true;
  };

  if (!product) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center">
              {isLoadingProduct ? (
                <h2 className="text-xl font-bold text-gray-800 mb-4">{t("Loading product...")}</h2>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    {t("Product Not Found")}
                  </h2>
                  <button
                    onClick={() => navigate("/home")}
                    className="gradient-green text-white px-6 py-3 rounded-xl font-semibold"
                  >
                    {t("Go Back Home")}
                  </button>
                </>
              )}
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={true}>
        <div className="w-full pb-12 max-w-7xl mx-auto">
          {/* Back Button */}
          <div className="px-4 pt-3 sm:pt-4 lg:pt-8 lg:px-8 mb-4">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-gray-200 shadow-sm text-gray-700 hover:text-gray-900 text-sm font-semibold hover:bg-gray-50 transition-all">
              <FiArrowLeft className="text-base" />
              <span>{t('Back')}</span>
            </button>
          </div>

          <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-16 lg:px-8 lg:items-start">
            {/* Left Column: Product Image */}
            <div className="px-4 py-4 lg:p-0 sticky top-24">
              <div className="bg-white rounded-3xl p-2 lg:p-4 shadow-sm border border-gray-100">
                <ImageGallery images={productImages} productName={product.name} />
              </div>
              {product.flashSale && (
                <div className="mt-4 flex justify-center lg:justify-start">
                  <Badge variant="flash" size="lg">{t('Flash Sale - Limited Time Offer')}</Badge>
                </div>
              )}
            </div>

            {/* Right Column: Product Info */}
            <div className="px-4 py-4 lg:p-0">
              <div className="flex flex-col gap-6">
                <div>
                  {/* Vendor Badge */}
                  {vendor && (
                    <div className="mb-4">
                      <Link
                        to={`/seller/${vendor.id}`}
                        className="inline-flex items-center gap-3 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-full transition-all duration-300 border border-gray-200 group">
                        {/* Vendor Logo */}
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center">
                          {stableVendorLogo ? (
                            <img
                              src={stableVendorLogo}
                              alt={translatedVendor?.storeName || vendor.storeName || vendor.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                e.currentTarget.nextSibling.style.display = "flex";
                              }}
                            />
                          ) : null}
                          <div
                            className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ display: stableVendorLogo ? "none" : "flex" }}>
                            <FiShoppingBag />
                          </div>
                        </div>

                        <span className="font-medium text-sm group-hover:text-primary-600 transition-colors">
                          {translatedVendor?.storeName || translatedVendor?.name || product.vendorName}
                        </span>
                        {translatedVendor?.isVerified && (
                          <FiCheckCircle
                            className="text-accent-500 text-sm"
                            title={t("Verified Vendor")}
                          />
                        )}
                        <span className="text-gray-400 group-hover:translate-x-1 transition-transform">{"->"}</span>
                      </Link>
                    </div>
                  )}
                  {brand && (
                    <div className="mb-4">
                      <Link
                        to={`/brand/${brand.id}`}
                        className="inline-flex items-center gap-3 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-full transition-all duration-300 border border-gray-200 group">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center">
                          {stableBrandLogo ? (
                            <img
                              src={stableBrandLogo}
                              alt={translatedBrand?.name || brand.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                e.currentTarget.nextSibling.style.display = "flex";
                              }}
                            />
                          ) : null}
                          <div
                            className="w-full h-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-[10px]"
                            style={{ display: stableBrandLogo ? "none" : "flex" }}>
                            {(translatedBrand?.name || brand.name)?.[0]?.toUpperCase()}
                          </div>
                        </div>
                        <span className="font-medium text-sm group-hover:text-primary-600 transition-colors">
                          {translatedBrand?.name || product.brandName}
                        </span>
                        <span className="text-gray-400 group-hover:translate-x-1 transition-transform">{"->"}</span>
                      </Link>
                    </div>
                  )}

                  <h1 className="text-2xl lg:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                    {product.name}
                  </h1>

                  {/* Rating & Reviews */}
                  {!!product.rating && (
                    <div className="flex items-center gap-4 mb-6">
                      <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-100">
                        <span className="font-bold text-yellow-700">{product.rating}</span>
                        <FiStar className="text-yellow-500 fill-yellow-500" />
                      </div>
                      <span className="text-gray-500 text-sm font-medium hover:text-gray-700 cursor-pointer">
                        {product.reviewCount || 0} {t('Reviews')}
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="text-green-600 text-sm font-medium bg-green-50 px-2 py-1 rounded-lg">
                        {product.stock === "in_stock" ? t("In Stock") : product.stock === "low_stock" ? t("Low Stock") : t("Out of Stock")}
                      </span>
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-100">
                    <div className="flex items-end gap-3 mb-2">
                      <Price amount={currentPrice} className="text-4xl font-extrabold text-gray-900" />
                      {product.originalPrice && (
                        <Price amount={product.originalPrice} className="text-xl text-gray-400 line-through font-medium mb-1.5" />
                      )}
                    </div>
                    {product.originalPrice && (
                      <div className="flex items-center gap-2">
                        <span className="text-accent-600 font-bold bg-accent-50 px-3 py-1 rounded-full text-sm">
                          {calculateDiscount(product.originalPrice, currentPrice)}% {t('OFF')}
                        </span>
                        <span className="text-sm text-gray-500">{t('Best price guaranteed')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Variants & Quantity */}
                <div className="space-y-6 border-b border-gray-100 pb-8">
                  {product.variants && (
                    <VariantSelector
                      variants={product.variants}
                      onVariantChange={setSelectedVariant}
                      currentPrice={product.price}
                    />
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3">
                      {t('Quantity')}
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center bg-gray-100 rounded-xl p-1 border border-gray-200">
                        <button
                          onClick={() => handleQuantityChange(-1)}
                          disabled={quantity <= 1}
                          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white shadow-sm hover:shadow-md disabled:shadow-none disabled:bg-transparent disabled:opacity-50 transition-all text-gray-700">
                          <FiMinus />
                        </button>
                        <span className="w-12 text-center font-bold text-gray-900 text-lg">
                          {quantity}
                        </span>
                        <button
                          onClick={() => handleQuantityChange(1)}
                          disabled={quantity >= (selectedAvailableStock || 10)}
                          className="w-10 h-10 flex items-center justify-center rounded-lg bg-white shadow-sm hover:shadow-md disabled:shadow-none disabled:bg-transparent disabled:opacity-50 transition-all text-gray-700">
                          <FiPlus />
                        </button>
                      </div>
                      <span className="text-sm text-gray-500">
                        {selectedAvailableStock} {t(product.unit || 'unit')}{(selectedAvailableStock !== 1 && product.unit === 'item') ? 's' : ''} {t('available')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* PRODUCT ACTIONS */}
                <div className="grid grid-cols-5 gap-3 sm:gap-4 py-4">
                  {isInCart ? (
                    <button
                      onClick={handleRemoveFromCart}
                      className="col-span-3 py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 shadow-sm">
                      <FiTrash2 className="text-lg sm:text-xl" />
                      <span>{t('Remove from Cart')}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleAddToCart}
                      disabled={product.stock === "out_of_stock"}
                      className={`col-span-3 py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 ${product.stock === "out_of_stock"
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                        : "gradient-green text-white hover:shadow-glow-green hover:-translate-y-0.5 shadow-md"
                        }`}>
                      <FiShoppingBag className="text-lg sm:text-xl" />
                      <span>
                        {product.stock === "out_of_stock"
                          ? t("Out of Stock")
                          : t("Add to Cart")}
                      </span>
                    </button>
                  )}

                  <button
                    onClick={handleFavorite}
                    className={`col-span-1 py-3.5 sm:py-4 rounded-xl font-semibold transition-all duration-300 border flex items-center justify-center ${isFavorite
                      ? "bg-red-50 text-red-500 border-red-200 hover:bg-red-100 shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50 shadow-sm"
                      }`}>
                    <FiHeart
                      className={`text-xl sm:text-2xl ${isFavorite ? "fill-current" : ""}`}
                    />
                  </button>

                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: product.name,
                          text: `${t('Check out')} ${product.name}`,
                          url: window.location.href,
                        });
                      } else {
                        navigator.clipboard.writeText(window.location.href);
                        toast.success(t("Link copied to clipboard"));
                      }
                    }}
                    className="col-span-1 py-3.5 sm:py-4 bg-white text-gray-700 border border-gray-200 rounded-xl font-semibold transition-all duration-300 hover:border-gray-300 hover:bg-gray-50 shadow-sm flex items-center justify-center">
                    <FiShare2 className="text-xl sm:text-2xl" />
                  </button>
                </div>

                {/* Description */}
                <div className="pt-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    {t('Product Description')}
                  </h3>
                  <div className="prose prose-sm lg:prose-base text-gray-600 leading-relaxed bg-gray-50 p-6 rounded-2xl border border-gray-100">
                    {product.description ? (
                      <p>{product.description}</p>
                    ) : (
                      <p>
                        {t('High-quality')} {product.name.toLowerCase()} {t('available in')} {t(product.unit || 'unit')}. {t('This product is carefully selected to ensure the best quality and freshness.')}
                      </p>
                    )}
                  </div>
                </div>

                {/* FAQs */}
                {translatedFaqs.length > 0 && (
                  <div className="pt-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      {t('Product FAQs')}
                    </h3>
                    <div className="space-y-3">
                      {translatedFaqs.map((faq, index) => (
                        <div
                          key={`${faq.question}-${index}`}
                          className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm"
                        >
                          <p className="text-sm font-bold text-gray-800 mb-2">
                            {faq.question}
                          </p>
                          <p className="text-sm text-gray-600 leading-relaxed">
                            {faq.answer}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Write Review */}
                {isAuthenticated && isMongoId(product?.id) && (
                  <div className="pt-6">
                    {eligibleDeliveredOrderId ? (
                      <ReviewForm
                        productId={product.id}
                        onSubmit={handleSubmitReview}
                      />
                    ) : (
                      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm text-gray-600">
                        {t('Reviews are available after product delivery.')}
                      </div>
                    )}
                  </div>
                )}

                {/* Reviews List */}
                {translatedProductReviews.length > 0 && (
                  <div className="pt-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      {t('Customer Reviews')} ({translatedProductReviews.length})
                    </h3>
                    <div className="space-y-4">
                      {translatedProductReviews.slice(0, 3).map((review) => (
                        <div key={review.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-xs font-bold text-gray-600">
                                {review.user.charAt(0)}
                              </div>
                              <span className="text-sm font-bold text-gray-900">
                                {review.user}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-sm text-gray-700">{review.rating}</span>
                              <FiStar className="text-yellow-400 fill-yellow-400 text-sm" />
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed pl-10">{review.comment}</p>
                          {review.vendorResponse && (
                            <div className="mt-3 ml-10 bg-primary-50 border border-primary-100 rounded-lg p-3">
                              <p className="text-xs font-semibold text-primary-700 mb-1">
                                {t('Response from Seller')}
                              </p>
                              <p className="text-sm text-gray-600 leading-relaxed">{review.vendorResponse}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Similar Products */}
          <div className="mt-12 sm:mt-16 px-4 lg:px-8">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">
              {similarProducts.length > 0 ? t('Similar Products') : t('You might also like')}
            </h3>
            {similarProducts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
                {similarProducts.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-8 text-center">
                <p className="text-gray-500 text-sm">{t('No similar products yet')}</p>
              </div>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileProductDetail;
