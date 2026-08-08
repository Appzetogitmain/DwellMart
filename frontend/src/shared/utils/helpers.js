/**
 * Format price with currency symbol
 */
export const formatPrice = (price, currency = "₹") => {
  const numPrice = Number(price ?? 0);
  return `${currency}${numPrice.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Truncate text to specified length
 */
export const truncateText = (text, length = 50) => {
  if (text.length <= length) return text;
  return text.substring(0, length) + "...";
};

/**
 * Debounce function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Calculate discount percentage
 */
export const calculateDiscount = (originalPrice, discountedPrice) => {
  return Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);
};

/**
 * Validate email
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number with country code support
 */
export const isValidPhone = (phone, countryCode = "+91") => {
  if (!phone) return false;
  const digitsOnly = String(phone).replace(/\D/g, "");

  switch (countryCode) {
    case "+91": // India
      return /^[6-9]\d{9}$/.test(digitsOnly);
    case "+1": // USA / Canada
      return /^[2-9]\d{9}$/.test(digitsOnly);
    case "+880": // Bangladesh
      return /^1[3-9]\d{8}$/.test(digitsOnly);
    case "+44": // UK
      return /^7\d{9}$/.test(digitsOnly);
    case "+971": // UAE
      return /^5\d{8}$/.test(digitsOnly);
    case "+966": // Saudi Arabia
      return /^5\d{8}$/.test(digitsOnly);
    default:
      return /^\d{8,12}$/.test(digitsOnly);
  }
};

/**
 * Get image URL (with fallback)
 */
export const getImageUrl = (image, fallback = "/placeholder.jpg") => {
  if (!image || typeof image !== "string") return fallback;
  
  // If it's already a full URL or a data URI, return as is
  if (image.startsWith("data:") || image.startsWith("http")) return image;
  
  // Skip prepending for local frontend assets (Vite dev server or public folder)
  // Check for common Vite patterns and relative paths
  if (
    image.startsWith("/src/") || 
    image.startsWith("/assets/") || 
    image.startsWith("/@fs/") || 
    image.startsWith("/@vite/") ||
    image.startsWith("../") || 
    image.startsWith("./")
  ) {
    return image;
  }

  const getBase = () => {
    if (import.meta.env.VITE_IMAGE_BASE_URL) return import.meta.env.VITE_IMAGE_BASE_URL;
    if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
      return window.location.origin;
    }
    return "http://localhost:5000";
  };
  const baseUrl = getBase();
  // Clean up the image path - only prepend if it doesn't look like a frontend-only path
  const cleanPath = image.startsWith("/") ? image.substring(1) : image;
  return `${baseUrl}/${cleanPath}`;
};

/**
 * Generate a placeholder image as SVG data URI
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {string} text - Text to display on placeholder
 * @param {string} bgColor - Background color (hex or color name)
 * @param {string} textColor - Text color (hex or color name)
 * @returns {string} SVG data URI
 */
export const getPlaceholderImage = (
  width = 200,
  height = 200,
  text = "Image",
  bgColor = "#e5e7eb",
  textColor = "#9ca3af"
) => {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bgColor}"/>
      <text 
        x="50%" 
        y="50%" 
        font-family="Arial, sans-serif" 
        font-size="${Math.min(width, height) / 8}" 
        fill="${textColor}" 
        text-anchor="middle" 
        dominant-baseline="middle"
      >${text}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${btoa(svg)}`;
};
