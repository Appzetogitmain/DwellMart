import { useState, useRef, useEffect, useMemo } from "react";
import { FiChevronDown, FiChevronUp, FiSearch } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";

const AnimatedSelect = ({
  value,
  onChange,
  options = [],
  placeholder = "Select an option",
  className = "",
  disabled = false,
  searchable = false,
  required = false,
  name,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery) return options;
    return options.filter((option) => {
      const label = typeof option === "object" ? option.label : option;
      return label.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [options, searchQuery, searchable]);

  // Get selected option label
  const selectedLabel = useMemo(() => {
    if (!value) return placeholder;
    const option = options.find((opt) => {
      const optValue = typeof opt === "object" ? opt.value : opt;
      return optValue === value || String(optValue) === String(value);
    });
    if (!option) return placeholder;
    return typeof option === "object" ? option.label : option;
  }, [value, options, placeholder]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [isOpen]);

  // Focus search input when dropdown opens and searchable
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, searchable]);

  // Handle option selection
  const handleSelect = (optionValue) => {
    if (onChange) {
      // Find the form element if containerRef is inside a form
      const formElement = containerRef.current?.closest("form");

      // Create a synthetic event object to match native select behavior
      // Include closest method to support form queries
      const syntheticEvent = {
        target: {
          name: name || "",
          value: optionValue,
          closest: (selector) => {
            if (selector === "form" && formElement) {
              return formElement;
            }
            // For other selectors, try to find from containerRef
            return containerRef.current?.closest(selector) || null;
          },
        },
      };
      onChange(syntheticEvent);
    }

    setIsOpen(false);
    setSearchQuery("");
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (disabled) return;

    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (filteredOptions.length > 0) {
          const firstOption = filteredOptions[0];
          const firstValue =
            typeof firstOption === "object" ? firstOption.value : firstOption;
          handleSelect(firstValue);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSearchQuery("");
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (isOpen) {
          setIsOpen(false);
        }
        break;
      default:
        break;
    }
  };

  // Check if dropdown should open upward
  const [openUpward, setOpenUpward] = useState(false);
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const estimatedHeight = Math.min(
        filteredOptions.length * 48 + (searchable ? 60 : 0),
        300
      );

      setOpenUpward(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
    }
  }, [isOpen, filteredOptions.length, searchable]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Selected Value Display */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full px-4 py-2.5 text-left border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white flex items-center justify-between transition-all duration-200 ${disabled
            ? "bg-gray-100 cursor-not-allowed text-gray-400"
            : "text-gray-900 hover:border-primary-400 cursor-pointer"
          } ${!value ? "text-gray-500" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}>
        <span className="truncate flex-1 text-sm sm:text-base">
          {selectedLabel}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-2 flex-shrink-0">
          <FiChevronDown className="text-gray-500 text-lg" />
        </motion.div>
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
              onClick={() => {
                setIsOpen(false);
                setSearchQuery("");
              }}
              className="fixed inset-0 bg-black/20 z-40 sm:hidden"
            />

            {/* Dropdown Menu */}
            <motion.div
              ref={dropdownRef}
              initial={{
                opacity: 0,
                y: openUpward ? 10 : -10,
                scale: 0.95,
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: openUpward ? 10 : -10,
                scale: 0.95,
              }}
              transition={{
                duration: 0.25,
                ease: [0.4, 0, 0.2, 1],
              }}
              className={`absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden ${openUpward ? "bottom-full mb-2" : "top-full"
                }`}
              style={{
                maxHeight: "300px",
                transformOrigin: openUpward ? "bottom center" : "top center",
              }}>
              {/* Search Input */}
              {searchable && (
                <div className="p-2 border-b border-gray-200 bg-gray-50">
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search options..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              )}

              {/* Options List */}
              <div className="overflow-y-auto max-h-[240px] scrollbar-admin">
                {filteredOptions.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">
                    {searchQuery ? "No options found" : "No options available"}
                  </div>
                ) : (
                  <div className="py-1 flex flex-col">
                    {filteredOptions.map((option, index) => {
                      const optionValue =
                        typeof option === "object" ? option.value : option;
                      const optionLabel =
                        typeof option === "object" ? option.label : option;
                      const isSelected =
                        optionValue === value ||
                        String(optionValue) === String(value);

                      return (
                        <motion.button
                          key={
                            typeof option === "object" ? option.value : option
                          }
                          type="button"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.02 }}
                          onClick={() => handleSelect(optionValue)}
                          className={`w-full px-4 py-2.5 text-left text-sm transition-colors duration-150 ${isSelected
                              ? "bg-primary-600 text-white font-medium"
                              : "text-gray-900 hover:bg-gray-50"
                            }`}
                          role="option"
                          aria-selected={isSelected}>
                          {optionLabel}
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Hidden input for form submission and validation */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={value || ""}
          required={required}
        />
      )}
    </div>
  );
};

export default AnimatedSelect;
