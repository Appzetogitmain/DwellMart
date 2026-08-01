import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiCheckCircle, FiArrowRight, FiZap, FiShoppingBag, FiClock, FiPackage } from "react-icons/fi";
import { useExperienceStore } from "../../../../shared/store/experienceStore";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import { EXPERIENCES } from "../../../../shared/utils/experience";

/**
 * Quick Commerce / Marketplace Experience Selector
 *
 * Compact Dual Cards — low-profile, sleek, integrated into the Home page layout.
 * Rendered directly below the Hero Banner slider.
 * Renders nothing when the Quick Commerce feature flag is off.
 */
const ExperienceSwitcher = ({ className = "" }) => {
  const navigate = useNavigate();
  const { experience, setExperience } = useExperienceStore();
  const { settings } = useSettingsStore();
  const quickCommerceEnabled = settings?.features?.quickCommerceEnabled === true;

  if (!quickCommerceEnabled) return null;

  const options = [
    {
      value: EXPERIENCES.QUICK_COMMERCE,
      title: "Quick Commerce",
      subtitle: "Groceries, Food, Pharmacy & Daily Essentials",
      icon: FiZap,
      tag: "10-30 Mins",
      tagIcon: FiClock,
      path: "/quick",
    },
    {
      value: EXPERIENCES.MARKETPLACE,
      title: "Marketplace",
      subtitle: "Fashion, Electronics, Home & Everything Else",
      icon: FiShoppingBag,
      tag: "Pan-India",
      tagIcon: FiPackage,
      path: "/home",
    },
  ];

  const handleSwitch = (option) => {
    if (experience === option.value) return;
    setExperience(option.value);
    navigate(option.path);
  };

  return (
    <section className={`w-full px-4 sm:px-6 my-2 sm:my-3 ${className}`}>
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {options.map((option) => {
          const isActive = experience === option.value;
          const Icon = option.icon;
          const TagIcon = option.tagIcon;

          return (
            <motion.button
              key={option.value}
              type="button"
              onClick={() => handleSwitch(option)}
              aria-pressed={isActive}
              aria-label={`Select ${option.title} experience`}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              transition={{ duration: 0.2 }}
              className={`relative text-left rounded-2xl p-3.5 sm:p-4 transition-all duration-200 flex items-center justify-between outline-none focus:ring-2 focus:ring-brand-primary ${
                isActive
                  ? "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20 border border-amber-400/60 ring-2 ring-amber-400/30"
                  : "bg-surface border border-border text-content hover:border-brand-primary/50 hover:shadow-sm hover:bg-surface-muted/60"
              }`}
            >
              {/* Left Side: Vector Icon + Title & Subtitle */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform ${
                    isActive
                      ? "bg-slate-950/15 text-slate-950 backdrop-blur-xs"
                      : "bg-brand-primary/10 text-brand-primary border border-brand-primary/20"
                  }`}
                >
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                      {option.title}
                    </h3>
                    <span
                      className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                        isActive
                          ? "bg-slate-950/15 text-slate-950"
                          : "bg-surface-muted text-content-secondary border border-border"
                      }`}
                    >
                      <TagIcon className="text-[11px]" />
                      {option.tag}
                    </span>
                  </div>
                  <p
                    className={`text-xs truncate font-medium ${
                      isActive ? "text-slate-950/80" : "text-content-secondary"
                    }`}
                  >
                    {option.subtitle}
                  </p>
                </div>
              </div>

              {/* Right Side: Active Pill or Switch Arrow */}
              <div className="shrink-0 ml-3">
                {isActive ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950 text-amber-400 text-xs font-black uppercase tracking-wider shadow-xs">
                    <FiCheckCircle className="text-sm text-green-400" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-muted border border-border text-content-secondary text-xs font-bold hover:text-brand-primary hover:border-brand-primary/30 transition-all">
                    Switch
                    <FiArrowRight className="text-xs" />
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
};

export default ExperienceSwitcher;
