import { useState, useRef, useEffect, useMemo } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useCategoryStore } from "../../../shared/store/categoryStore";

const CategorySelector = ({
  value,
  subcategoryId,
  onChange,
  required = false,
  className = "",
  disabled = false,
}) => {
  const {
    categories,
    getRootCategories,
    getCategoriesByParent,
    getCategoryById,
  } = useCategoryStore();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredCategoryId, setHoveredCategoryId] = useState(null);
  const [hoveredSubcategoryId, setHoveredSubcategoryId] = useState(null);
  const containerRef = useRef(null);
  const parentDropdownRef = useRef(null);
  const subcategoryDropdownRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  // Get root categories (parent categories)
  const rootCategories = useMemo(() => {
    return getRootCategories().filter((cat) => cat.isActive !== false);
  }, [categories, getRootCategories]);

  // Get selected category and subcategory info
  const selectedCategory = value ? getCategoryById(value) : null;
  const selectedSubcategory = subcategoryId
    ? getCategoryById(subcategoryId)
    : null;
  const parentCategory = selectedSubcategory
    ? getCategoryById(selectedSubcategory.parentId)
    : selectedCategory;

  // Get subcategories for hovered category
  const hoveredSubcategories = useMemo(() => {
    if (!hoveredCategoryId) return [];
    return getCategoriesByParent(hoveredCategoryId).filter(
      (cat) => cat.isActive !== false
    );
  }, [hoveredCategoryId, categories, getCategoriesByParent]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setHoveredCategoryId(null);
        // Clear any pending timeout
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        // Cleanup timeout on unmount
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
      };
    }
  }, [isOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  // Position subcategory dropdown to the right of parent dropdown
  useEffect(() => {
    if (
      hoveredCategoryId &&
      subcategoryDropdownRef.current &&
      parentDropdownRef.current &&
      containerRef.current
    ) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const parentDropdownRect =
        parentDropdownRef.current.getBoundingClientRect();
      const hoveredElement = parentDropdownRef.current.querySelector(
        `[data-category-id="${hoveredCategoryId}"]`
      );

      if (hoveredElement) {
        const elementRect = hoveredElement.getBoundingClientRect();
        const dropdown = subcategoryDropdownRef.current;
        const viewportWidth = window.innerWidth;
        const dropdownWidth = 200; // min-w-[200px]

        // Position to the right of the parent dropdown container
        // Calculate left position relative to container
        let left = parentDropdownRect.right - containerRect.left + 8; // Right edge of parent dropdown + gap
        // Calculate top position to align with hovered item, relative to container
        let top = elementRect.top - containerRect.top;

        // Check if dropdown would overflow viewport, adjust if needed
        const rightEdge = parentDropdownRect.right + dropdownWidth + 8;
        if (rightEdge > viewportWidth - 20) {
          // Position to the left of parent dropdown instead
          left =
            parentDropdownRect.left - containerRect.left - dropdownWidth - 8;
        }

        // Ensure dropdown doesn't go above or below viewport
        if (top < 0) {
          top = 0;
        }

        // Ensure dropdown doesn't go below the parent dropdown
        const maxTop = parentDropdownRect.height - 40; // Leave some space
        if (top > maxTop) {
          top = maxTop;
        }

        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;
      }
    }
  }, [hoveredCategoryId, isOpen]);

  const handleCategorySelect = (categoryId) => {
    // Clear subcategory when selecting a new parent
    onChange({
      target: {
        name: "categoryId",
        value: categoryId,
      },
    });
    onChange({
      target: {
        name: "subcategoryId",
        value: "",
      },
    });
    setIsOpen(false);
    setHoveredCategoryId(null);
  };

  const handleSubcategorySelect = (subcategoryId, parentId) => {
    onChange({
      target: {
        name: "categoryId",
        value: parentId,
      },
    });
    onChange({
      target: {
        name: "subcategoryId",
        value: subcategoryId,
      },
    });
    setIsOpen(false);
    setHoveredCategoryId(null);
  };

  // Display text
  const displayText = useMemo(() => {
    if (selectedSubcategory && parentCategory) {
      return `${parentCategory.name} (${selectedSubcategory.name})`;
    }
    if (selectedCategory) {
      return selectedCategory.name;
    }
    return "Select Category";
  }, [selectedCategory, selectedSubcategory, parentCategory]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Selected Value Display */}
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
          // Clear any pending timeout when toggling
          if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
          }
          if (!isOpen) {
            setHoveredCategoryId(null);
          }
        }}
        disabled={disabled}
        className={`w-full px-4 py-2.5 text-left border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center justify-between transition-all duration-200 hover:border-primary-400 ${
          disabled ? "bg-gray-100 cursor-not-allowed text-gray-400" : "bg-white"
        } ${!value ? "text-gray-500" : "text-gray-900"}`}>
        <span className="truncate">{displayText}</span>
        <FiChevronDown
          className={`ml-2 text-gray-500 transition-transform ${
            isOpen ? "transform rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setIsOpen(false);
                setHoveredCategoryId(null);
              }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 sm:hidden"
            />

            {/* Categories Dropdown */}
            <motion.div
              ref={parentDropdownRef}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
              <div className="py-1">
                {rootCategories.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-gray-500 text-center">
                    No categories available
                  </div>
                ) : (
                  rootCategories.map((category) => {
                    const subcategories = getCategoriesByParent(
                      category.id
                    ).filter((cat) => cat.isActive !== false);
                    const hasSubcategories = subcategories.length > 0;
                    const isSelected = value === category.id && !subcategoryId;
                    const isHovered = hoveredCategoryId === category.id;

                    return (
                      <div key={category.id} data-category-id={category.id}>
                        <motion.div
                          whileHover={{
                            backgroundColor: isSelected
                              ? "rgba(40, 116, 240, 0.1)"
                              : "rgba(249, 250, 251, 1)",
                          }}
                          className={`px-4 py-2 cursor-pointer flex items-center justify-between transition-colors duration-150 ${
                            isSelected
                              ? "bg-primary-50 text-primary-600"
                              : "text-gray-900"
                          }`}
                          onClick={() => {
                            handleCategorySelect(category.id);
                          }}
                          onMouseEnter={() => {
                            if (hasSubcategories) {
                              // Clear any pending close timeout
                              if (closeTimeoutRef.current) {
                                clearTimeout(closeTimeoutRef.current);
                                closeTimeoutRef.current = null;
                              }
                              setHoveredCategoryId(category.id);
                            }
                          }}
                          onMouseLeave={(e) => {
                            // Clear any existing timeout
                            if (closeTimeoutRef.current) {
                              clearTimeout(closeTimeoutRef.current);
                            }
                            // 0.20 second delay before closing subcategory dropdown
                            closeTimeoutRef.current = setTimeout(() => {
                              if (subcategoryDropdownRef.current) {
                                const rect =
                                  subcategoryDropdownRef.current.getBoundingClientRect();
                                const x = e.clientX;
                                const y = e.clientY;
                                const isHoveringSub =
                                  x >= rect.left &&
                                  x <= rect.right &&
                                  y >= rect.top &&
                                  y <= rect.bottom;
                                if (!isHoveringSub) {
                                  setHoveredCategoryId(null);
                                }
                              } else {
                                setHoveredCategoryId(null);
                              }
                              closeTimeoutRef.current = null;
                            }, 200); // 0.20 seconds = 200ms
                          }}>
                          <span className="flex-1">{category.name}</span>
                          {hasSubcategories && (
                            <FiChevronRight className="ml-2 text-gray-400" />
                          )}
                        </motion.div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>

            {/* Subcategories Dropdown - Positioned to the right of parent dropdown */}
            {hoveredCategoryId && hoveredSubcategories.length > 0 && (
              <motion.div
                ref={subcategoryDropdownRef}
                initial={{ opacity: 0, x: -10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.95 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="absolute bg-white border border-gray-200 rounded-xl shadow-xl min-w-[200px] z-[60]"
                onMouseEnter={() => {
                  if (closeTimeoutRef.current) {
                    clearTimeout(closeTimeoutRef.current);
                    closeTimeoutRef.current = null;
                  }
                }}
                onMouseLeave={() => {
                  if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                  closeTimeoutRef.current = setTimeout(() => {
                    setHoveredCategoryId(null);
                    closeTimeoutRef.current = null;
                  }, 200);
                }}>
                <div className="py-1 max-h-60 overflow-y-auto">
                  {hoveredSubcategories.map((subcategory) => {
                    const isSubSelected = subcategoryId === subcategory.id;
                    const childSubs = getCategoriesByParent(subcategory.id).filter((c) => c.isActive !== false);
                    const hasChildSubs = childSubs.length > 0;

                    return (
                      <div key={subcategory.id} className="relative group">
                        <motion.div
                          onClick={() => {
                            if (!hasChildSubs) {
                              handleSubcategorySelect(subcategory.id, hoveredCategoryId);
                            }
                          }}
                          onMouseEnter={() => setHoveredSubcategoryId(subcategory.id)}
                          whileHover={{
                            backgroundColor: isSubSelected
                              ? "rgba(40, 116, 240, 0.1)"
                              : "rgba(249, 250, 251, 1)",
                          }}
                          className={`px-4 py-2 cursor-pointer transition-colors duration-150 flex items-center justify-between ${
                            isSubSelected
                              ? "bg-primary-50 text-primary-600 font-bold"
                              : "text-gray-900"
                          }`}>
                          <span>{subcategory.name}</span>
                          {hasChildSubs && <FiChevronRight className="ml-2 text-gray-400 text-xs" />}
                        </motion.div>

                        {/* Tier 3 Flyout for Sub-subcategories */}
                        {hasChildSubs && hoveredSubcategoryId === subcategory.id && (
                          <div className="absolute left-full top-0 ml-1 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[180px] z-[70] py-1 max-h-60 overflow-y-auto">
                            {childSubs.map((leaf) => (
                              <div
                                key={leaf.id}
                                onClick={() => handleSubcategorySelect(leaf.id, hoveredCategoryId)}
                                className={`px-4 py-2 text-xs cursor-pointer hover:bg-gray-50 transition-colors ${
                                  subcategoryId === leaf.id ? "bg-primary-50 text-primary-600 font-bold" : "text-gray-800"
                                }`}>
                                {leaf.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>

      {/* Hidden input for form validation */}
      {required && (
        <input type="hidden" value={value || ""} required={required} />
      )}
    </div>
  );
};

export default CategorySelector;
