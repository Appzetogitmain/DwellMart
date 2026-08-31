import { useState, useRef, useEffect, useMemo } from "react";
import {
  FiChevronDown,
  FiChevronRight,
  FiChevronLeft,
  FiSearch,
  FiX,
  FiCheck,
  FiLayers,
  FiFolder,
} from "react-icons/fi";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLevel1Id, setActiveLevel1Id] = useState(null);
  const [activeLevel2Id, setActiveLevel2Id] = useState(null);
  
  // Mobile drilldown navigation stack: [ { level: 1, parentId: null, title: 'All Categories' }, { level: 2, parentId: '...', title: '...' }, ... ]
  const [mobileStack, setMobileStack] = useState([{ level: 1, parentId: null, title: 'All Categories' }]);

  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Map for fast category lookup
  const categoryMap = useMemo(() => {
    const map = new Map();
    (categories || []).forEach((cat) => {
      map.set(String(cat.id || cat._id), cat);
    });
    return map;
  }, [categories]);

  // Helper: compute full breadcrumb path array for any category
  const getCategoryPath = useMemo(() => {
    return (targetId) => {
      if (!targetId || !categoryMap.has(String(targetId))) return [];
      const path = [];
      let current = categoryMap.get(String(targetId));
      const visited = new Set();

      while (current && !visited.has(String(current.id || current._id))) {
        visited.add(String(current.id || current._id));
        path.unshift(current);
        if (current.parentId && categoryMap.has(String(current.parentId))) {
          current = categoryMap.get(String(current.parentId));
        } else {
          break;
        }
      }
      return path;
    };
  }, [categoryMap]);

  // Build a flat list of all searchable categories with full breadcrumb path
  const searchableList = useMemo(() => {
    const activeCategories = (categories || []).filter((cat) => cat.isActive !== false);

    return activeCategories.map((cat) => {
      const pathArray = getCategoryPath(cat.id || cat._id);
      const rootCat = pathArray[0] || cat;
      const isRoot = !cat.parentId;
      const isLeaf = getCategoriesByParent(cat.id || cat._id).filter((c) => c.isActive !== false).length === 0;

      return {
        id: String(cat.id || cat._id),
        name: cat.name,
        isRoot,
        isLeaf,
        level: pathArray.length,
        rootId: String(rootCat.id || rootCat._id),
        parentId: cat.parentId ? String(cat.parentId) : null,
        fullPath: pathArray.map((p) => p.name).join(" › "),
        pathSegments: pathArray.map((p) => p.name),
      };
    });
  }, [categories, getCategoryPath, getCategoriesByParent]);

  // Filtered search list
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return searchableList.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.fullPath.toLowerCase().includes(query)
    );
  }, [searchQuery, searchableList]);

  // Active categories for Level 1, Level 2, Level 3
  const level1Categories = useMemo(() => {
    return getRootCategories().filter((cat) => cat.isActive !== false);
  }, [categories, getRootCategories]);

  const level2Categories = useMemo(() => {
    if (!activeLevel1Id) return [];
    return getCategoriesByParent(activeLevel1Id).filter((cat) => cat.isActive !== false);
  }, [activeLevel1Id, categories, getCategoriesByParent]);

  const level3Categories = useMemo(() => {
    if (!activeLevel2Id) return [];
    return getCategoriesByParent(activeLevel2Id).filter((cat) => cat.isActive !== false);
  }, [activeLevel2Id, categories, getCategoriesByParent]);

  // Resolve selected item path for display
  const selectedPath = useMemo(() => {
    const targetId = subcategoryId || value;
    if (!targetId) return [];
    return getCategoryPath(targetId);
  }, [value, subcategoryId, getCategoryPath]);

  const displayText = useMemo(() => {
    if (selectedPath.length > 0) {
      return selectedPath.map((p) => p.name).join(" › ");
    }
    return "Select Category";
  }, [selectedPath]);

  // Synchronize active level selections with currently selected value when opened
  useEffect(() => {
    if (isOpen) {
      if (selectedPath.length > 0) {
        if (selectedPath[0]) setActiveLevel1Id(String(selectedPath[0].id || selectedPath[0]._id));
        if (selectedPath[1]) setActiveLevel2Id(String(selectedPath[1].id || selectedPath[1]._id));
      } else if (level1Categories.length > 0 && !activeLevel1Id) {
        setActiveLevel1Id(String(level1Categories[0].id || level1Categories[0]._id));
      }
      setMobileStack([{ level: 1, parentId: null, title: 'All Categories' }]);
      if (searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 150);
      }
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Selection Handlers
  const handleSelectRootOnly = (rootCatId) => {
    onChange({ target: { name: "categoryId", value: String(rootCatId) } });
    onChange({ target: { name: "subcategoryId", value: "" } });
    setIsOpen(false);
  };

  const handleSelectSubcategory = (subCatId, rootCatId) => {
    onChange({ target: { name: "categoryId", value: String(rootCatId) } });
    onChange({ target: { name: "subcategoryId", value: String(subCatId) } });
    setIsOpen(false);
  };

  const handleSelectLeafFromSearch = (item) => {
    if (item.isRoot) {
      handleSelectRootOnly(item.id);
    } else {
      handleSelectSubcategory(item.id, item.rootId);
    }
    setSearchQuery("");
    setIsOpen(false);
  };

  const handleClearSelection = (e) => {
    e.stopPropagation();
    onChange({ target: { name: "categoryId", value: "" } });
    onChange({ target: { name: "subcategoryId", value: "" } });
    setActiveLevel1Id(null);
    setActiveLevel2Id(null);
  };

  // Mobile Drilldown Navigation
  const currentMobileView = mobileStack[mobileStack.length - 1];
  const currentMobileItems = useMemo(() => {
    if (currentMobileView.level === 1) {
      return level1Categories;
    }
    return getCategoriesByParent(currentMobileView.parentId).filter((cat) => cat.isActive !== false);
  }, [currentMobileView, level1Categories, getCategoriesByParent]);

  const handleMobileDrillDown = (cat) => {
    const catId = String(cat.id || cat._id);
    const children = getCategoriesByParent(catId).filter((c) => c.isActive !== false);
    if (children.length > 0) {
      setMobileStack((prev) => [
        ...prev,
        {
          level: prev.length + 1,
          parentId: catId,
          title: cat.name,
          category: cat,
        },
      ]);
    } else {
      // Leaf reached -> select and finish
      const path = getCategoryPath(catId);
      const rootId = path[0] ? String(path[0].id || path[0]._id) : catId;
      if (path.length <= 1) {
        handleSelectRootOnly(catId);
      } else {
        handleSelectSubcategory(catId, rootId);
      }
    }
  };

  const handleMobileBack = () => {
    if (mobileStack.length > 1) {
      setMobileStack((prev) => prev.slice(0, -1));
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Selected Value Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        className={`w-full min-h-[42px] px-3.5 py-2 text-left border rounded-xl flex items-center justify-between gap-2 transition-all shadow-sm ${
          disabled
            ? "bg-slate-100 border-slate-200 cursor-not-allowed text-slate-400"
            : isOpen
            ? "bg-white border-brand-primary ring-2 ring-brand-primary/20"
            : "bg-white border-slate-300 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FiLayers className={`w-4 h-4 flex-shrink-0 ${selectedPath.length > 0 ? "text-brand-primary" : "text-slate-400"}`} />
          {selectedPath.length > 0 ? (
            <div className="flex items-center flex-wrap gap-1 text-xs sm:text-sm font-medium text-slate-800 truncate">
              {selectedPath.map((item, index) => (
                <span key={item.id || item._id} className="inline-flex items-center gap-1">
                  <span className={index === selectedPath.length - 1 ? "font-bold text-slate-900" : "text-slate-600"}>
                    {item.name}
                  </span>
                  {index < selectedPath.length - 1 && (
                    <span className="text-slate-300">›</span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-slate-400">Select Category...</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {selectedPath.length > 0 && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClearSelection}
              className="p-1 text-slate-400 hover:text-rose-500 rounded-full hover:bg-slate-100 transition-colors"
              title="Clear category"
            >
              <FiX className="w-3.5 h-3.5" />
            </span>
          )}
          <FiChevronDown
            className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
              isOpen ? "transform rotate-180 text-brand-primary" : ""
            }`}
          />
        </div>
      </button>

      {/* Dropdown Container */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for Mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
            />

            {/* Main Dropdown Panel */}
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="fixed inset-x-3 bottom-3 top-20 md:static md:inset-auto md:absolute md:top-full md:left-0 md:right-0 md:mt-2 z-50 bg-white rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col md:max-w-4xl md:w-[720px] lg:w-[840px]"
            >
              {/* Header with Search */}
              <div className="p-3 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                <div className="relative flex-1">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any category, subcategory, or item..."
                    className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary placeholder:text-slate-400 shadow-sm"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                      <FiX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="md:hidden p-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {/* BODY: Search Results View OR Multi-Level Browser */}
              {searchQuery.trim() ? (
                /* ── Search Results List ── */
                <div className="overflow-y-auto max-h-[380px] p-2 divide-y divide-slate-50">
                  {searchResults.length === 0 ? (
                    <div className="py-12 text-center">
                      <FiFolder className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-600">No categories found</p>
                      <p className="text-xs text-slate-400 mt-0.5">No match for "{searchQuery}"</p>
                    </div>
                  ) : (
                    searchResults.map((item) => {
                      const isSelected = String(subcategoryId || value) === String(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectLeafFromSearch(item)}
                          className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between group ${
                            isSelected
                              ? "bg-brand-primary/10 text-brand-primary font-semibold"
                              : "hover:bg-slate-50 text-slate-800"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 group-hover:text-brand-primary">
                              {item.name}
                            </p>
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {item.fullPath}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              Level {item.level}
                            </span>
                            {isSelected && <FiCheck className="w-4 h-4 text-brand-primary" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* ── Normal Cascading Navigation ── */
                <>
                  {/* DESKTOP 3-COLUMN VIEW (Hidden on Mobile) */}
                  <div className="hidden md:grid md:grid-cols-3 divide-x divide-slate-100 min-h-[320px] max-h-[380px] overflow-hidden">
                    
                    {/* COLUMN 1: Root Categories */}
                    <div className="flex flex-col overflow-hidden bg-slate-50/40">
                      <div className="px-3.5 py-2 bg-slate-100/70 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          1. Main Category
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">{level1Categories.length}</span>
                      </div>
                      <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5">
                        {level1Categories.map((cat) => {
                          const catId = String(cat.id || cat._id);
                          const isActive = activeLevel1Id === catId;
                          const hasChildren = getCategoriesByParent(catId).filter((c) => c.isActive !== false).length > 0;
                          const isFullySelected = String(value) === catId && !subcategoryId;

                          return (
                            <button
                              key={catId}
                              type="button"
                              onClick={() => {
                                setActiveLevel1Id(catId);
                                setActiveLevel2Id(null);
                                if (!hasChildren) {
                                  handleSelectRootOnly(catId);
                                }
                              }}
                              className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium transition-all flex items-center justify-between group ${
                                isActive
                                  ? "bg-brand-primary text-white shadow-sm font-semibold"
                                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                              }`}
                            >
                              <span className="truncate">{cat.name}</span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {isFullySelected && (
                                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-emerald-500'}`} />
                                )}
                                {hasChildren ? (
                                  <FiChevronRight className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600"}`} />
                                ) : (
                                  <span className="text-[10px] opacity-60">Select</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* COLUMN 2: Subcategories (Level 2) */}
                    <div className="flex flex-col overflow-hidden bg-white">
                      <div className="px-3.5 py-2 bg-slate-100/70 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          2. Subcategory
                        </span>
                        {activeLevel1Id && (
                          <button
                            type="button"
                            onClick={() => handleSelectRootOnly(activeLevel1Id)}
                            className="text-[10px] text-brand-primary hover:underline font-semibold"
                          >
                            ✓ Select Main
                          </button>
                        )}
                      </div>
                      <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5">
                        {!activeLevel1Id ? (
                          <div className="py-12 text-center text-xs text-slate-400">
                            Select a main category first
                          </div>
                        ) : level2Categories.length === 0 ? (
                          <div className="py-12 text-center text-xs text-slate-400 px-4">
                            No subcategories under this section.
                            <button
                              type="button"
                              onClick={() => handleSelectRootOnly(activeLevel1Id)}
                              className="mt-2 block mx-auto px-3 py-1 bg-brand-primary/10 text-brand-primary rounded-lg text-xs font-semibold hover:bg-brand-primary/20"
                            >
                              Choose Main Category
                            </button>
                          </div>
                        ) : (
                          level2Categories.map((subCat) => {
                            const subCatId = String(subCat.id || subCat._id);
                            const isActive = activeLevel2Id === subCatId;
                            const children = getCategoriesByParent(subCatId).filter((c) => c.isActive !== false);
                            const hasChildren = children.length > 0;
                            const isSelected = String(subcategoryId) === subCatId;

                            return (
                              <button
                                key={subCatId}
                                type="button"
                                onClick={() => {
                                  if (hasChildren) {
                                    setActiveLevel2Id(subCatId);
                                  } else {
                                    handleSelectSubcategory(subCatId, activeLevel1Id);
                                  }
                                }}
                                className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium transition-all flex items-center justify-between group ${
                                  isActive
                                    ? "bg-slate-900 text-white shadow-sm font-semibold"
                                    : isSelected
                                    ? "bg-brand-primary/10 text-brand-primary font-bold"
                                    : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                              >
                                <span className="truncate">{subCat.name}</span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {hasChildren ? (
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                                      {children.length}
                                    </span>
                                  ) : null}
                                  {hasChildren ? (
                                    <FiChevronRight className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
                                  ) : (
                                    <FiCheck className={`w-3.5 h-3.5 ${isSelected ? "text-brand-primary" : "text-slate-300 opacity-0 group-hover:opacity-100"}`} />
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* COLUMN 3: Child Categories (Level 3) */}
                    <div className="flex flex-col overflow-hidden bg-slate-50/20">
                      <div className="px-3.5 py-2 bg-slate-100/70 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          3. Specific Item Category
                        </span>
                        {activeLevel2Id && (
                          <button
                            type="button"
                            onClick={() => handleSelectSubcategory(activeLevel2Id, activeLevel1Id)}
                            className="text-[10px] text-brand-primary hover:underline font-semibold"
                          >
                            ✓ Select Level 2
                          </button>
                        )}
                      </div>
                      <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5">
                        {!activeLevel2Id ? (
                          <div className="py-12 text-center text-xs text-slate-400 px-4">
                            Select a subcategory to see detailed item categories
                          </div>
                        ) : level3Categories.length === 0 ? (
                          <div className="py-12 text-center text-xs text-slate-400 px-4">
                            No 3rd level items.
                            <button
                              type="button"
                              onClick={() => handleSelectSubcategory(activeLevel2Id, activeLevel1Id)}
                              className="mt-2 block mx-auto px-3 py-1 bg-brand-primary text-white rounded-lg text-xs font-semibold hover:opacity-90"
                            >
                              Choose Selected Subcategory
                            </button>
                          </div>
                        ) : (
                          level3Categories.map((leaf) => {
                            const leafId = String(leaf.id || leaf._id);
                            const isSelected = String(subcategoryId) === leafId;

                            return (
                              <button
                                key={leafId}
                                type="button"
                                onClick={() => handleSelectSubcategory(leafId, activeLevel1Id)}
                                className={`w-full px-3 py-2 rounded-lg text-left text-xs font-medium transition-all flex items-center justify-between group ${
                                  isSelected
                                    ? "bg-brand-primary text-white shadow-sm font-semibold"
                                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                                }`}
                              >
                                <span className="truncate">{leaf.name}</span>
                                {isSelected ? (
                                  <FiCheck className="w-3.5 h-3.5 text-white flex-shrink-0" />
                                ) : (
                                  <span className="text-[10px] text-slate-400 group-hover:text-brand-primary">Select</span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* MOBILE DRILL-DOWN VIEW (Visible only on mobile screens) */}
                  <div className="md:hidden flex flex-col flex-1 overflow-hidden">
                    {/* Mobile Navigation Header */}
                    <div className="px-3 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {mobileStack.length > 1 && (
                          <button
                            type="button"
                            onClick={handleMobileBack}
                            className="p-1 -ml-1 text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1 text-xs"
                          >
                            <FiChevronLeft className="w-4 h-4" /> Back
                          </button>
                        )}
                        <span className="text-xs font-bold text-slate-800 truncate">
                          {currentMobileView.title}
                        </span>
                      </div>
                      
                      {currentMobileView.category && (
                        <button
                          type="button"
                          onClick={() => {
                            const path = getCategoryPath(currentMobileView.parentId);
                            const rootId = path[0] ? String(path[0].id || path[0]._id) : currentMobileView.parentId;
                            if (path.length <= 1) {
                              handleSelectRootOnly(currentMobileView.parentId);
                            } else {
                              handleSelectSubcategory(currentMobileView.parentId, rootId);
                            }
                          }}
                          className="px-2 py-1 bg-brand-primary text-white rounded-md text-[11px] font-bold"
                        >
                          Select This
                        </button>
                      )}
                    </div>

                    {/* Mobile Item List */}
                    <div className="overflow-y-auto flex-1 p-2 divide-y divide-slate-100">
                      {currentMobileItems.map((item) => {
                        const itemId = String(item.id || item._id);
                        const children = getCategoriesByParent(itemId).filter((c) => c.isActive !== false);
                        const hasChildren = children.length > 0;
                        const isSelected = String(subcategoryId || value) === itemId;

                        return (
                          <div
                            key={itemId}
                            onClick={() => handleMobileDrillDown(item)}
                            className="py-3 px-2 flex items-center justify-between active:bg-slate-50 cursor-pointer"
                          >
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm ${isSelected ? 'font-bold text-brand-primary' : 'text-slate-800'}`}>
                                {item.name}
                              </p>
                              {hasChildren && (
                                <p className="text-[11px] text-slate-400">
                                  {children.length} subcategories
                                </p>
                              )}
                            </div>
                            {hasChildren ? (
                              <FiChevronRight className="w-4 h-4 text-slate-400" />
                            ) : (
                              <span className="text-xs font-bold text-brand-primary px-2 py-1 bg-brand-primary/10 rounded-md">
                                Choose
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Bottom Breadcrumb Preview / Footer */}
              <div className="p-2.5 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-1.5 truncate max-w-[75%]">
                  <span className="font-semibold text-slate-500">Selected:</span>
                  <span className="truncate font-bold text-slate-900">
                    {displayText}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
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

