/**
 * Image path mapping utility
 * Maps /images/... paths to imported images from the data folder
 */

// Product images
import whiteTShirt from "../../../data/products/white t shirt.png";
import blueJeans from "../../../data/products/blue jeans.png";
import summerDress from "../../../data/products/summer dress.png";
import leatherBag from "../../../data/products/leather bag.png";
import sneakers from "../../../data/products/sneakers.png";
import sunglass from "../../../data/products/sunglass.png";
import winterScarf from "../../../data/products/winter scarf.png";
import blazer from "../../../data/products/blazer.png";
import denimJacket from "../../../data/products/denim jacket.png";
import heals from "../../../data/products/heals.png";
import trackPants from "../../../data/products/track pants.png";
import sweater from "../../../data/products/sweater.png";
import leatherBoots from "../../../data/products/leather boots.png";
import stylishWatch from "../../../data/products/stylish watch.png";
import gown from "../../../data/products/gown.png";
import shirt from "../../../data/products/shirt.png";
import maxi from "../../../data/products/maxi.png";
import neckless from "../../../data/products/neckless.png";
import athlaticShoes from "../../../data/products/athlatic shoes.png";
import belt from "../../../data/products/belt.png";

// Brand logos
import zaraLogo from "../../../data/brands/zara.png";
import forever21Logo from "../../../data/brands/forever 21.png";
import pumaLogo from "../../../data/brands/puma.png";
import levisLogo from "../../../data/brands/levi's.png";
import tommyHilfigerLogo from "../../../data/brands/Tommy hilfiger.png";
import fabindiaLogo from "../../../data/brands/fabindia.png";
import bibaLogo from "../../../data/brands/biba.png";
import manyavarLogo from "../../../data/brands/manyavar.png";
import allenSollyLogo from "../../../data/brands/allen solly.png";
import pantaloonsLogo from "../../../data/brands/pantaloons.png";

// Category images
import clothingCategory from "../../../data/categories/clothing.png";
import shoesCategory from "../../../data/categories/shoes.png";
import bagsCategory from "../../../data/categories/bags.png";
import jeweleryCategory from "../../../data/categories/jewelery.png";
import accessoriesCategory from "../../../data/categories/accessories.png";
import athleticsCategory from "../../../data/categories/Athletics.png";

// Logo images
import appLogo from "../../../data/logos/ChatGPT Image Dec 2, 2025, 03_01_19 PM.png";
import loginLogo from "../../../data/logos/login_logo.png";

// Hero images
import heroSlide1 from "../../../data/hero/slide1.png";
import heroSlide2 from "../../../data/hero/slide2.png";
import heroSlide3 from "../../../data/hero/slide3.png";
import heroSlide4 from "../../../data/hero/slide4.png";
import heroBanner2 from "../../../data/hero/banner2.png";

// Banner images
import babycareBanner from "../../../data/banners/babycare-WEB.avif";
import pharmacyBanner from "../../../data/banners/pharmacy-WEB.avif";
import petCareBanner from "../../../data/banners/Pet-Care_WEB.avif";

// Promotional images
import beautyPromo from "../../../data/promotional/beauty.jpg";
import healthPromo from "../../../data/promotional/health.jpg";
import kitchenPromo from "../../../data/promotional/kitchen.jpg";

/**
 * Mapping object that converts /images/... paths to imported image URLs
 */
export const imageMap = {
  // Products
  "/images/products/white t shirt.png": whiteTShirt,
  "/images/products/blue jeans.png": blueJeans,
  "/images/products/summer dress.png": summerDress,
  "/images/products/leather bag.png": leatherBag,
  "/images/products/sneakers.png": sneakers,
  "/images/products/sunglass.png": sunglass,
  "/images/products/winter scarf.png": winterScarf,
  "/images/products/blazer.png": blazer,
  "/images/products/denim jacket.png": denimJacket,
  "/images/products/heals.png": heals,
  "/images/products/track pants.png": trackPants,
  "/images/products/sweater.png": sweater,
  "/images/products/leather boots.png": leatherBoots,
  "/images/products/stylish watch.png": stylishWatch,
  "/images/products/gown.png": gown,
  "/images/products/shirt.png": shirt,
  "/images/products/maxi.png": maxi,
  "/images/products/neckless.png": neckless,
  "/images/products/athlatic shoes.png": athlaticShoes,
  "/images/products/belt.png": belt,

  // Brands
  "/images/brands/zara.png": zaraLogo,
  "/images/brands/forever 21.png": forever21Logo,
  "/images/brands/puma.png": pumaLogo,
  "/images/brands/levi's.png": levisLogo,
  "/images/brands/Tommy hilfiger.png": tommyHilfigerLogo,
  "/images/brands/fabindia.png": fabindiaLogo,
  "/images/brands/biba.png": bibaLogo,
  "/images/brands/manyavar.png": manyavarLogo,
  "/images/brands/allen solly.png": allenSollyLogo,
  "/images/brands/pantaloons.png": pantaloonsLogo,

  // Categories
  "/images/categories/clothing.png": clothingCategory,
  "/images/categories/shoes.png": shoesCategory,
  "/images/categories/bags.png": bagsCategory,
  "/images/categories/jewelery.png": jeweleryCategory,
  "/images/categories/accessories.png": accessoriesCategory,
  "/images/categories/Athletics.png": athleticsCategory,

  // Logos
  "/images/logos/logo.png": appLogo,
  "/images/logos/ChatGPT Image Dec 2, 2025, 03_01_19 PM.png": appLogo,

  // Hero
  "/images/hero/slide1.png": heroSlide1,
  "/images/hero/slide2.png": heroSlide2,
  "/images/hero/slide3.png": heroSlide3,
  "/images/hero/slide4.png": heroSlide4,
  "/images/hero/banner2.png": heroBanner2,

  // Banners
  "/images/banners/babycare-WEB.avif": babycareBanner,
  "/images/banners/pharmacy-WEB.avif": pharmacyBanner,
  "/images/banners/Pet-Care_WEB.avif": petCareBanner,

  // Promotional
  "/images/promotional/beauty.jpg": beautyPromo,
  "/images/promotional/health.jpg": healthPromo,
  "/images/promotional/kitchen.jpg": kitchenPromo,
};

/**
 * Get image path - converts /images/... paths to imported image URLs
 * @param {string} path - The image path (e.g., '/images/products/shirt.png')
 * @param {string} fallback - Fallback path if image not found
 * @returns {string} - The imported image URL or fallback
 */
export const getImagePath = (path, fallback = null) => {
  if (!path) return fallback || appLogo;
  if (path.startsWith("http")) return path; // External URLs
  return imageMap[path] || fallback || appLogo;
};

/**
 * Direct image exports for use in components
 */
export const productImages = {
  whiteTShirt,
  blueJeans,
  summerDress,
  leatherBag,
  sneakers,
  sunglass,
  winterScarf,
  blazer,
  denimJacket,
  heals,
  trackPants,
  sweater,
  leatherBoots,
  stylishWatch,
  gown,
  shirt,
  maxi,
  neckless,
  athlaticShoes,
  belt,
};

export const brandLogos = {
  zara: zaraLogo,
  forever21: forever21Logo,
  puma: pumaLogo,
  levis: levisLogo,
  tommyHilfiger: tommyHilfigerLogo,
  fabindia: fabindiaLogo,
  biba: bibaLogo,
  manyavar: manyavarLogo,
  allenSolly: allenSollyLogo,
  pantaloons: pantaloonsLogo,
};

export const categoryImages = {
  clothing: clothingCategory,
  shoes: shoesCategory,
  bags: bagsCategory,
  jewelery: jeweleryCategory,
  accessories: accessoriesCategory,
  athletics: athleticsCategory,
};

export const heroImages = {
  slide1: heroSlide1,
  slide2: heroSlide2,
  slide3: heroSlide3,
  slide4: heroSlide4,
  banner2: heroBanner2,
};

export const bannerImages = {
  babycare: babycareBanner,
  pharmacy: pharmacyBanner,
  petCare: petCareBanner,
};

export const promotionalImages = {
  beauty: beautyPromo,
  health: healthPromo,
  kitchen: kitchenPromo,
};

export { appLogo as defaultLogo, loginLogo };

