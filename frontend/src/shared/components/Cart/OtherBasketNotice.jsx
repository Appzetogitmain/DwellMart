/**
 * OtherBasketNotice
 *
 * Quick Commerce and Marketplace each keep their own basket, and switching
 * experience parks one and loads the other (see `switchCartExperience` in
 * useStore). Nothing is ever discarded — but until this component existed the
 * swap was completely silent: the badge counted only the active basket and the
 * drawer said "Your cart is empty" while items sat waiting in the other one.
 *
 * Customers read that as "my products disappeared". This tells them where the
 * items went and gets them back in one tap.
 *
 * The store has always exposed `getCartCountForExperience` for exactly this
 * purpose; nothing had ever called it.
 */
import { FiShoppingBag, FiZap, FiArrowRight } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useCartStore, useUIStore } from "../../store/useStore";
import { useExperienceStore } from "../../store/experienceStore";
import { EXPERIENCES } from "../../utils/experience";

const OTHER = {
  [EXPERIENCES.MARKETPLACE]: {
    experience: EXPERIENCES.QUICK_COMMERCE,
    label: "Express",
    Icon: FiZap,
    path: "/quick",
    tone: "border-emerald-500/40 bg-emerald-500/10",
    accent: "text-emerald-300",
    iconWrap: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  },
  [EXPERIENCES.QUICK_COMMERCE]: {
    experience: EXPERIENCES.MARKETPLACE,
    label: "Marketplace",
    Icon: FiShoppingBag,
    path: "/categories",
    tone: "border-amber-500/40 bg-amber-500/10",
    accent: "text-amber-300",
    iconWrap: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  },
};

/**
 * @param {object}  props
 * @param {boolean} [props.closeCartOnSwitch] close the drawer after switching
 * @param {string}  [props.className]
 */
const OtherBasketNotice = ({ closeCartOnSwitch = true, className = "" }) => {
  const navigate = useNavigate();
  const cartExperience = useCartStore((state) => state.cartExperience);
  const getCartCountForExperience = useCartStore((state) => state.getCartCountForExperience);
  // Subscribing to `carts` keeps the count live when the other basket changes.
  useCartStore((state) => state.carts);

  const setExperience = useExperienceStore((state) => state.setExperience);
  const toggleCart = useUIStore((state) => state.toggleCart);
  const isCartOpen = useUIStore((state) => state.isCartOpen);

  const config = OTHER[cartExperience] ?? OTHER[EXPERIENCES.MARKETPLACE];
  const count = getCartCountForExperience(config.experience);

  if (!count) return null;

  const { Icon } = config;

  const handleSwitch = () => {
    setExperience(config.experience);
    if (closeCartOnSwitch && isCartOpen) toggleCart();
    navigate(config.path);
  };

  return (
    <button
      type="button"
      onClick={handleSwitch}
      className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white/30 ${config.tone} ${className}`}
    >
      <span className={`shrink-0 w-9 h-9 rounded-lg grid place-items-center ${config.iconWrap}`}>
        <Icon className="w-4.5 h-4.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">
          {count} {count === 1 ? "item" : "items"} in your {config.label} basket
        </span>
        <span className="block text-xs text-gray-300">
          Saved for you — they weren&apos;t removed.
        </span>
      </span>

      <span className={`shrink-0 flex items-center gap-1 text-xs font-semibold ${config.accent}`}>
        Switch
        <FiArrowRight className="w-3.5 h-3.5" />
      </span>
    </button>
  );
};

export default OtherBasketNotice;
