import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { categories as fallbackCategories } from "../../../../data/categories";
import { FiPackage, FiShoppingBag, FiStar, FiTag, FiZap } from "react-icons/fi";
import { IoShirtOutline, IoBagHandleOutline } from "react-icons/io5";
import { LuFootprints } from "react-icons/lu";
import { useCategoryStore } from "../../../../shared/store/categoryStore";

// Map category names to icons
const categoryIcons = {
  Clothing: IoShirtOutline,
  Footwear: LuFootprints,
  Bags: IoBagHandleOutline,
  Jewelry: FiStar,
  Accessories: FiTag,
  Athletic: FiZap,
};

const MobileCategoryIcons = () => {
  const { categories: apiCategories, getRootCategories, initialize } = useCategoryStore();
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollYRef = useRef(0);
  const location = useLocation();
  const categoryRefs = useRef({});
  const containerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [activeLineStyle, setActiveLineStyle] = useState({});
  const [isLineVisible, setIsLineVisible] = useState(false);
  const [shouldTransition, setShouldTransition] = useState(false);
  const previousCategoryIdRef = useRef(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      scrollYRef.current = currentScrollY;

      // Smooth transition: show icons when at top, hide when scrolled
      // Use a small threshold for immediate response
      setIsScrolling(currentScrollY >= 8);
    };

    // Use requestAnimationFrame for smooth 60fps updates
    let rafId = null;
    const onScroll = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          handleScroll();
          rafId = null;
        });
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Get current category from URL
  const getCurrentCategoryId = () => {
    const match = location.pathname.match(/\/(?:app\/)?category\/([^/]+)/);
    return match ? String(match[1]) : null;
  };

  const currentCategoryId = getCurrentCategoryId();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const categories = useMemo(() => {
    const roots = getRootCategories().filter((cat) => cat.isActive !== false);
    let mapped = [];

    if (!roots.length) {
      mapped = [...fallbackCategories];
    } else {
      mapped = roots.map((cat) => {
        const fallback = fallbackCategories.find(
          (fc) =>
            String(fc.id) === String(cat.id) ||
            String(fc.name || "").toLowerCase() ===
            String(cat.name || "").toLowerCase()
        );

        return {
          ...(fallback || {}),
          ...cat,
          id: String(cat.id ?? cat._id ?? fallback?.id ?? ""),
        };
      });
    }


    return mapped;
  }, [apiCategories, getRootCategories]);

  // Update line position when active category changes or container scrolls
  const updateLinePosition = (isScroll = false) => {
    if (currentCategoryId && categoryRefs.current[currentCategoryId] && containerRef.current && scrollContainerRef.current) {
      const activeElement = categoryRefs.current[currentCategoryId];
      const container = containerRef.current;
      const scrollContainer = scrollContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = activeElement.getBoundingClientRect();

      const elementWidth = elementRect.width;
      const lineWidth = 48; // Line width (48px)
      const left = elementRect.left - containerRect.left + (elementWidth - lineWidth) / 2; // Center the line

      // If scrolling, disable transition for instant updates
      if (isScroll) {
        isScrollingRef.current = true;
        setShouldTransition(false);

        // Clear any existing timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        // Re-enable transition after scrolling stops
        scrollTimeoutRef.current = setTimeout(() => {
          isScrollingRef.current = false;
        }, 200);
      }

      setActiveLineStyle({
        left: `${left}px`,
        width: `${lineWidth}px`,
      });
    }
  };

  // Handle category changes with smooth transition
  useEffect(() => {
    const prevCategoryId = previousCategoryIdRef.current;
    const categoryChanged = prevCategoryId !== null && prevCategoryId !== currentCategoryId;

    if (currentCategoryId) {
      setIsLineVisible(true);

      // If category changed (not just initial load), enable smooth transition
      if (categoryChanged) {
        // Enable transition first
        setShouldTransition(true);
        // Small delay to ensure transition CSS is applied before position change
        setTimeout(() => {
          updateLinePosition(false);
        }, 10);
      } else {
        // Initial load - no transition
        setShouldTransition(false);
        updateLinePosition(false);
      }

      previousCategoryIdRef.current = currentCategoryId;
    } else {
      setIsLineVisible(false);
    }
  }, [currentCategoryId, location.pathname]);

  // Handle scroll with instant updates
  useEffect(() => {
    if (scrollContainerRef.current) {
      let rafId = null;
      const handleScroll = () => {
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            updateLinePosition(true); // Pass true to indicate this is a scroll event
            rafId = null;
          });
        }
      };

      scrollContainerRef.current.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.removeEventListener('scroll', handleScroll);
        }
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      };
    }
  }, []);

  // Update on window resize
  useEffect(() => {
    const handleResize = () => {
      setTimeout(updateLinePosition, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentCategoryId]);

  // Category color mapping - matching the gradient colors
  const categoryColorsByName = {
    clothing: {
      icon: "text-pink-500",
      text: "text-pink-600",
      indicator: "bg-pink-500",
    }, // Clothing - Pink
    footwear: {
      icon: "text-amber-600",
      text: "text-amber-700",
      indicator: "bg-amber-600",
    }, // Footwear - Brown/Amber
    bags: {
      icon: "text-orange-500",
      text: "text-orange-600",
      indicator: "bg-orange-500",
    }, // Bags - Orange
    jewelry: {
      icon: "text-green-500",
      text: "text-green-600",
      indicator: "bg-green-500",
    }, // Jewelry - Green
    accessories: {
      icon: "text-purple-500",
      text: "text-purple-600",
      indicator: "bg-purple-500",
    }, // Accessories - Purple
    athletic: {
      icon: "text-blue-500",
      text: "text-blue-600",
      indicator: "bg-blue-500",
    }, // Athletic - Blue
  };

  const isActiveCategory = (categoryId) => {
    return (
      location.pathname === `/app/category/${String(categoryId)}` ||
      location.pathname === `/category/${String(categoryId)}`
    );
  };

  // Get color for active category
  const getActiveColor = (categoryName) => {
    const colorKey = String(categoryName || "").trim().toLowerCase();
    return (
      categoryColorsByName[colorKey] || {
        icon: "text-primary-500",
        text: "text-primary-500",
        indicator: "bg-primary-500",
      }
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <motion.div
        ref={scrollContainerRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4"
        style={{
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
        }}>
        {categories.map((category, index) => {
          const IconComponent = categoryIcons[category.name] || IoShirtOutline;
          const isActive = isActiveCategory(category.id);
          const activeColors =
            currentCategoryId && String(currentCategoryId) === String(category.id)
              ? getActiveColor(category.name)
              : null;
          return (
            <div
              key={category.id}
              ref={(el) => {
                if (el) categoryRefs.current[category.id] = el;
              }}
              className="flex-shrink-0">
                <Link
                  to={category.path || `/category/${category.id}`}
                  className="flex flex-col items-center gap-1.5 w-16 relative">
                {!isScrolling && (
                  <div>
                    {category.icon ? (
                      <span className="text-lg leading-none">{category.icon}</span>
                    ) : (
                      <IconComponent
                        className={`text-lg transition-colors duration-300 ${isActive && activeColors
                          ? activeColors.icon
                          : isActive
                            ? "text-primary-500"
                            : "text-gray-700 hover:text-primary-600"
                          }`}
                        style={{
                          strokeWidth:
                            category.name === "Clothing" ||
                              category.name === "Bags"
                              ? 5.5
                              : 2,
                        }}
                      />
                    )}
                  </div>
                )}
                <span
                  className={`text-[10px] font-semibold text-center line-clamp-1 transition-colors duration-300 ${isActive && activeColors
                    ? activeColors.text
                    : isActive
                      ? "text-primary-500"
                      : "text-gray-700"
                    }`}>
                  {category.name}
                </span>
              </Link>
            </div>
          );
        })}
      </motion.div>
      {/* Blue indicator line at bottom edge of header for selected category */}
      {isLineVisible && currentCategoryId && (
        <div
          className="absolute h-1 bg-blue-500 rounded-full"
          style={{
            ...activeLineStyle,
            bottom: '-12px', // Position at bottom edge of header (accounting for header py-3 padding)
            transformOrigin: 'left center',
            // Smooth transition when category changes, instant during scroll
            transition: shouldTransition && !isScrollingRef.current
              ? 'left 0.4s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)'
              : 'none',
          }}
        />
      )}
    </div>
  );
};

export default MobileCategoryIcons;
