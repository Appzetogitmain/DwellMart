import {
  products as staticProducts,
  getRecommendedProducts as getStaticRecommendedProducts,
} from "../../../data/products";
import { vendors as staticVendors } from "../../../data/vendors";
import { brands as staticBrands } from "../../../data/brands";
import { getImageUrl } from "../../../shared/utils/helpers";

const PRODUCTS_CACHE_KEY = "user-catalog-products-cache";
const VENDORS_CACHE_KEY = "user-catalog-vendors-cache";
const BRANDS_CACHE_KEY = "user-catalog-brands-cache";

const normalizeId = (value) => String(value ?? "").trim();

const parseCache = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

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

  const id = normalizeId(raw?.id || raw?._id);
  const vendorId = normalizeId(vendorObj?._id || vendorObj?.id || raw?.vendorId);
  const brandId = normalizeId(brandObj?._id || brandObj?.id || raw?.brandId);
  const categoryId = normalizeId(
    categoryObj?._id || categoryObj?.id || raw?.categoryId
  );

  const rawImage = raw?.image || raw?.mainImage || raw?.thumbnail || raw?.images?.[0] || "";
  const image = getImageUrl(rawImage);
  const images = (Array.isArray(raw?.images) ? raw.images : [rawImage])
    .filter(Boolean)
    .map(img => getImageUrl(img));

  const price = Number(raw?.price) || 0;
  const originalPrice = raw?.originalPrice !== undefined ? Number(raw.originalPrice) : undefined;
  
  // Ensure original price is always >= selling price for display logic
  const validOriginalPrice = originalPrice && originalPrice > price ? originalPrice : undefined;

  return {
    ...raw,
    id,
    _id: id,
    vendorId,
    vendor: vendorObj ? normalizeVendor(vendorObj) : null,
    vendorName: raw?.vendorName || vendorObj?.storeName || vendorObj?.name || "",
    brandId,
    brand: brandObj ? normalizeBrand(brandObj) : null,
    brandName: raw?.brandName || brandObj?.name || "",
    categoryId,
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image,
    images,
    price,
    originalPrice: validOriginalPrice,
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
    isActive: raw?.isActive !== false,
    flashSale: !!raw?.flashSale,
    isNew: !!raw?.isNewArrival,
  };
};

const normalizeVendor = (raw) => {
  const id = normalizeId(raw?.id || raw?._id);
  const storeLogo = getImageUrl(raw?.storeLogo || raw?.logo || raw?.image);
  return {
    ...raw,
    id,
    _id: id,
    storeLogo,
    isVerified: !!raw?.isVerified,
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
    totalProducts: Number(raw?.totalProducts) || 0,
    status: raw?.status || "approved",
  };
};

const normalizeBrand = (raw) => {
  const id = normalizeId(raw?.id || raw?._id);
  const logo = getImageUrl(raw?.logo || raw?.image || raw?.brandLogo);
  return {
    ...raw,
    id,
    _id: id,
    name: raw?.name || "",
    logo,
  };
};

export const getCatalogProducts = () => {
  const cached = parseCache(PRODUCTS_CACHE_KEY);
  const source = (Array.isArray(cached) && cached.length > 0) ? cached : staticProducts;
  return source.map(normalizeProduct).filter((p) => p.id);
};

export const getCatalogVendors = () => {
  const cached = parseCache(VENDORS_CACHE_KEY);
  const source = (Array.isArray(cached) && cached.length > 0) ? cached : staticVendors;
  return source.map(normalizeVendor).filter((v) => v.id);
};

export const getCatalogBrands = () => {
  const cached = parseCache(BRANDS_CACHE_KEY);
  const source = (Array.isArray(cached) && cached.length > 0) ? cached : staticBrands;
  return source.map(normalizeBrand).filter((b) => b.id);
};

export const getProductById = (id) =>
  getCatalogProducts().find((p) => normalizeId(p.id) === normalizeId(id));

export const getProductsByVendor = (vendorId) =>
  getCatalogProducts().filter(
    (p) => normalizeId(p.vendorId) === normalizeId(vendorId)
  );

export const getProductsByBrand = (brandId) =>
  getCatalogProducts().filter(
    (p) => normalizeId(p.brandId) === normalizeId(brandId)
  );

export const getMostPopular = (limit = 10) =>
  [...getCatalogProducts()]
    .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0))
    .slice(0, limit);

export const getTrending = (limit = 10) =>
  [...getCatalogProducts()]
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, limit);

export const getFlashSale = () =>
  getCatalogProducts().filter((p) => p.flashSale);

export const getAllNewArrivals = () =>
  getCatalogProducts().filter((p) => p.isNew);

export const getNewArrivals = (limit = 8) =>
  getAllNewArrivals().slice(0, limit);

export const getOffers = () =>
  getCatalogProducts().filter(
    (p) =>
      p.originalPrice !== undefined &&
      Number(p.originalPrice) > Number(p.price || 0)
  );

export const getDailyDeals = () => {
  const flashSaleProducts = getFlashSale();
  const discountedProducts = getCatalogProducts().filter(
    (p) =>
      p.originalPrice !== undefined &&
      Number(p.originalPrice) > Number(p.price || 0) &&
      !p.flashSale
  );
  const allDeals = [...flashSaleProducts, ...discountedProducts.slice(0, 5)];
  return allDeals.filter(
    (p, idx, arr) => idx === arr.findIndex((x) => normalizeId(x.id) === normalizeId(p.id))
  );
};

export const getSimilarProducts = (currentProductId, limit = 6) => {
  const products = getCatalogProducts();
  const currentProduct = products.find(
    (p) => normalizeId(p.id) === normalizeId(currentProductId)
  );
  if (!currentProduct) return [];

  const sameCategory = products.filter(
    (p) =>
      normalizeId(p.id) !== normalizeId(currentProduct.id) &&
      normalizeId(p.categoryId) === normalizeId(currentProduct.categoryId)
  );

  if (sameCategory.length >= limit) return sameCategory.slice(0, limit);

  const remaining = products.filter(
    (p) =>
      normalizeId(p.id) !== normalizeId(currentProduct.id) &&
      !sameCategory.some((x) => normalizeId(x.id) === normalizeId(p.id))
  );

  return [...sameCategory, ...remaining].slice(0, limit);
};

export const getRecommendedProducts = (limit = 6) => {
  const products = getCatalogProducts();
  if (!products.length) return getStaticRecommendedProducts(limit);
  return [...products].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, limit);
};

const DUMMY_STORE_REGEX = /test|sptest|qwerty|qa\s|audit|seeded|demo|dummy|sample|free\s*vendor|^sk\s*store|^sagar\s*store/i;

export const getVendorById = (id) =>
  getCatalogVendors().find((v) => normalizeId(v.id) === normalizeId(id));

export const getApprovedVendors = () =>
  getCatalogVendors().filter(
    (v) => v.status === "approved" && !DUMMY_STORE_REGEX.test(v.storeName || v.name || "")
  );

export const getBrandById = (id) =>
  getCatalogBrands().find((b) => normalizeId(b.id) === normalizeId(id));
