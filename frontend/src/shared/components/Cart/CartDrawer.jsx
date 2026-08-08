import { useEffect, useState, useMemo } from "react";
import { FiShoppingBag, FiZap, FiPackage, FiTruck } from "react-icons/fi";
import { AnimatePresence, motion } from "framer-motion";
import { useCartStore, useUIStore } from "../../store/useStore";
import { useAuthStore } from "../../store/authStore";
import Price from "../Price";
import { Link } from "react-router-dom";
import SwipeableCartItem from "./SwipeableCartItem";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import { Drawer, EmptyState, Button, Badge } from "../ui";

// ── Fulfillment section config ──────────────────────────────────────────────
const FULFILLMENT_CONFIG = {
  quick_commerce: {
    Icon: FiZap,
    label: "Express Delivery",
    subLabel: "10–30 min",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
    headerClass: "bg-gradient-to-r from-emerald-950/50 to-slate-900 border-emerald-500/30",
    iconClass: "text-emerald-400 bg-emerald-500/10 p-1 rounded-lg border border-emerald-500/20",
    accentClass: "text-emerald-400 font-extrabold",
    dotClass: "bg-emerald-400",
  },
  retail: {
    Icon: FiPackage,
    label: "Standard Delivery",
    subLabel: "2–7 days",
    badgeClass: "bg-blue-500/20 text-blue-300 border border-blue-500/40",
    headerClass: "bg-gradient-to-r from-blue-950/50 to-slate-900 border-blue-500/30",
    iconClass: "text-blue-400 bg-blue-500/10 p-1 rounded-lg border border-blue-500/20",
    accentClass: "text-blue-400 font-extrabold",
    dotClass: "bg-blue-400",
  },
  wholesale: {
    Icon: FiTruck,
    label: "Wholesale (B2B)",
    subLabel: "Bulk Freight",
    badgeClass: "bg-purple-500/20 text-purple-300 border border-purple-500/40",
    headerClass: "bg-gradient-to-r from-purple-950/50 to-slate-900 border-purple-500/30",
    iconClass: "text-purple-400 bg-purple-500/10 p-1 rounded-lg border border-purple-500/20",
    accentClass: "text-purple-400 font-extrabold",
    dotClass: "bg-purple-400",
  },
};

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
  const { items, getTotal, clearCart, getItemsByFulfillment } = useCartStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const total = getTotal();

  // Group by fulfillment type → vendor
  const fulfillmentGroups = useMemo(
    () => getItemsByFulfillment(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, getItemsByFulfillment]
  );

  const [translatedGroups, setTranslatedGroups] = useState([]);

  useEffect(() => {
    if (!isCartOpen) return;
    let cancelled = false;

    const translate = async () => {
      if (!fulfillmentGroups.length) {
        if (!cancelled) setTranslatedGroups([]);
        return;
      }
      const translated = await Promise.all(
        fulfillmentGroups.map(async (fg) => {
          const translatedVendors = await Promise.all(
            fg.vendors.map(async (vendor) => {
              const transItems = await translateArray(vendor.items, [
                "name", "description", "unit", "categoryName", "brandName", "vendorName",
              ]);
              const vendorNameRes = await translateArray([{ name: vendor.vendorName }], ["name"]);
              return {
                ...vendor,
                vendorName: vendorNameRes[0]?.name || vendor.vendorName,
                items: transItems,
              };
            })
          );
          return { ...fg, vendors: translatedVendors };
        })
      );
      if (!cancelled) setTranslatedGroups(translated);
    };

    translate();
    return () => { cancelled = true; };
  }, [fulfillmentGroups, translateArray, isCartOpen]);

  useEffect(() => {
    if (!isAuthenticated && items.length > 0) clearCart();
  }, [isAuthenticated, items.length, clearCart]);

  const displayGroups = translatedGroups.length > 0 ? translatedGroups : fulfillmentGroups;
  const isMixedCart = displayGroups.length > 1;

  return (
    <Drawer
      isOpen={isCartOpen}
      onClose={toggleCart}
      title={t("Shopping Cart")}
      size="cart"
    >
      <div className="flex flex-col h-full justify-between bg-slate-900">
        {/* Cart Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4 scrollbar-admin">
          {items.length === 0 ? (
            <EmptyState
              variant="cart"
              title={t("Your cart is empty")}
              description={t("Add some items to get started!")}
              titleClassName="text-white font-bold"
              descriptionClassName="text-gray-300 font-medium"
              className="bg-slate-800/80 border border-slate-700/60 shadow-lg rounded-2xl p-6"
              action={
                <Button onClick={toggleCart} variant="primary" size="md">
                  {t("Explore Products")}
                </Button>
              }
            />
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="space-y-4">
                {displayGroups.map((fg) => {
                  const cfg = FULFILLMENT_CONFIG[fg.fulfillmentType] || FULFILLMENT_CONFIG.retail;
                  const { Icon } = cfg;
                  return (
                    <motion.div
                      key={fg.fulfillmentType}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-2xl border border-slate-700/60 overflow-hidden bg-slate-900/60 shadow-md"
                    >
                      {/* ── Fulfillment Section Header ── */}
                      <div className={`flex items-center justify-between px-4 py-3 ${cfg.headerClass} border-b border-slate-700/50`}>
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.iconClass}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className={`text-xs uppercase tracking-wider ${cfg.accentClass}`}>
                              {cfg.label}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium ml-2">{cfg.subLabel}</span>
                          </div>
                          {isMixedCart && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 ${cfg.badgeClass}`}>
                              {fg.itemCount} item{fg.itemCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-black text-[#ffc101] bg-slate-950/80 px-2.5 py-1 rounded-lg border border-amber-500/30 flex items-center gap-1">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase">Item Subtotal:</span>
                          <Price amount={fg.subtotal} />
                        </span>
                      </div>
                      {fg.fulfillmentType === 'quick_commerce' && (
                        <div className="px-4 py-1.5 bg-slate-950/50 border-b border-slate-800 text-[11px] text-emerald-400/90 font-medium flex items-center gap-1.5">
                          <span>⚡ Quick Commerce — Delivery fee & packaging calculated at checkout</span>
                        </div>
                      )}

                      {/* ── Vendor Groups inside this Fulfillment Section ── */}
                      <div className="p-3 space-y-3 bg-slate-950/30">
                        {fg.vendors.map((vendor) => (
                          <div key={vendor.vendorId} className="space-y-3">
                            {/* Vendor Label */}
                            {fg.vendors.length > 1 && (
                              <div className="flex items-center gap-1.5 px-1 pt-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                  {vendor.vendorName}
                                </span>
                              </div>
                            )}
                            <div className="space-y-3">
                              {vendor.items.map((item, index) => (
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
                    </motion.div>
                  );
                })}
              </div>
            </AnimatePresence>
          )}
        </div>

        {/* Cart Footer */}
        {items.length > 0 && (
          <div className="border-t border-slate-800 p-4 sm:p-5 bg-slate-950/90 space-y-4 backdrop-blur-md">
            {/* Mixed cart summary */}
            {isMixedCart && (
              <div className="space-y-1.5 pb-3 border-b border-slate-800">
                {displayGroups.map((fg) => {
                  const cfg = FULFILLMENT_CONFIG[fg.fulfillmentType] || FULFILLMENT_CONFIG.retail;
                  return (
                    <div key={fg.fulfillmentType} className="flex items-center justify-between text-xs">
                      <span className={`font-semibold ${cfg.accentClass}`}>{cfg.label}</span>
                      <span className="text-slate-200 font-bold">
                        <Price amount={fg.subtotal} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-slate-300 uppercase tracking-wider">
                {t("Total:")}
              </span>
              <span className="text-2xl sm:text-3xl font-black text-[#ffc101] tracking-tight">
                <Price amount={total} />
              </span>
            </div>

            <div className="space-y-2.5 pt-1">
              <Link
                to={checkoutLink}
                onClick={toggleCart}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#ffc101] text-black font-extrabold hover:bg-[#e6ac00] active:scale-[0.99] transition-all shadow-lg shadow-amber-500/15 text-sm sm:text-base tracking-wide uppercase cursor-pointer"
              >
                <span>{t("Proceed to Checkout")}</span>
              </Link>

              <button
                type="button"
                onClick={clearCart}
                className="w-full text-center text-xs text-slate-400 hover:text-red-400 font-semibold py-1.5 transition-colors cursor-pointer"
              >
                {t("Clear Cart")}
              </button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default CartDrawer;
