import { useState, useEffect, useRef, useMemo } from "react";
import {
  FiSearch,
  FiExternalLink,
  FiX,
  FiTag,
  FiShoppingBag,
  FiGrid,
  FiZap,
  FiCompass,
  FiCheck,
} from "react-icons/fi";
import { useCategoryStore } from "../../../../shared/store/categoryStore";

const DEFAULT_STORE_PAGES = [
  {
    label: "Special Offers",
    value: "/offers",
    description: "Promotions, discounts & active campaigns",
    icon: FiTag,
  },
  {
    label: "All Products / Shop",
    value: "/shop",
    description: "Full storefront product catalog",
    icon: FiShoppingBag,
  },
  {
    label: "Category Directory",
    value: "/categories",
    description: "Browse all categories & subcategories",
    icon: FiGrid,
  },
  {
    label: "Quick Commerce Store",
    value: "/quick-commerce",
    description: "10-15 minute grocery & express essentials",
    icon: FiZap,
  },
  {
    label: "Daily Deals",
    value: "/daily-deals",
    description: "Time-limited discounted deals",
    icon: FiTag,
  },
  {
    label: "Flash Sale",
    value: "/flash-sale",
    description: "Flash sale collection",
    icon: FiZap,
  },
  {
    label: "New Arrivals",
    value: "/new-arrivals",
    description: "Recently added products",
    icon: FiShoppingBag,
  },
  {
    label: "Sell on DwellMart",
    value: "/sell-on-dwellmart",
    description: "Vendor onboarding & seller information",
    icon: FiCompass,
  },
];

const QUICK_PICKS = [
  { label: "Offers", value: "/offers" },
  { label: "Shop All", value: "/shop" },
  { label: "Categories", value: "/categories" },
  { label: "Quick Commerce", value: "/quick-commerce" },
];

const BannerLinkInput = ({
  value = "",
  onChange,
  name = "link",
  placeholder = "/category/electronics or https://example.com",
  className = "",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const { categories, initialize: initCategories } = useCategoryStore();

  useEffect(() => {
    if (!categories || categories.length === 0) {
      initCategories();
    }
  }, [categories, initCategories]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const triggerChange = (newValue) => {
    if (typeof onChange === "function") {
      onChange({
        target: {
          name,
          value: newValue,
          type: "text",
        },
      });
    }
  };

  // Convert categories from store into suggestion items
  const categorySuggestions = useMemo(() => {
    return (categories || [])
      .filter((cat) => cat.isActive !== false)
      .map((cat) => ({
        label: cat.name,
        value: `/category/${cat.slug || cat._id || cat.id}`,
        description: cat.description || `Browse ${cat.name}`,
        type: "category",
        icon: FiTag,
      }));
  }, [categories]);

  // Filter items based on current value
  const { filteredPages, filteredCategories } = useMemo(() => {
    const q = String(value || "").trim().toLowerCase();

    if (!q) {
      return {
        filteredPages: DEFAULT_STORE_PAGES,
        filteredCategories: categorySuggestions.slice(0, 15),
      };
    }

    const matches = (item) =>
      item.label.toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q));

    return {
      filteredPages: DEFAULT_STORE_PAGES.filter(matches),
      filteredCategories: categorySuggestions.filter(matches),
    };
  }, [value, categorySuggestions]);

  // Flattened list for keyboard navigation
  const flatSuggestions = useMemo(() => {
    return [...filteredPages, ...filteredCategories];
  }, [filteredPages, filteredCategories]);

  // Select a suggestion
  const handleSelect = (selectedUrl) => {
    triggerChange(selectedUrl);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setIsOpen(true);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < flatSuggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : flatSuggestions.length - 1
      );
    } else if (e.key === "Enter") {
      if (isOpen && flatSuggestions[highlightedIndex]) {
        e.preventDefault();
        handleSelect(flatSuggestions[highlightedIndex].value);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Test link in a new tab
  const handleTestLink = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const target = String(value || "").trim();
    if (!target) return;

    if (/^https?:\/\//i.test(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
    } else {
      window.open(target, "_blank");
    }
  };

  // Is typed value a custom external link or unrecognized route
  const isCustomUrl =
    value &&
    !flatSuggestions.some(
      (item) => item.value.toLowerCase() === value.trim().toLowerCase()
    );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input Field Container */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 text-gray-400 pointer-events-none">
          <FiSearch className="w-4 h-4" />
        </div>

        <input
          ref={inputRef}
          type="text"
          name={name}
          value={value}
          disabled={disabled}
          autoComplete="off"
          onChange={(e) => {
            triggerChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-10 pr-20 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors shadow-sm"
        />

        {/* Action icons on the right */}
        <div className="absolute right-2.5 flex items-center gap-1.5">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerChange("");
                inputRef.current?.focus();
              }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
              title="Clear link"
            >
              <FiX className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleTestLink}
            disabled={!value}
            className={`p-1.5 rounded-md transition-colors ${
              value
                ? "text-primary-600 hover:bg-primary-50 hover:text-primary-700 cursor-pointer"
                : "text-gray-300 cursor-not-allowed"
            }`}
            title={value ? "Test link in new tab" : "Enter a link to test"}
          >
            <FiExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Pick Chips */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="text-xs text-gray-500 font-medium mr-1">
          Quick picks:
        </span>
        {QUICK_PICKS.map((pick) => {
          const isSelected = value === pick.value;
          return (
            <button
              key={pick.value}
              type="button"
              onClick={() => handleSelect(pick.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all font-medium flex items-center gap-1 ${
                isSelected
                  ? "bg-primary-50 border-primary-400 text-primary-700 font-semibold shadow-xs"
                  : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700 hover:border-gray-300"
              }`}
            >
              {isSelected && <FiCheck className="w-3 h-3 text-primary-600" />}
              {pick.label}
            </button>
          );
        })}
      </div>

      {/* Suggestion Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden max-h-80 overflow-y-auto">
          {flatSuggestions.length === 0 && !isCustomUrl ? (
            <div className="p-4 text-center text-sm text-gray-500">
              No matching pages or categories found.
            </div>
          ) : (
            <div className="py-2 divide-y divide-gray-100">
              {/* Store Pages Section */}
              {filteredPages.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Store Pages</span>
                    <span className="text-[10px] font-normal text-gray-400">
                      {filteredPages.length}
                    </span>
                  </div>
                  {filteredPages.map((page, idx) => {
                    const isSelected = value === page.value;
                    const isHighlighted = highlightedIndex === idx;
                    const Icon = page.icon || FiShoppingBag;

                    return (
                      <button
                        key={page.value}
                        type="button"
                        onClick={() => handleSelect(page.value)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 text-sm transition-colors ${
                          isHighlighted || isSelected
                            ? "bg-primary-50/80 text-primary-900"
                            : "hover:bg-gray-50 text-gray-800"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-1 rounded-md bg-gray-100 text-gray-600">
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-xs sm:text-sm truncate">
                              {page.label}
                            </p>
                            <p className="text-[11px] text-gray-400 truncate">
                              {page.description}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded border border-primary-200 shrink-0">
                          {page.value}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Store Categories Section */}
              {filteredCategories.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Store Categories</span>
                    <span className="text-[10px] font-normal text-gray-400">
                      {filteredCategories.length}
                    </span>
                  </div>
                  {filteredCategories.map((cat, catIdx) => {
                    const overallIdx = filteredPages.length + catIdx;
                    const isSelected = value === cat.value;
                    const isHighlighted = highlightedIndex === overallIdx;

                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => handleSelect(cat.value)}
                        onMouseEnter={() => setHighlightedIndex(overallIdx)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 text-sm transition-colors ${
                          isHighlighted || isSelected
                            ? "bg-primary-50/80 text-primary-900"
                            : "hover:bg-gray-50 text-gray-800"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-1 rounded-md bg-amber-50 text-amber-600">
                            <FiTag className="w-3.5 h-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-xs sm:text-sm truncate">
                              {cat.label}
                            </p>
                            <p className="text-[11px] text-gray-400 truncate">
                              Category Catalog
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                          {cat.value}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Custom / External Link Option */}
              {isCustomUrl && (
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      triggerChange(value.trim());
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 flex items-center justify-between gap-3 text-sm bg-blue-50/50 hover:bg-blue-50 text-blue-900 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="p-1 rounded-md bg-blue-100 text-blue-600">
                        <FiCompass className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-xs sm:text-sm truncate">
                          Use custom link
                        </p>
                        <p className="text-[11px] text-blue-600 truncate">
                          {value}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-blue-600 font-medium shrink-0">
                      Enter ↵
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BannerLinkInput;
