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
import { useSettingsStore } from "../../../shared/store/settingsStore";
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
import ExperienceBadge from "../../../shared/components/ExperienceBadge";
import ProductCard from "../../../shared/components/ProductCard";
import ProductGrid from "../../../shared/components/ProductGrid";
import ProductReviewCard from "../../../shared/components/ProductReviewCard";
import { Button, Rating, QuantitySelector, Accordion, Tabs, Avatar } from "../../../shared/components/ui";
import { getVariantSignature } from "../../../shared/utils/variant";
import BulkPricingTable from "../../../shared/components/Product/BulkPricingTable";
import {
  resolvePriceForQuantity,
  normalizeTiers,
  isBelowMinimumOrder,
} from "../../../shared/utils/resolvePriceForQuantity";
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

  // ── Wholesale bulk pricing (preview only; checkout re-derives server-side) ──
  const { settings } = useSettingsStore();
  const wholesaleMarketplaceEnabled = settings?.features?.wholesaleMarketplaceEnabled === true;
  const vendorWholesaleEnabled = wholesaleMarketplaceEnabled && vendor?.sellingChannels?.wholesale?.enabled === true;
  const wholesaleTiers = useMemo(
    () => (wholesaleMarketplaceEnabled ? normalizeTiers(product?.wholesale?.priceTiers) : []),
    [wholesaleMarketplaceEnabled, product?.wholesale?.priceTiers]
  );
  const variantBasePrice = useMemo(
    () => resolveVariantPrice(product, selectedVariant),
    [product, selectedVariant]
  );
  const bulkPricing = useMemo(
    () =>
      resolvePriceForQuantity(product, variantBasePrice, quantity, {
        vendorWholesaleEnabled,
      }),
    [product, variantBasePrice, quantity, vendorWholesaleEnabled]
  );
  const hasWholesale =
    wholesaleMarketplaceEnabled &&
    product?.wholesaleEnabled === true &&
    vendorWholesaleEnabled &&
    wholesaleTiers.length > 0;
  const isRetailAvailable = product?.retailEnabled !== false;
  const isWholesaleOnly = hasWholesale && !isRetailAvailable;
  const belowMinimumOrder = isBelowMinimumOrder(bulkPricing);

  // Wholesale-only products have a hard purchase floor. Hybrid products do not —
  // they simply fall back to retail pricing below the tier threshold.
  const minimumPurchaseQuantity = useMemo(() => {
    if (!isWholesaleOnly) return 1;
    const moqEnabled = product?.wholesale?.moqEnabled === true;
    const rawMoq = Number(product?.wholesale?.moq);
    const lowestTier = wholesaleTiers[0]?.minQty;
    const floor = moqEnabled && Number.isFinite(rawMoq) && rawMoq >= 1
      ? Math.max(rawMoq, lowestTier || 1)
      : lowestTier;
    return Number.isFinite(floor) && floor > 1 ? floor : 1;
  }, [isWholesaleOnly, product?.wholesale?.moqEnabled, product?.wholesale?.moq, wholesaleTiers]);

  // Open the page at a purchasable quantity instead of an unusable default of 1.
  useEffect(() => {
    if (minimumPurchaseQuantity > 1) {
      setQuantity((current) => (current < minimumPurchaseQuantity ? minimumPurchaseQuantity : current));
    }
  }, [minimumPurchaseQuantity, product?.id]);

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
    if (belowMinimumOrder) {
      toast.error(
        `${t('Minimum order for this product is')} ${bulkPricing.minimumQuantity} ${t('units')}`
      );
      return;
    }

    const resolvedFulfillmentType = (() => {
      if (product.fulfillmentType) return product.fulfillmentType;
      if (product.experience) return product.experience;
      if (product.quickCommerceEnabled || product.vendor?.vendorType === 'quick_commerce' || vendor?.vendorType === 'quick_commerce') return 'quick_commerce';
      if (product.wholesaleEnabled || product.vendor?.vendorType === 'wholesale' || vendor?.vendorType === 'wholesale') return 'wholesale';
      return 'retail';
    })();

    const addedToCart = addItem({
      id: product.id,
      name: product.name,
      // Base retail/variant price — the cart re-applies tier pricing by quantity.
      price: finalPrice,
      image: product.image,
      quantity: quantity,
      variant: selectedVariant,
      stockQuantity: effectiveStock,
      vendorId: product.vendorId,
      vendorName: vendor?.storeName || vendor?.name || product.vendorName,
      fulfillmentType: resolvedFulfillmentType,
      experience: resolvedFulfillmentType,
      quickCommerceEnabled: product.quickCommerceEnabled,
      // Wholesale snapshot so the cart can price tiers without a round-trip.
      retailEnabled: product.retailEnabled,
      wholesaleEnabled: product.wholesaleEnabled,
      wholesale: product.wholesale,
      vendorWholesaleEnabled,
      // Tax snapshot so the checkout preview matches the backend's per-product
      // tax arithmetic instead of assuming a flat rate.
      taxRate: product.taxRate,
      taxIncluded: product.taxIncluded,
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
        <div className="w-full pb-12 max-w-7xl mx-auto min-h-screen bg-surface-muted">
          {/* Back Button */}
          <div className="px-4 pt-2 sm:pt-4 lg:pt-6 lg:px-8 mb-2 sm:mb-4">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-surface border border-border shadow-xs text-content-secondary hover:text-content text-xs font-semibold hover:bg-surface-muted transition-all">
              <FiArrowLeft className="text-sm" />
              <span>{t('Back')}</span>
            </button>
          </div>

          <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-12 lg:px-8 lg:items-start">
            {/* Left Column: Product Image */}
            <div className="px-4 py-2 lg:p-0 lg:sticky lg:top-24">
              <ImageGallery images={productImages} productName={product.name} />
              {product.flashSale && (
                <div className="mt-3 flex justify-center lg:justify-start">
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
                        className="inline-flex items-center gap-3 px-4 py-2 bg-surface hover:bg-surface-muted text-content-secondary rounded-full transition-all duration-300 border border-border group">
                        {/* Vendor Logo */}
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-surface border border-border flex-shrink-0 flex items-center justify-center">
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
                            className="w-full h-full bg-brand-primary text-black flex items-center justify-center text-[10px] font-bold"
                            style={{ display: stableVendorLogo ? "none" : "flex" }}>
                            <FiShoppingBag />
                          </div>
                        </div>

                        <span className="font-medium text-sm group-hover:text-brand-primary transition-colors">
                          {translatedVendor?.storeName || translatedVendor?.name || product.vendorName}
                        </span>
                        {translatedVendor?.isVerified && (
                          <FiCheckCircle
                            className="text-status-info text-sm"
                            title={t("Verified Vendor")}
                          />
                        )}
                        <span className="text-content-muted group-hover:translate-x-1 transition-transform">{"->"}</span>
                      </Link>
                    </div>
                  )}
                  {brand && (
                    <div className="mb-4">
                      <Link
                        to={`/brand/${brand.id}`}
                        className="inline-flex items-center gap-3 px-4 py-2 bg-surface hover:bg-surface-muted text-content-secondary rounded-full transition-all duration-300 border border-border group">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-surface border border-border flex-shrink-0 flex items-center justify-center">
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
                            className="w-full h-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-[10px]"
                            style={{ display: stableBrandLogo ? "none" : "flex" }}>
                            {(translatedBrand?.name || brand.name)?.[0]?.toUpperCase()}
                          </div>
                        </div>
                        <span className="font-medium text-sm group-hover:text-brand-primary transition-colors">
                          {translatedBrand?.name || product.brandName}
                        </span>
                        <span className="text-content-muted group-hover:translate-x-1 transition-transform">{"->"}</span>
                      </Link>
                    </div>
                  )}

                  <h1 className="text-2xl lg:text-4xl font-extrabold text-content mb-4 leading-tight">
                    {product.name}
                  </h1>

                  {/* Contextual Experience Specs Banner */}
                  <div className="mb-5 p-4 rounded-2xl bg-surface border border-border space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <ExperienceBadge experience={product.experience || (product.quickCommerceEnabled ? 'quick_commerce' : product.wholesaleEnabled ? 'wholesale' : 'marketplace')} size="md" />
                      <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">Experience Specific Specs</span>
                    </div>

                    {(product.quickCommerceEnabled || product.experience === 'quick_commerce') ? (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-700 dark:text-amber-300">
                          <span className="font-semibold block text-[11px] uppercase">ETA Window</span>
                          <span className="font-bold">15–30 Mins Express</span>
                        </div>
                        <div className="p-2 bg-surface-muted rounded-xl border border-border text-content-secondary">
                          <span className="font-semibold block text-[11px] uppercase">Max Order Qty</span>
                          <span className="font-bold">{product.quickCommerce?.maxQuantityPerOrder || 5} units</span>
                        </div>
                        <div className="p-2 bg-surface-muted rounded-xl border border-border text-content-secondary">
                          <span className="font-semibold block text-[11px] uppercase">Perishable Item</span>
                          <span className="font-bold">{product.quickCommerce?.isPerishable ? 'Yes (Refund Only)' : 'No'}</span>
                        </div>
                        <div className="p-2 bg-surface-muted rounded-xl border border-border text-content-secondary">
                          <span className="font-semibold block text-[11px] uppercase">Return Policy</span>
                          <span className="font-bold">{product.quickCommerce?.isPerishable ? 'Refund on damaged delivery' : '24-Hour QC Window'}</span>
                        </div>
                      </div>
                    ) : (hasWholesale || product.wholesaleEnabled) ? (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-purple-500/10 rounded-xl border border-purple-500/20 text-purple-700 dark:text-purple-300">
                          <span className="font-semibold block text-[11px] uppercase">B2B Wholesale</span>
                          <span className="font-bold">MOQ: {minimumPurchaseQuantity} units</span>
                        </div>
                        <div className="p-2 bg-surface-muted rounded-xl border border-border text-content-secondary">
                          <span className="font-semibold block text-[11px] uppercase">Tax Invoice</span>
                          <span className="font-bold">GST Invoice Included</span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                          <span className="font-semibold block text-[11px] uppercase">Shipping</span>
                          <span className="font-bold">Standard 2–5 Days</span>
                        </div>
                        <div className="p-2 bg-surface-muted rounded-xl border border-border text-content-secondary">
                          <span className="font-semibold block text-[11px] uppercase">Return Window</span>
                          <span className="font-bold">7-Day Return Policy</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rating & Reviews */}
                  {!!product.rating && (
                    <div className="flex items-center gap-4 mb-6">
                      <Rating value={product.rating} readOnly showValue size="md" />
                      <span className="text-content-muted text-sm font-medium">
                        {product.reviewCount || 0} {t('Reviews')}
                      </span>
                      <span className="text-content-muted">|</span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-card ${
                        product.stock === "in_stock" ? "bg-status-success/15 text-status-success" : "bg-status-error/15 text-status-error"
                      }`}>
                        {product.stock === "in_stock" ? t("In Stock") : product.stock === "low_stock" ? t("Low Stock") : t("Out of Stock")}
                      </span>
                    </div>
                  )}

                  <div className="bg-surface rounded-card p-6 mb-8 border border-border shadow-card">
                    <div className="flex items-end gap-3 mb-2">
                      <Price amount={currentPrice} className="text-4xl font-extrabold text-content" />
                      {product.originalPrice && (
                        <Price amount={product.originalPrice} className="text-xl text-content-muted line-through font-medium mb-1.5" />
                      )}
                    </div>
                    {product.originalPrice && (
                      <div className="flex items-center gap-2">
                        <span className="text-brand-primary font-bold bg-brand-primary/15 px-3 py-1 rounded-full text-sm">
                          {calculateDiscount(product.originalPrice, currentPrice)}% {t('OFF')}
                        </span>
                        <span className="text-sm text-content-muted">{t('Best price guaranteed')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Variants & Quantity */}
                <div className="space-y-4 pb-4 border-b border-border">
                  {product.variants && (
                    <VariantSelector
                      variants={product.variants}
                      onVariantChange={setSelectedVariant}
                      currentPrice={product.price}
                    />
                  )}

                  <div>
                    <label className="block text-sm font-bold text-content mb-3">
                      {t('Quantity')}
                    </label>
                    <div className="flex items-center gap-4">
                      <QuantitySelector
                        value={quantity}
                        onChange={setQuantity}
                        min={minimumPurchaseQuantity}
                        max={selectedAvailableStock || 10}
                        size="lg"
                      />
                      <span className="text-xs text-content-muted font-medium">
                        {selectedAvailableStock} {t(product.unit || 'unit')}{(selectedAvailableStock !== 1 && product.unit === 'item') ? 's' : ''} {t('available')}
                      </span>
                    </div>
                  </div>

                  {/* Wholesale bulk pricing */}
                  {hasWholesale && (
                    <BulkPricingTable
                      tiers={wholesaleTiers}
                      pricing={bulkPricing}
                      retailPrice={variantBasePrice}
                      showRetailRow={isRetailAvailable}
                    />
                  )}

                  {belowMinimumOrder && (
                    <p className="text-sm font-semibold text-status-error">
                      {t('Minimum Order')}: {bulkPricing.minimumQuantity} {t('Units')}
                    </p>
                  )}
                </div>

                {/* PRODUCT ACTIONS */}
                <div className="flex items-center gap-3 w-full py-2">
                  {isInCart ? (
                    <Button
                      variant="danger"
                      size="lg"
                      fullWidth
                      onClick={handleRemoveFromCart}
                      leftIcon={<FiTrash2 />}
                    >
                      {t('Remove from Cart')}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      disabled={product.stock === "out_of_stock" || belowMinimumOrder}
                      onClick={handleAddToCart}
                      leftIcon={<FiShoppingBag />}
                    >
                      {product.stock === "out_of_stock"
                        ? t("Out of Stock")
                        : belowMinimumOrder
                          ? `${t("Minimum Order")}: ${bulkPricing.minimumQuantity} ${t("Units")}`
                          : t("Add to Cart")}
                    </Button>
                  )}

                  <Button
                    variant={isFavorite ? 'danger' : 'outline'}
                    size="lg"
                    onClick={handleFavorite}
                    aria-label="Add to wishlist"
                    leftIcon={<FiHeart className={isFavorite ? 'fill-current' : ''} />}
                  />

                  <Button
                    variant="outline"
                    size="lg"
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
                    aria-label="Share product"
                    leftIcon={<FiShare2 />}
                  />
                </div>

                {/* Description */}
                <div className="pt-6">
                  <h3 className="text-lg font-bold text-content mb-4">
                    {t('Product Description')}
                  </h3>
                  <div className="prose prose-sm lg:prose-base text-content-secondary leading-relaxed bg-surface p-6 rounded-2xl border border-border">
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
                    <h3 className="text-lg font-bold text-content mb-4">
                      {t('Product FAQs')}
                    </h3>
                    <div className="space-y-3">
                      {translatedFaqs.map((faq, index) => (
                        <div
                          key={`${faq.question}-${index}`}
                          className="bg-surface border border-border rounded-xl p-4 shadow-sm"
                        >
                          <p className="text-sm font-bold text-content mb-2">
                            {faq.question}
                          </p>
                          <p className="text-sm text-content-secondary leading-relaxed">
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
                      <div className="bg-surface border border-border rounded-2xl p-4 text-sm text-content-secondary">
                        {t('Reviews are available after product delivery.')}
                      </div>
                    )}
                  </div>
                )}

                {/* Reviews List */}
                {translatedProductReviews.length > 0 && (
                  <div className="pt-6">
                    <h3 className="text-lg font-bold text-content mb-4">
                      {t('Customer Reviews')} ({translatedProductReviews.length})
                    </h3>
                    <div className="space-y-4">
                      {translatedProductReviews.slice(0, 3).map((review) => (
                        <ProductReviewCard
                          key={review.id}
                          user={review.user}
                          rating={review.rating}
                          comment={review.comment}
                          date={review.date}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Similar Products Grid */}
          <div className="mt-12 sm:mt-16 px-4 lg:px-8">
            <h3 className="text-xl sm:text-2xl font-bold text-textColor-primary mb-6">
              {similarProducts.length > 0 ? t('Similar Products') : t('You might also like')}
            </h3>
            <ProductGrid
              products={similarProducts}
              loading={isLoadingProduct}
              emptyTitle={t('No similar products yet')}
              emptyDescription={t('Browse our catalog for related items.')}
            />
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileProductDetail;
