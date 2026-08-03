import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FiX, FiHome, FiGrid, FiTag, FiUser, FiShoppingBag, FiHeart, FiLogOut, FiHelpCircle, FiBell } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../../../shared/store/authStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { useUserNotificationStore } from "../../store/userNotificationStore";
import { appLogo } from "../../../../data/logos";
import LanguageSelector from "../../../../shared/components/LanguageSelector";
import CurrencySelector from "../../../../shared/components/CurrencySelector";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";

const MobileMenu = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const wishlistCount = useWishlistStore((state) => state.getItemCount());
  const unreadCount = useUserNotificationStore((state) => state.unreadCount);
  const { getTranslatedText: t } = usePageTranslation(["Home", "Shop", "Categories", "Exclusive Offers", "Track Order", "My Profile", "My Orders", "Wishlist", "Notifications", "Become a Seller", "Help Center", "Sign In / Register", "Logout", "Personal Space", "Support", "Member", "Dwell Mart Pro"]);

  // Prevent background scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
    };
  }, [isOpen]);

  const handleLogout = () => {
    logout();
    onClose();
    navigate("/home");
  };

  const mainLinks = [
    { label: t("Home"), icon: FiHome, path: "/home" },
    { label: t("Shop"), icon: FiShoppingBag, path: "/shop" },
    { label: t("Categories"), icon: FiGrid, path: "/categories" },
    { label: t("Exclusive Offers"), icon: FiTag, path: "/offers" },
    { label: t("Track Order"), icon: FiShoppingBag, path: isAuthenticated ? "/orders" : "/login" },
  ];

  const personalLinks = [
    { label: t("My Profile"), icon: FiUser, path: "/profile" },
    { label: t("My Orders"), icon: FiShoppingBag, path: "/orders" },
    { label: t("Wishlist"), icon: FiHeart, path: "/wishlist", badge: wishlistCount },
    { label: t("Notifications"), icon: FiBell, path: "/notifications", badge: unreadCount },
  ];

  const secondaryLinks = [
    { label: t("Become a Seller"), icon: FiTag, path: "/sell-on-dwellmart", highlight: true },
    { label: t("Help Center"), icon: FiHelpCircle, path: "/support" },
  ];

  const menuContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[10005] backdrop-blur-[2px]"
            style={{ touchAction: 'none' }}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "tween", duration: 0.3, ease: "circOut" }}
            className="fixed top-0 left-0 bottom-0 w-[280px] bg-[#0c0c0c] z-[10006] flex flex-col shadow-2xl border-r border-white/5"
            style={{ overscrollBehavior: 'contain' }}
          >
            {/* Header / Brand */}
            <div className="flex items-center justify-between px-6 pt-10 pb-6 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent flex-shrink-0">
              <Link to="/home" onClick={onClose} className="flex-shrink-0 flex items-center">
                {appLogo.src ? (
                  <img src={appLogo.src} alt="Logo" className="h-24 max-h-24 w-auto max-w-[190px] object-contain scale-110 origin-left drop-shadow-md" />
                ) : (
                  <span className="text-2xl font-bold text-white uppercase tracking-tighter">Dwell Mart</span>
                )}
              </Link>
              <button 
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-white/50 hover:text-white transition-colors"
                aria-label="Close menu"
              >
                <FiX className="text-2xl" />
              </button>
            </div>

            {/* Auth Section */}
            <div className="px-6 py-6 flex-shrink-0">
              {isAuthenticated ? (
                <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 border border-amber-500/30">
                    <FiUser className="text-xl text-amber-400" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-white text-base font-bold truncate tracking-tight">{user?.name}</p>
                    <p className="text-white/40 text-xs truncate uppercase tracking-widest font-medium opacity-50">{user?.role || t('Member')}</p>
                  </div>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={onClose}
                  className="block w-full py-4 px-6 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-center rounded-xl text-sm font-black uppercase tracking-wider transition-all shadow-xl shadow-amber-500/20 border border-amber-400/30"
                >
                  {t("Sign In / Register")}
                </Link>
              )}
            </div>

            {/* Scrollable Nav - Fixed scroll bleed */}
            <div className="flex-1 overflow-y-auto pt-2 pb-10 scrollbar-hide px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
              {/* Language Settings Drawer/Section */}
              <div className="pb-2">
                <p className="px-4 text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-2 scale-95 origin-left">Language</p>
                <LanguageSelector variant="mobile" />
              </div>

              {/* Currency Settings Section */}
              <div className="pb-4">
                <p className="px-4 text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-2 scale-95 origin-left">Currency</p>
                <CurrencySelector variant="mobile" />
              </div>
              {/* Main Links */}
              <div className="space-y-1 mb-10">
                {mainLinks.map((link) => (
                  <Link
                    key={link.label}
                    to={link.path}
                    onClick={onClose}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-all text-sm font-bold lowercase tracking-tight"
                  >
                    <link.icon className="text-xl text-amber-400" />
                    <span className="first-letter:uppercase">{link.label}</span>
                  </Link>
                ))}
              </div>

              {/* Personal Section */}
              <div className="space-y-1 mb-10">
                <p className="px-4 text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 scale-95 origin-left">{t("Personal Space")}</p>
                {personalLinks.map((link) => (
                  <Link
                    key={link.label}
                    to={link.path}
                    onClick={onClose}
                    className="flex items-center justify-between px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-all text-sm font-bold lowercase tracking-tight"
                  >
                    <div className="flex items-center gap-4">
                      <link.icon className="text-xl text-amber-400" />
                      <span className="first-letter:uppercase">{link.label}</span>
                    </div>
                    {link.badge > 0 && (
                      <span className="h-6 min-w-[24px] px-2 flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-slate-950 shadow-lg shadow-amber-500/30">
                        {link.badge > 9 ? "9+" : link.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>


              {/* Support Section */}
              <div className="space-y-1">
                <p className="px-4 text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 scale-95 origin-left">{t("Support")}</p>
                {secondaryLinks.map((link) => (
                  <Link
                    key={link.label}
                    to={link.path}
                    onClick={onClose}
                    className={`flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-bold lowercase tracking-tight transition-all ${
                      link.highlight ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "text-white/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <link.icon className="text-xl" />
                    <span className="first-letter:uppercase">{link.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Logout Footer */}
            {isAuthenticated && (
              <div className="p-6 border-t border-white/5 bg-gradient-to-t from-white/5 to-transparent flex-shrink-0">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-3 py-3 rounded-xl text-red-400/80 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all text-sm font-black uppercase tracking-widest"
                >
                  <FiLogOut className="text-lg" />
                  <span>{t("Logout")}</span>
                </button>
              </div>
            )}
            
            {/* Minimal footer for guests */}
            {!isAuthenticated && (
              <div className="p-6 border-t border-white/5 text-center bg-gradient-to-t from-white/5 to-transparent flex-shrink-0">
                <span className="text-[9px] font-black text-white/10 uppercase tracking-[0.5em]">{t("Dwell Mart Pro")}</span>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return typeof document !== "undefined" ? createPortal(menuContent, document.body) : null;
};

export default MobileMenu;


