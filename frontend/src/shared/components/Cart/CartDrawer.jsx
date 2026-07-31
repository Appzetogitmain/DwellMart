import { useEffect, useState, useMemo } from "react";
import { FiShoppingBag } from "react-icons/fi";
import { AnimatePresence } from "framer-motion";
import { useCartStore, useUIStore } from "../../store/useStore";
import { useAuthStore } from "../../store/authStore";
import Price from "../Price";
import { Link } from "react-router-dom";
import SwipeableCartItem from "./SwipeableCartItem";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import { Drawer, EmptyState, Button, Badge } from "../ui";

const CartDrawer = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "Shopping Cart",
    "Your cart is empty",
    "Add some items to get started!",
    "Total:",
    "Proceed to Checkout",
    "Clear Cart",
    "Explore Products",
  ]);
  const { translateArray } = useDynamicTranslation();

  const checkoutLink = "/checkout";
  const { isCartOpen, toggleCart } = useUIStore();
  const {
    items,
    getTotal,
    clearCart,
    getItemsByVendor,
  } = useCartStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const total = getTotal();

  const [translatedVendorGroups, setTranslatedVendorGroups] = useState([]);

  // Group items by vendor
  const itemsByVendor = useMemo(
    () => getItemsByVendor(),
    [items, getItemsByVendor]
  );

  useEffect(() => {
    const translateContent = async () => {
      if (itemsByVendor.length > 0) {
        const groups = await Promise.all(itemsByVendor.map(async (group) => {
          const transItems = await translateArray(group.items, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
          const vendorNameRes = await translateArray([{ name: group.vendorName }], ['name']);
          return {
            ...group,
            vendorName: vendorNameRes[0]?.name || group.vendorName,
            items: transItems
          };
        }));
        setTranslatedVendorGroups(groups);
      } else {
        setTranslatedVendorGroups([]);
      }
    };
    if (isCartOpen) {
      translateContent();
    }
  }, [itemsByVendor, translateArray, isCartOpen]);

  useEffect(() => {
    if (!isAuthenticated && items.length > 0) {
      clearCart();
    }
  }, [isAuthenticated, items.length, clearCart]);

  const displayGroups = translatedVendorGroups.length > 0 ? translatedVendorGroups : itemsByVendor;

  return (
    <Drawer
      isOpen={isCartOpen}
      onClose={toggleCart}
      title={t('Shopping Cart')}
      size="cart"
    >
      <div className="flex flex-col h-full justify-between">
        {/* Cart Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {items.length === 0 ? (
            <EmptyState
              variant="cart"
              title={t('Your cart is empty')}
              description={t('Add some items to get started!')}
              action={
                <Button onClick={toggleCart} variant="primary" size="md">
                  {t('Explore Products')}
                </Button>
              }
            />
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="space-y-6">
                {displayGroups.map((vendorGroup) => (
                  <div key={vendorGroup.vendorId} className="space-y-3">
                    {/* Vendor Header Badge */}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-brand-primary/10 rounded-card border border-brand-primary/20">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-brand-primary flex items-center justify-center text-textColor-brand text-[10px]">
                          <FiShoppingBag />
                        </div>
                        <span className="text-xs font-bold text-textColor-primary">
                          {vendorGroup.vendorName}
                        </span>
                      </div>
                      <Badge variant="gold" size="xs">
                        <Price amount={vendorGroup.subtotal} />
                      </Badge>
                    </div>

                    {/* Vendor Items */}
                    <div className="space-y-3">
                      {vendorGroup.items.map((item, index) => (
                        <SwipeableCartItem
                          key={item.cartLineKey || `${item.id}-${index}`}
                          item={item}
                          index={index}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>

        {/* Cart Drawer Footer */}
        {items.length > 0 && (
          <div className="border-t border-borderToken-default p-4 sm:p-6 bg-surface-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-textColor-muted">
                {t('Total:')}
              </span>
              <span className="text-xl sm:text-2xl font-black text-brand-primary">
                <Price amount={total} />
              </span>
            </div>

            <div className="space-y-2 pt-2">
              <Button
                as={Link}
                to={checkoutLink}
                onClick={toggleCart}
                variant="primary"
                size="lg"
                fullWidth
              >
                {t('Proceed to Checkout')}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                fullWidth
                onClick={clearCart}
                className="text-textColor-muted hover:text-status-error"
              >
                {t('Clear Cart')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default CartDrawer;

