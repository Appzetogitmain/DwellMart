import { Link, useNavigate } from "react-router-dom";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { useAuthStore } from "../../../../shared/store/authStore";
import { useExperienceStore } from "../../../../shared/store/experienceStore";
import { appLogo } from "../../../../data/logos";
import { loginLogo } from "../../../../shared/utils/imagePaths";
import SearchBar from "../../../../shared/components/SearchBar";
import LanguageSelector from "../../../../shared/components/LanguageSelector";
import CurrencySelector from "../../../../shared/components/CurrencySelector";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import {
  FiHeart,
  FiShoppingBag,
  FiUser,
  FiLogOut,
  FiGrid,
  FiBell,
  FiMapPin,
} from "react-icons/fi";
import { HiOutlineUserCircle } from "react-icons/hi";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserNotificationStore } from "../../store/userNotificationStore";
import NotificationBell from "../../../../shared/components/Notifications/NotificationBell";
import { EXPERIENCES } from "../../../../shared/utils/experience";

const DesktopHeader = ({ hideSellButton = false }) => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { location, isLocating } = useExperienceStore();
  const itemCount = useCartStore((state) => state.getItemCount());
  /**
   * Quick Commerce and Marketplace hold separate baskets, and the count above
   * only ever reflects the active one. Without this the header cannot show
   * that anything is waiting in the other basket, which is what made switching
   * experience look like the cart had been emptied.
   */
  const cartExperience = useCartStore((state) => state.cartExperience);
  useCartStore((state) => state.carts);
  const getCartCountForExperience = useCartStore((state) => state.getCartCountForExperience);
  const otherBasketCount = getCartCountForExperience(
    cartExperience === EXPERIENCES.QUICK_COMMERCE ? EXPERIENCES.MARKETPLACE : EXPERIENCES.QUICK_COMMERCE
  );
  const wishlistCount = useWishlistStore((state) => state.getItemCount());
  const unreadCount = useUserNotificationStore((state) => state.unreadCount);
  const { getTranslatedText: t } = usePageTranslation(["Home", "Shop", "Categories", "Offers", "Track Order", "Sell On Dwell Mart", "Profile", "Orders", "Logout", "Login"]);
  const ensureHydrated = useUserNotificationStore(
    (state) => state.ensureHydrated,
  );
  const toggleCart = useUIStore((state) => state.toggleCart);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    ensureHydrated();
  }, [ensureHydrated, isAuthenticated]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate("/home");
  };

  return (
    <header className="hidden md:block sticky top-0 z-[999] bg-black shadow-lg border-b border-gray-800 w-full overflow-visible">
      <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-3 lg:px-4 xl:px-6 h-16 xl:h-20 flex items-center justify-between gap-1.5 lg:gap-2.5 xl:gap-3.5 overflow-visible">
        {/* Left Section: Logo & Nav Links */}
        <div className="flex items-center gap-2 lg:gap-3 xl:gap-4 shrink-0">
          {/* Logo */}
          <Link to="/home" className="shrink-0 flex items-center gap-2 relative z-20">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ opacity: { duration: 0.4 }, y: { duration: 0.4 } }}
              className="flex items-center"
            >
              <img
                src={loginLogo}
                alt="Dwell Mart Logo"
                className="h-8 sm:h-9 lg:h-10 xl:h-11 w-auto max-w-[120px] lg:max-w-[155px] xl:max-w-[185px] object-contain drop-shadow-md"
              />
            </motion.div>
          </Link>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1.5 lg:gap-2.5 xl:gap-3.5 whitespace-nowrap">
            <Link
              to="/home"
              className="text-gray-300 hover:text-[#ffc101] font-medium text-xs lg:text-sm xl:text-[14px] transition-colors">
              {t("Home")}
            </Link>
            <Link
              to="/shop"
              className="text-gray-300 hover:text-[#ffc101] font-medium text-xs lg:text-sm xl:text-[14px] flex items-center gap-1 transition-colors">
              <FiShoppingBag className="hidden lg:inline-block text-xs lg:text-sm" /> {t("Shop")}
            </Link>
            <Link
              to="/categories"
              className="text-gray-300 hover:text-[#ffc101] font-medium text-xs lg:text-sm xl:text-[14px] flex items-center gap-1 transition-colors">
              <FiGrid className="text-xs lg:text-sm" /> {t("Categories")}
            </Link>
            <Link
              to="/offers"
              className="text-gray-300 hover:text-[#ffc101] font-medium text-xs lg:text-sm xl:text-[14px] transition-colors">
              {t("Offers")}
            </Link>
            <Link
              to={isAuthenticated ? "/orders" : "/login"}
              className="hidden xl:inline-block text-gray-300 hover:text-[#ffc101] font-medium text-xs lg:text-sm xl:text-[14px] transition-colors">
              {t("Track Order")}
            </Link>
            {!hideSellButton && (
              <Link
                to="/sell-on-dwellmart"
                className="shrink-0 rounded-lg border border-[#ffc101]/60 bg-[#ffc101]/10 px-2 lg:px-2.5 py-1 lg:py-1.5 text-[11px] lg:text-xs xl:text-xs font-bold text-[#ffc101] transition-all hover:bg-[#ffc101] hover:text-black shadow-sm">
                {t("Sell On Dwell Mart")}
              </Link>
            )}
          </nav>
        </div>

        {/* Center Section: Flexible Search Bar */}
        <div className="flex-1 min-w-[100px] max-w-[140px] md:max-w-[170px] lg:max-w-[220px] xl:max-w-[280px] z-20">
          <SearchBar />
        </div>

        {/* Location Indicator (if detected or locating) */}
        {(location?.label || isLocating) && (
          <div
            className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-900/90 border border-gray-800 text-xs text-gray-300 max-w-[160px] truncate shrink-0 cursor-default"
            title={location?.label || "Detecting live location..."}
          >
            <FiMapPin className={`text-xs shrink-0 ${isLocating ? "text-amber-400 animate-pulse" : "text-[#ffc101]"}`} />
            <span className={`truncate text-[11px] font-medium ${isLocating ? "text-amber-400 animate-pulse" : "text-gray-300"}`}>
              {isLocating ? "Locating..." : location?.city || location?.label}
            </span>
          </div>
        )}

        {/* Right Section: Selectors, Actions & Login/User */}
        <div className="flex items-center gap-1 lg:gap-2 shrink-0 relative z-30">
          {/* Selectors (shown on desktop header) */}
          <div className="flex items-center gap-1">
            <LanguageSelector variant="desktop" />
            <CurrencySelector variant="desktop" />
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Wishlist */}
            <Link
              to="/wishlist"
              className="relative p-1.5 text-gray-300 hover:text-[#ffc101] transition-colors"
              title="Wishlist">
              <FiHeart className="text-base lg:text-lg xl:text-xl" />
              {wishlistCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {wishlistCount > 9 ? "9+" : wishlistCount}
                </span>
              )}
            </Link>

            {/* Cart */}
            <button
              data-cart-icon
              onClick={toggleCart}
              className="relative p-1.5 text-gray-300 hover:text-[#ffc101] transition-colors cursor-pointer"
              title={otherBasketCount > 0
                ? `Shopping Cart — ${otherBasketCount} more saved in your other basket`
                : "Shopping Cart"}>
              <FiShoppingBag className="text-base lg:text-lg xl:text-xl" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#ffc101] text-black text-[10px] font-extrabold flex items-center justify-center">
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              )}
              {/* A quieter marker for the OTHER basket, so the two counts are
                  never confused with one another. */}
              {otherBasketCount > 0 && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-900"
                  aria-hidden="true"
                />
              )}
            </button>

            {/* Notifications */}
            {isAuthenticated ? (
              <NotificationBell iconClassName="text-base lg:text-lg xl:text-xl text-gray-300 hover:text-[#ffc101]" />
            ) : (
              <Link
                to="/login"
                className="relative p-1.5 text-gray-300 hover:text-[#ffc101] transition-colors"
                title="Notifications">
                <FiBell className="text-base lg:text-lg xl:text-xl" />
              </Link>
            )}
          </div>

          {/* User Menu / Login Button */}
          {isAuthenticated ? (
            <div ref={userMenuRef} className="relative shrink-0 ml-1">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 p-1 hover:bg-slate-800 rounded-full transition-all border border-transparent hover:border-slate-700">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <HiOutlineUserCircle className="text-gray-300 text-2xl lg:text-3xl" />
                )}
                <span className="text-xs font-semibold text-gray-200 max-w-[64px] lg:max-w-[90px] truncate">
                  {user?.name || "User"}
                </span>
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 bg-slate-900 rounded-xl shadow-2xl border border-slate-800 p-2 z-[60] min-w-[200px]">
                    <div className="px-3 py-2 border-b border-slate-800 mb-2">
                      <p className="font-bold text-white text-sm">
                        {user?.name || "User"}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {user?.email || ""}
                      </p>
                    </div>
                    <Link
                      to="/profile"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 rounded-lg transition-colors text-left w-full">
                      <FiUser className="text-gray-400" />
                      <span className="text-gray-200 text-sm">{t("Profile")}</span>
                    </Link>
                    <Link
                      to="/orders"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 rounded-lg transition-colors text-left w-full">
                      <FiShoppingBag className="text-gray-400" />
                      <span className="text-gray-200 text-sm">{t("Orders")}</span>
                    </Link>
                    <Link
                      to="/addresses"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 rounded-lg transition-colors text-left w-full">
                      <FiMapPin className="text-gray-400" />
                      <span className="text-gray-200 text-sm">{t("My Addresses")}</span>
                    </Link>
                    <Link
                      to="/support"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 rounded-lg transition-colors text-left w-full">
                      <FiBell className="text-gray-400" />
                      <span className="text-gray-200 text-sm">Support Desk</span>
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-red-950/40 rounded-lg transition-colors text-left w-full text-red-400 mt-1">
                      <FiLogOut className="text-red-400" />
                      <span className="text-sm font-semibold">{t("Logout")}</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              to="/login"
              className="shrink-0 whitespace-nowrap px-3.5 lg:px-4 py-1.5 lg:py-2 bg-[#ffc101] text-black border border-amber-400 rounded-xl font-extrabold hover:bg-[#e6ac00] transition-all shadow-md text-xs lg:text-sm shadow-amber-500/20">
              {t("Login")}
            </Link>
          )}
        </div>
      </div>
    </header>
);
};

export default DesktopHeader;

