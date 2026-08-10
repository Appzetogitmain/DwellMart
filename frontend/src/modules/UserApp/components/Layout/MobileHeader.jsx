import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  FiShoppingBag,
  FiMenu,
} from "react-icons/fi";
import { Link, useNavigate, useLocation } from "react-router-dom";
import MobileMenu from "./MobileMenu";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useAuthStore } from "../../../../shared/store/authStore";
import { appLogo } from "../../../../data/logos";
import { loginLogo } from "../../../../shared/utils/imagePaths";
import { motion } from "framer-motion";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import SearchBar from "../../../../shared/components/SearchBar";
import MobileCategoryIcons from "../Mobile/MobileCategoryIcons";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";

// Category gradient mapping - Very subtle pastel colors
const categoryGradients = {
  1: "from-pink-50 via-rose-50 to-pink-100", // Clothing - Pinkish
  2: "from-amber-50 via-amber-100 to-yellow-50", // Footwear - Brownish
  3: "from-orange-50 via-orange-100 to-orange-50", // Bags - Orangeish
  4: "from-green-50 via-emerald-50 to-teal-50", // Jewelry - Greenish
  5: "from-purple-50 via-purple-100 to-indigo-50", // Accessories - Purple
  6: "from-blue-50 via-cyan-50 to-teal-50", // Athletic
};

const MobileHeader = ({ hideSellButton = false }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCartAnimation, setShowCartAnimation] = useState(false);
  const [positionsReady, setPositionsReady] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [animationPositions, setAnimationPositions] = useState({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });
  const [isTopRowVisible, setIsTopRowVisible] = useState(true);
  const [topRowHeight, setTopRowHeight] = useState(70);
  const lastScrollYRef = useRef(0);
  const topRowRef = useRef(null);
  const userMenuRef = useRef(null);
  const logoRef = useRef(null);
  const cartRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const itemCount = useCartStore((state) => state.getItemCount());
  const toggleCart = useUIStore((state) => state.toggleCart);
  const cartAnimationTrigger = useUIStore(
    (state) => state.cartAnimationTrigger
  );
  const { user, isAuthenticated, logout } = useAuthStore();
  const { getTranslatedText: t } = usePageTranslation(["Sell On Dwell Mart", "Home", "Shop", "Categories", "Offers", "Track Order", "Search"]);

  // Get current category from URL (supports both /category/:id and legacy /app/category/:id)
  const getCurrentCategoryId = () => {
    const match = location.pathname.match(/\/(?:app\/)?category\/([^/]+)/);
    return match ? String(match[1]) : null;
  };

  const currentCategoryId = getCurrentCategoryId();

  // Get current page from location
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === "/" || path === "/home") return "home";
    if (path.startsWith("/product/")) return "product";
    if (path.startsWith("/category/")) return "category";
    if (path === "/search") return "search";
    if (path === "/wishlist") return "wishlist";
    if (path === "/profile") return "profile";
    if (path === "/orders") return "orders";
    if (path.startsWith("/orders/")) return "orderDetail";
    if (path === "/checkout") return "checkout";
    if (path === "/offers") return "offers";
    if (path === "/daily-deals") return "dailyDeals";
    if (path === "/flash-sale") return "flashSale";
    if (path.startsWith("/seller/")) return "vendor";
    return "default";
  };

  const currentPage = getCurrentPage();

  // Header background is now black
  const headerBackground = "rgb(0, 0, 0)";

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Measure top row height
  useEffect(() => {
    const measureTopRow = () => {
      if (topRowRef.current) {
        const height = topRowRef.current.offsetHeight;
        setTopRowHeight(height);
      }
    };

    measureTopRow();
    window.addEventListener("resize", measureTopRow);
    return () => window.removeEventListener("resize", measureTopRow);
  }, []);

  // Handle scroll to hide/show top row with smooth hysteresis threshold to prevent glitching
  useEffect(() => {
    let ticking = false;
    const SCROLL_THRESHOLD = 15; // Minimum scroll delta before toggling header visibility

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const lastScrollY = lastScrollYRef.current;
          const diff = currentScrollY - lastScrollY;

          // Always visible near top of page
          if (currentScrollY <= 15) {
            setIsTopRowVisible(true);
            lastScrollYRef.current = currentScrollY;
          } else if (diff > SCROLL_THRESHOLD && currentScrollY > 60) {
            // Scrolling down past threshold -> hide header
            setIsTopRowVisible(false);
            lastScrollYRef.current = currentScrollY;
          } else if (diff < -SCROLL_THRESHOLD) {
            // Scrolling up past threshold -> show header
            setIsTopRowVisible(true);
            lastScrollYRef.current = currentScrollY;
          }

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Calculate animation positions after component mounts
  useEffect(() => {
    const calculatePositions = () => {
      if (logoRef.current && cartRef.current) {
        const logoRect = logoRef.current.getBoundingClientRect();
        const cartRect = cartRef.current.getBoundingClientRect();

        const positions = {
          startX: logoRect.left + logoRect.width / 2,
          startY: logoRect.top + logoRect.height / 2,
          endX: cartRect.left + cartRect.width / 2,
          endY: cartRect.top + cartRect.height / 2,
        };

        // Only set positions if they're valid and animation hasn't played yet
        if (
          positions.startX > 0 &&
          positions.endX > 0 &&
          positions.startY > 0 &&
          positions.endY > 0 &&
          !hasPlayed
        ) {
          setAnimationPositions(positions);
          setPositionsReady(true);
          // Start animation once positions are ready
          setShowCartAnimation(true);
          setHasPlayed(true);
        }
      }
    };

    // Calculate positions after delays to ensure elements are rendered
    const timer1 = setTimeout(calculatePositions, 100);
    const timer2 = setTimeout(calculatePositions, 500);
    const timer3 = setTimeout(calculatePositions, 1000);

    // Recalculate on resize
    window.addEventListener("resize", calculatePositions);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      window.removeEventListener("resize", calculatePositions);
    };
  }, [hasPlayed]);

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate("/");
  };

  // Animation content - straight line movement only, starting from behind logo
  const shouldShowAnimation =
    showCartAnimation &&
    positionsReady &&
    animationPositions.startX > 0 &&
    animationPositions.endX > 0;

  const animationContent = shouldShowAnimation ? (
    <motion.div
      className="fixed pointer-events-none"
      style={{
        left: 0,
        top: 0,
        zIndex: 10000, // Above navbar but will be behind logo due to stacking context
        willChange: "transform, opacity",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
      initial={{
        x: animationPositions.startX - 24,
        y: animationPositions.startY - 24,
        scale: 0.8,
        opacity: 0,
      }}
      animate={{
        x: animationPositions.endX - 24,
        y: animationPositions.endY - 24,
        scale: [0.8, 1, 1.05, 0.95],
        opacity: [0, 1, 1, 0.8, 0],
      }}
      transition={{
        duration: 4,
        ease: [0.25, 0.1, 0.25, 1],
        times: [0, 0.1, 0.7, 0.9, 1],
        type: "tween",
      }}
      onAnimationComplete={() => {
        setShowCartAnimation(false);
      }}>
      <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center">
        <DotLottieReact
          src="https://lottie.host/083a2680-e854-4006-a50b-674276be82cd/oQMRcuZUkS.lottie"
          autoplay
          loop={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </motion.div>
  ) : null;

  const headerContent = (
    <motion.header
      key="mobile-header" // Stable key to prevent re-mounting
      className="fixed top-0 left-0 right-0 z-[9999] shadow-lg overflow-visible md:hidden h-16"
      style={{
        background: headerBackground,
        transition: "background 0.5s ease-in-out",
      }}
      initial={false}
      animate={{
        y: isTopRowVisible ? 0 : -(topRowHeight + 12),
      }}
      transition={{
        duration: 0.25,
        ease: [0.25, 0.1, 0.25, 1.0],
      }}>
      <div className="px-4 h-full flex items-center overflow-visible">
        {/* First Row: Logo and Actions */}
        <motion.div
          ref={topRowRef}
          className="flex items-center justify-between w-full gap-3 overflow-visible"
          initial={false}
          animate={{
            opacity: isTopRowVisible ? 1 : 0,
          }}
          transition={{
            duration: 0.2,
            ease: "easeInOut",
          }}
          style={{
            pointerEvents: isTopRowVisible ? "auto" : "none",
          }}>
          {/* Hamburger Menu Icon */}
          <button
            onClick={() => setIsMenuOpen(true)}
            className="p-2 -ml-2 text-gray-200 hover:text-white transition-colors relative z-[10001]"
            aria-label="Open menu"
          >
            <FiMenu className="text-2xl" />
          </button>

          {/* Logo and Marketplace Badge */}
          <div className="flex items-center gap-2 flex-shrink-0 overflow-visible relative z-[10001]">
            <Link
              to="/home"
              className="flex items-center overflow-visible relative z-[10002]">
              <motion.div
                ref={logoRef}
                className="overflow-visible relative z-[10003] flex items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <img
                  src={loginLogo}
                  alt="Dwell Mart"
                  className="h-9 sm:h-11 w-auto max-w-[140px] sm:max-w-[180px] object-contain drop-shadow-md relative z-[10004]"
                />
              </motion.div>
            </Link>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2">
            {/* Sell Button */}
            {!hideSellButton && (
              <Link
                to="/sell-on-dwellmart"
                className="mr-1 rounded-lg bg-[#ffc101] px-3 py-1.5 text-xs font-semibold text-black shadow-sm transition-colors hover:bg-[#ffd042]"
              >
                {t("Sell On Dwell Mart")}
              </Link>
            )}

            {/* Cart Button */}
            <motion.button
              ref={cartRef}
              data-cart-icon
              onClick={toggleCart}
              className="relative p-2.5 hover:bg-white/50 rounded-full transition-all duration-300"
              animate={
                cartAnimationTrigger > 0
                  ? {
                    scale: [1, 1.2, 1],
                  }
                  : {}
              }
              transition={{ duration: 0.5, ease: "easeOut" }}>
              <FiShoppingBag className="text-xl text-gray-200" />
              {itemCount > 0 && (
                <motion.span
                  key={itemCount}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: "#ffc101" }}>
                  {itemCount > 9 ? "9+" : itemCount}
                </motion.span>
              )}
            </motion.button>


          </div>
        </motion.div>


      </div>
    </motion.header>
  );

  // Use portal to render outside of transformed containers (like PageTransition)
  return (
    <>
      {typeof document !== "undefined" &&
        createPortal(headerContent, document.body)}
      {typeof document !== "undefined" &&
        createPortal(animationContent, document.body)}
      <MobileMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </>
  );
};

export default MobileHeader;
