import { createPortal } from "react-dom";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { FiShoppingBag, FiChevronRight } from "react-icons/fi";
import { formatPrice } from "../../../../shared/utils/helpers";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import useKeyboardVisible from "../../hooks/useKeyboardVisible";

const MobileCartBar = ({ hasBottomNav = true }) => {
  const { items, getTotal } = useCartStore();
  const toggleCart = useUIStore((state) => state.toggleCart);
  const cartAnimationTrigger = useUIStore(
    (state) => state.cartAnimationTrigger
  );
  const itemCount = useCartStore((state) => state.getItemCount());
  const total = getTotal();
  const [pulseAnimation, setPulseAnimation] = useState(false);
  const isKeyboardVisible = useKeyboardVisible();

  useEffect(() => {
    if (cartAnimationTrigger > 0) {
      setPulseAnimation(true);
      setTimeout(() => setPulseAnimation(false), 600);
    }
  }, [cartAnimationTrigger]);

  if (itemCount === 0 || isKeyboardVisible) {
    return null;
  }

  const cartBarContent = (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed right-4 sm:right-6 z-[9998] safe-area-bottom md:hidden transition-all duration-300"
      style={{
        bottom: hasBottomNav
          ? "calc(4rem + 12px)"
          : "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
      }}>
      <motion.button
        data-cart-bar
        onClick={toggleCart}
        aria-label="View shopping cart"
        className="w-14 h-14 rounded-full gradient-green shadow-xl flex items-center justify-center hover:shadow-2xl active:scale-95 transition-all duration-300 group relative border-2 border-white/30"
        animate={
          pulseAnimation
            ? {
              scale: [1, 1.15, 1],
            }
            : {}
        }
        transition={{ duration: 0.4 }}>
        <motion.div
          animate={
            pulseAnimation
              ? {
                rotate: [0, -12, 12, -12, 0],
              }
              : {}
          }
          transition={{ duration: 0.5 }}>
          <FiShoppingBag className="text-2xl text-white drop-shadow-xs" />
        </motion.div>
        <motion.span
          key={itemCount}
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 text-slate-950 rounded-full flex items-center justify-center text-xs font-black shadow-md border-2 border-white"
          style={{ backgroundColor: "#ffc101" }}>
          {itemCount > 9 ? "9+" : itemCount}
        </motion.span>
      </motion.button>
    </motion.div>
  );

  // Use portal to render outside of transformed containers (like PageTransition)
  return createPortal(cartBarContent, document.body);
};

export default MobileCartBar;
