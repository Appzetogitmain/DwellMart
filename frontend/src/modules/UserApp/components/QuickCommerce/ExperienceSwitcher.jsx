import { useNavigate } from "react-router-dom";
import { FiZap, FiShoppingBag } from "react-icons/fi";
import { useExperienceStore } from "../../../../shared/store/experienceStore";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import { EXPERIENCES } from "../../../../shared/utils/experience";

/**
 * Switches between the Marketplace and Quick Commerce experiences.
 *
 * Renders nothing when the Quick Commerce feature flag is off, so the
 * storefront is byte-identical to before the feature existed.
 *
 * Switching never clears the other experience's cart — they are independent.
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
      label: "Quick Commerce",
      icon: FiZap,
      path: "/quick",
    },
    {
      value: EXPERIENCES.MARKETPLACE,
      label: "Marketplace",
      icon: FiShoppingBag,
      path: "/home",
    },
  ];

  const handleSwitch = (option) => {
    setExperience(option.value);
    navigate(option.path);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = experience === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSwitch(option)}
            aria-pressed={isActive}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
              isActive
                ? "bg-brand-primary text-content-inverse border-brand-primary"
                : "bg-surface text-content-secondary border-border hover:bg-surface-muted"
            }`}
          >
            <Icon className="text-base" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default ExperienceSwitcher;
