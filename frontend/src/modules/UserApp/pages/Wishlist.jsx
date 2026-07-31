import { useEffect, useState } from "react";
import { FiHeart, FiArrowLeft, FiGrid, FiList } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import SwipeableWishlistItem from "../components/Mobile/SwipeableWishlistItem";
import WishlistGridItem from "../components/Mobile/WishlistGridItem";
import { useWishlistStore } from "../../../shared/store/wishlistStore";
import { useCartStore } from "../../../shared/store/useStore";
import { useAuthStore } from "../../../shared/store/authStore";
import toast from "react-hot-toast";
import PageTransition from '../../../shared/components/PageTransition';
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import { Button, EmptyState, SkeletonLoader } from "../../../shared/components/ui";

const MobileWishlist = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { items, removeItem, moveToCart, clearWishlist, fetchWishlist, isLoading } = useWishlistStore();
  const { addItem } = useCartStore();
  const [viewMode, setViewMode] = useState("list");

  const { getTranslatedText: t } = usePageTranslation([
    "My Wishlist", "item", "items", "saved", "Clear All", "Loading wishlist...",
    "Your wishlist is empty", "Start adding items you love!", "Continue Shopping",
    "Moved to cart!", "Removed from wishlist", "Wishlist cleared",
    "Are you sure you want to clear your wishlist?", "Undo", "Item restored"
  ]);
  const { translateArray } = useDynamicTranslation();
  const [translatedItems, setTranslatedItems] = useState([]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchWishlist().catch(() => null);
    }
  }, [isAuthenticated, fetchWishlist]);

  useEffect(() => {
    if (items.length === 0) {
      setTranslatedItems([]);
      return;
    }
    translateArray(items, ['name', 'description', 'unit']).then(setTranslatedItems);
  }, [items, translateArray]);

  const handleMoveToCart = (item) => {
    const wishlistItem = moveToCart(item.id);
    if (wishlistItem) {
      addItem({
        ...wishlistItem,
        quantity: 1,
      });
      toast.success(t("Moved to cart!"));
    }
  };

  const handleRemove = (id) => {
    removeItem(id);
    toast.success(t("Removed from wishlist"));
  };

  const handleClearAll = () => {
    if (window.confirm(t("Are you sure you want to clear your wishlist?"))) {
      clearWishlist();
      toast.success(t("Wishlist cleared"));
    }
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full pb-24">
            {/* Header */}
            <div className="px-4 py-4 bg-surface-card border-b border-borderToken-default sticky top-1 z-40 shadow-sm">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-borderToken-light rounded-full transition-colors flex-shrink-0">
                  <FiArrowLeft className="text-xl text-textColor-primary" />
                </button>
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-bold text-textColor-primary truncate">
                    {t('My Wishlist')}
                  </h1>
                  <p className="text-xs text-textColor-muted">
                    {items.length} {items.length === 1 ? t("item") : t("items")} {t('saved')}
                  </p>
                </div>
                {items.length > 0 && (
                  <div className="flex items-center gap-2">
                    {/* View Toggle Buttons */}
                    <div className="flex items-center bg-borderToken-light rounded-lg p-1">
                      <button
                        onClick={() => setViewMode("list")}
                        className={`p-1.5 rounded transition-colors ${viewMode === "list"
                          ? "bg-surface-card text-brand-primary shadow-sm font-bold"
                          : "text-textColor-muted"
                          }`}>
                        <FiList className="text-lg" />
                      </button>
                      <button
                        onClick={() => setViewMode("grid")}
                        className={`p-1.5 rounded transition-colors ${viewMode === "grid"
                          ? "bg-surface-card text-brand-primary shadow-sm font-bold"
                          : "text-textColor-muted"
                          }`}>
                        <FiGrid className="text-lg" />
                      </button>
                    </div>
                    <Button
                      variant="danger"
                      size="xs"
                      onClick={handleClearAll}
                    >
                      {t('Clear All')}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="px-4 py-4">
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <SkeletonLoader.Card />
                  <SkeletonLoader.Card />
                  <SkeletonLoader.Card />
                </div>
              ) : items.length === 0 ? (
                <EmptyWishlistState t={t} />
              ) : (
                <WishlistItems
                  items={translatedItems.length > 0 ? translatedItems : items}
                  viewMode={viewMode}
                  onMoveToCart={handleMoveToCart}
                  onRemove={handleRemove}
                />
              )}
            </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

// Empty State Component using UI Primitive
const EmptyWishlistState = ({ t }) => (
  <EmptyState
    variant="generic"
    title={t('Your wishlist is empty')}
    description={t('Start adding items you love!')}
    action={
      <Button as={Link} to="/home" variant="primary" size="md">
        {t('Continue Shopping')}
      </Button>
    }
  />
);

// Wishlist Items Component
const WishlistItems = ({ items, viewMode, onMoveToCart, onRemove }) => {
  if (viewMode === "grid") {
    return (
      <AnimatePresence>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {items.map((item, index) => (
            <WishlistGridItem
              key={item.id}
              item={item}
              index={index}
              onMoveToCart={onMoveToCart}
              onRemove={onRemove}
            />
          ))}
        </div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {items.map((item, index) => (
          <SwipeableWishlistItem
            key={item.id}
            item={item}
            index={index}
            onMoveToCart={onMoveToCart}
            onRemove={onRemove}
          />
        ))}
      </div>
    </AnimatePresence>
  );
};

export default MobileWishlist;
