import { useState, useMemo } from 'react';
import {
  FiFilter,
  FiChevronDown,
  FiChevronUp,
  FiX,
  FiSearch,
  FiCheck,
  FiStar,
  FiTag,
  FiBox,
  FiShoppingBag,
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const COLOR_MAP = {
  black: '#111827',
  white: '#FFFFFF',
  red: '#EF4444',
  blue: '#3B82F6',
  green: '#10B981',
  yellow: '#F59E0B',
  pink: '#EC4899',
  purple: '#8B5CF6',
  gray: '#6B7280',
  grey: '#6B7280',
  brown: '#854D0E',
  orange: '#F97316',
  navy: '#1E3A8A',
};

const SectionHeader = ({ title, isOpen, onToggle, count = 0 }) => (
  <button
    type="button"
    onClick={onToggle}
    className="w-full py-3 px-1 flex items-center justify-between text-left group cursor-pointer border-b border-border/60 hover:bg-surface-muted/40 transition-colors rounded-lg"
  >
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-wider text-content group-hover:text-brand-primary transition-colors">
        {title}
      </span>
      {count > 0 && (
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-brand-primary text-black">
          {count}
        </span>
      )}
    </div>
    <div className="text-content-muted group-hover:text-content text-xs transition-colors">
      {isOpen ? <FiChevronUp /> : <FiChevronDown />}
    </div>
  </button>
);

export default function FacetedFilterSidebar({
  facets = {},
  loadingFacets = false,
  filters = {},
  categories = [],
  vendors = [],
  onFilterChange,
  onToggleArrayFilter,
  onClearFilters,
  experience = 'marketplace',
  wholesaleMarketplaceEnabled = true,
  isMobile = false,
  onCloseMobile,
  onClose,
}) {
  const handleClose = onClose || onCloseMobile;
  const [openSections, setOpenSections] = useState({
    gender: true,
    category: true,
    brand: true,
    price: true,
    discount: true,
    size: true,
    color: true,
    packSize: true,
    wholesale: true,
    rating: false,
    availability: true,
    vendor: false,
  });

  const [brandSearchQuery, setBrandSearchQuery] = useState('');

  const toggleSection = (section) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const isQC = experience === 'quick_commerce';
  const isWholesale = experience === 'wholesale';
  const isMarketplace = !isQC && !isWholesale;

  // Selected array helpers
  const selectedBrands = useMemo(() => {
    const raw = filters.brand || filters.brands || '';
    if (Array.isArray(raw)) return raw;
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }, [filters.brand, filters.brands]);

  const selectedGenders = useMemo(() => {
    const raw = filters.gender || filters.genders || '';
    if (Array.isArray(raw)) return raw;
    return String(raw).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }, [filters.gender, filters.genders]);

  const selectedSizes = useMemo(() => {
    const raw = filters.size || filters.sizes || '';
    if (Array.isArray(raw)) return raw;
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }, [filters.size, filters.sizes]);

  const selectedColors = useMemo(() => {
    const raw = filters.color || filters.colors || '';
    if (Array.isArray(raw)) return raw;
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }, [filters.color, filters.colors]);

  const selectedPackSizes = useMemo(() => {
    const raw = filters.packSize || filters.packSizes || '';
    if (Array.isArray(raw)) return raw;
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }, [filters.packSize, filters.packSizes]);

  // Filtered brands list by search query
  const availableBrands = facets?.brands || [];
  const filteredBrands = useMemo(() => {
    if (!brandSearchQuery.trim()) return availableBrands;
    const q = brandSearchQuery.toLowerCase();
    return availableBrands.filter((b) => b.name.toLowerCase().includes(q));
  }, [availableBrands, brandSearchQuery]);

  // Active filter count for badge
  const activePills = useMemo(() => {
    const pills = [];

    // Genders
    selectedGenders.forEach((g) => {
      const label = facets?.genders?.find((item) => item.id === g)?.label || g;
      pills.push({
        id: `gender-${g}`,
        type: 'gender',
        value: g,
        label: `Gender: ${label}`,
      });
    });

    // Brands
    selectedBrands.forEach((bId) => {
      const bObj = availableBrands.find((b) => b.id === bId || b._id === bId);
      pills.push({
        id: `brand-${bId}`,
        type: 'brand',
        value: bId,
        label: `Brand: ${bObj?.name || bId}`,
      });
    });

    // Category
    if (filters.category) {
      const cat = categories.find((c) => String(c.id || c._id) === String(filters.category));
      if (cat) {
        pills.push({
          id: 'category',
          type: 'category',
          value: '',
          label: `Category: ${cat.name}`,
        });
      }
    }

    // Sizes
    selectedSizes.forEach((s) => {
      pills.push({
        id: `size-${s}`,
        type: 'size',
        value: s,
        label: `Size: ${s}`,
      });
    });

    // Colors
    selectedColors.forEach((c) => {
      pills.push({
        id: `color-${c}`,
        type: 'color',
        value: c,
        label: `Color: ${c}`,
      });
    });

    // Pack sizes
    selectedPackSizes.forEach((p) => {
      pills.push({
        id: `packSize-${p}`,
        type: 'packSize',
        value: p,
        label: `Pack: ${p}`,
      });
    });

    // Price
    if (filters.minPrice || filters.maxPrice) {
      const min = filters.minPrice ? `₹${filters.minPrice}` : '₹0';
      const max = filters.maxPrice ? `₹${filters.maxPrice}` : 'Above';
      pills.push({
        id: 'price',
        type: 'price',
        value: null,
        label: `${min} - ${max}`,
      });
    }

    // Discount
    if (filters.minDiscount) {
      pills.push({
        id: 'discount',
        type: 'minDiscount',
        value: '',
        label: `${filters.minDiscount}%+ Off`,
      });
    }

    // In Stock
    if (filters.inStock === 'true' || filters.inStock === true) {
      pills.push({
        id: 'inStock',
        type: 'inStock',
        value: '',
        label: 'In Stock Only',
      });
    }

    // Rating
    if (filters.minRating) {
      pills.push({
        id: 'rating',
        type: 'minRating',
        value: '',
        label: `${filters.minRating}★ & above`,
      });
    }

    // Wholesale
    if (filters.bulkDiscount) {
      pills.push({
        id: 'bulkDiscount',
        type: 'bulkDiscount',
        value: false,
        label: 'Bulk Discount',
      });
    }
    if (filters.hasMoq) {
      pills.push({
        id: 'hasMoq',
        type: 'hasMoq',
        value: false,
        label: 'MOQ Items',
      });
    }

    return pills;
  }, [
    selectedGenders,
    selectedBrands,
    selectedSizes,
    selectedColors,
    selectedPackSizes,
    filters,
    facets,
    categories,
    availableBrands,
  ]);

  const handleRemovePill = (pill) => {
    if (pill.type === 'gender') onToggleArrayFilter('gender', pill.value);
    else if (pill.type === 'brand') onToggleArrayFilter('brand', pill.value);
    else if (pill.type === 'size') onToggleArrayFilter('size', pill.value);
    else if (pill.type === 'color') onToggleArrayFilter('color', pill.value);
    else if (pill.type === 'packSize') onToggleArrayFilter('packSize', pill.value);
    else if (pill.type === 'price') {
      onFilterChange('minPrice', '');
      onFilterChange('maxPrice', '');
    } else {
      onFilterChange(pill.type, pill.value);
    }
  };

  return (
    <div className="w-full h-full bg-surface flex flex-col overflow-hidden">
      {/* Top Header */}
      <div className="p-3.5 sm:p-4 border-b border-border flex items-center justify-between bg-surface-muted/40 shrink-0">
        <div className="flex items-center gap-2">
          <FiFilter className="text-brand-primary text-base" />
          <h3 className="font-extrabold text-sm uppercase tracking-wide text-content">
            Filters
          </h3>
          {activePills.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-brand-primary text-black">
              {activePills.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activePills.length > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-bold text-red-500 hover:text-red-600 cursor-pointer transition-colors px-1"
            >
              Clear All
            </button>
          )}
          {handleClose && (
            <button
              type="button"
              onClick={handleClose}
              className="p-1 hover:bg-surface-muted rounded-full transition-colors text-content-secondary hover:text-content cursor-pointer"
              aria-label="Close filters"
            >
              <FiX className="text-base sm:text-lg" />
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Pills Bar */}
      {activePills.length > 0 && (
        <div className="p-3 border-b border-border bg-surface flex flex-wrap gap-1.5 shrink-0 max-h-24 overflow-y-auto">
          {activePills.map((pill) => (
            <span
              key={pill.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-muted border border-border text-content"
            >
              <span>{pill.label}</span>
              <button
                type="button"
                onClick={() => handleRemovePill(pill)}
                className="hover:text-red-500 cursor-pointer transition-colors"
              >
                <FiX className="text-xs" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Filter Sections Body */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-thin">
        {/* 1. GENDER / TARGET AUDIENCE (Marketplace & Wholesale) */}
        {!isQC && facets?.genders && facets.genders.length > 0 && (
          <div>
            <SectionHeader
              title="Gender / Audience"
              isOpen={openSections.gender}
              onToggle={() => toggleSection('gender')}
              count={selectedGenders.length}
            />
            {openSections.gender && (
              <div className="pt-2 space-y-1.5">
                {facets.genders.map((g) => {
                  const isChecked = selectedGenders.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-surface-muted cursor-pointer transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleArrayFilter('gender', g.id)}
                          className="w-3.5 h-3.5 rounded border-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                        />
                        <span className={`font-medium ${isChecked ? 'text-brand-primary font-bold' : 'text-content'}`}>
                          {g.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-content-muted">({g.count})</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. CATEGORIES */}
        {categories && categories.length > 0 && (
          <div>
            <SectionHeader
              title="Categories"
              isOpen={openSections.category}
              onToggle={() => toggleSection('category')}
              count={filters.category ? 1 : 0}
            />
            {openSections.category && (
              <div className="pt-2 max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => onFilterChange('category', '')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    !filters.category
                      ? 'bg-brand-primary/10 text-brand-primary font-bold'
                      : 'text-content hover:bg-surface-muted'
                  }`}
                >
                  All Categories
                </button>
                {categories.map((cat) => {
                  const catId = String(cat.id || cat._id);
                  const isSelected = String(filters.category) === catId;
                  return (
                    <button
                      key={catId}
                      type="button"
                      onClick={() => onFilterChange('category', isSelected ? '' : catId)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'bg-brand-primary/10 text-brand-primary font-bold'
                          : 'text-content hover:bg-surface-muted'
                      }`}
                    >
                      <span className="truncate pr-2">{cat.name}</span>
                      {isSelected && <FiCheck className="text-brand-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. BRANDS (Multi-select with live search) */}
        {availableBrands.length > 0 && (
          <div>
            <SectionHeader
              title="Brands"
              isOpen={openSections.brand}
              onToggle={() => toggleSection('brand')}
              count={selectedBrands.length}
            />
            {openSections.brand && (
              <div className="pt-2 space-y-2">
                {availableBrands.length > 6 && (
                  <div className="relative">
                    <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted text-xs" />
                    <input
                      type="text"
                      placeholder="Search brands..."
                      value={brandSearchQuery}
                      onChange={(e) => setBrandSearchQuery(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-content focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    />
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                  {filteredBrands.map((b) => {
                    const isChecked = selectedBrands.includes(b.id);
                    return (
                      <label
                        key={b.id}
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-surface-muted cursor-pointer transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => onToggleArrayFilter('brand', b.id)}
                            className="w-3.5 h-3.5 rounded border-border text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
                          />
                          <span className={`truncate font-medium ${isChecked ? 'text-brand-primary font-bold' : 'text-content'}`}>
                            {b.name}
                          </span>
                        </div>
                        <span className="text-[11px] text-content-muted shrink-0">({b.count})</span>
                      </label>
                    );
                  })}
                  {filteredBrands.length === 0 && (
                    <p className="text-center py-2 text-xs text-content-muted">No brands match</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. PRICE RANGE */}
        <div>
          <SectionHeader
            title="Price Range"
            isOpen={openSections.price}
            onToggle={() => toggleSection('price')}
            count={filters.minPrice || filters.maxPrice ? 1 : 0}
          />
          {openSections.price && (
            <div className="pt-2 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">
                    Min (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={filters.minPrice || ''}
                    onChange={(e) => onFilterChange('minPrice', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-xs text-content focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">
                    Max (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.maxPrice || ''}
                    onChange={(e) => onFilterChange('maxPrice', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface text-xs text-content focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'Under ₹500', min: '', max: '500' },
                  { label: '₹500 - ₹1K', min: '500', max: '1000' },
                  { label: '₹1K - ₹2.5K', min: '1000', max: '2500' },
                  { label: '₹2.5K+', min: '2500', max: '' },
                ].map((preset) => {
                  const isActive = filters.minPrice === preset.min && filters.maxPrice === preset.max;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        if (isActive) {
                          onFilterChange('minPrice', '');
                          onFilterChange('maxPrice', '');
                        } else {
                          onFilterChange('minPrice', preset.min);
                          onFilterChange('maxPrice', preset.max);
                        }
                      }}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-brand-primary text-black border-brand-primary font-bold'
                          : 'bg-surface-muted text-content-secondary border-border hover:bg-surface'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 5. DISCOUNT % */}
        <div>
          <SectionHeader
            title="Discount"
            isOpen={openSections.discount}
            onToggle={() => toggleSection('discount')}
            count={filters.minDiscount ? 1 : 0}
          />
          {openSections.discount && (
            <div className="pt-2 space-y-1.5">
              {[
                { label: '50% or more', value: '50' },
                { label: '30% or more', value: '30' },
                { label: '20% or more', value: '20' },
                { label: '10% or more', value: '10' },
              ].map((disc) => {
                const isSelected = String(filters.minDiscount) === disc.value;
                return (
                  <label
                    key={disc.value}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-muted cursor-pointer transition-colors text-xs"
                  >
                    <input
                      type="radio"
                      name="discountRange"
                      checked={isSelected}
                      onChange={() => onFilterChange('minDiscount', isSelected ? '' : disc.value)}
                      onClick={() => {
                        if (isSelected) onFilterChange('minDiscount', '');
                      }}
                      className="w-3.5 h-3.5 text-brand-primary border-border focus:ring-brand-primary cursor-pointer"
                    />
                    <span className={`font-medium ${isSelected ? 'text-brand-primary font-bold' : 'text-content'}`}>
                      {disc.label}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* 6. SIZES (Apparel & Footwear) */}
        {!isQC && facets?.sizes && facets.sizes.length > 0 && (
          <div>
            <SectionHeader
              title="Sizes"
              isOpen={openSections.size}
              onToggle={() => toggleSection('size')}
              count={selectedSizes.length}
            />
            {openSections.size && (
              <div className="pt-2 flex flex-wrap gap-1.5">
                {facets.sizes.map((s) => {
                  const isChecked = selectedSizes.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onToggleArrayFilter('size', s.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-brand-primary text-black border-brand-primary shadow-xs'
                          : 'bg-surface text-content border-border hover:bg-surface-muted'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 7. COLORS */}
        {!isQC && facets?.colors && facets.colors.length > 0 && (
          <div>
            <SectionHeader
              title="Colors"
              isOpen={openSections.color}
              onToggle={() => toggleSection('color')}
              count={selectedColors.length}
            />
            {openSections.color && (
              <div className="pt-2 flex flex-wrap gap-1.5">
                {facets.colors.map((c) => {
                  const isChecked = selectedColors.includes(c.id);
                  const hex = COLOR_MAP[c.id.toLowerCase()] || '#E5E7EB';
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onToggleArrayFilter('color', c.id)}
                      title={c.label}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                        isChecked
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                          : 'border-border bg-surface text-content hover:bg-surface-muted'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 8. PACK SIZES (Quick Commerce only) */}
        {isQC && facets?.packSizes && facets.packSizes.length > 0 && (
          <div>
            <SectionHeader
              title="Pack Size / Weight"
              isOpen={openSections.packSize}
              onToggle={() => toggleSection('packSize')}
              count={selectedPackSizes.length}
            />
            {openSections.packSize && (
              <div className="pt-2 flex flex-wrap gap-1.5">
                {facets.packSizes.map((p) => {
                  const isChecked = selectedPackSizes.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onToggleArrayFilter('packSize', p.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-brand-primary text-black border-brand-primary font-bold'
                          : 'bg-surface text-content border-border hover:bg-surface-muted'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 9. WHOLESALE SPECIFICS (Wholesale mode) */}
        {(isWholesale || wholesaleMarketplaceEnabled) && (
          <div>
            <SectionHeader
              title="Wholesale Commercials"
              isOpen={openSections.wholesale}
              onToggle={() => toggleSection('wholesale')}
              count={filters.bulkDiscount || filters.hasMoq ? 1 : 0}
            />
            {openSections.wholesale && (
              <div className="pt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onFilterChange('bulkDiscount', filters.bulkDiscount ? false : true)
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      filters.bulkDiscount
                        ? 'bg-brand-primary text-black border-brand-primary font-bold'
                        : 'bg-surface text-content border-border hover:bg-surface-muted'
                    }`}
                  >
                    Tiered Bulk Discount
                  </button>
                  <button
                    type="button"
                    onClick={() => onFilterChange('hasMoq', filters.hasMoq ? false : true)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      filters.hasMoq
                        ? 'bg-brand-primary text-black border-brand-primary font-bold'
                        : 'bg-surface text-content border-border hover:bg-surface-muted'
                    }`}
                  >
                    MOQ Enabled
                  </button>
                </div>

                {facets?.moqBuckets && facets.moqBuckets.length > 0 && (
                  <div className="pt-1">
                    <label className="block text-[10px] uppercase font-bold text-content-muted mb-1.5">
                      MOQ Batches
                    </label>
                    <div className="space-y-1">
                      {facets.moqBuckets.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between text-xs text-content px-2 py-1 rounded bg-surface-muted/50"
                        >
                          <span>{b.label}</span>
                          <span className="text-[11px] text-content-muted">({b.count})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 10. CUSTOMER RATING */}
        <div>
          <SectionHeader
            title="Customer Rating"
            isOpen={openSections.rating}
            onToggle={() => toggleSection('rating')}
            count={filters.minRating ? 1 : 0}
          />
          {openSections.rating && (
            <div className="pt-2 space-y-1.5">
              {[4, 3, 2].map((stars) => {
                const isChecked = String(filters.minRating) === String(stars);
                return (
                  <label
                    key={stars}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-muted cursor-pointer transition-colors text-xs"
                  >
                    <input
                      type="radio"
                      name="minRating"
                      checked={isChecked}
                      onChange={() => onFilterChange('minRating', isChecked ? '' : String(stars))}
                      onClick={() => {
                        if (isChecked) onFilterChange('minRating', '');
                      }}
                      className="w-3.5 h-3.5 text-brand-primary border-border focus:ring-brand-primary cursor-pointer"
                    />
                    <div className="flex items-center gap-1 text-amber-500 font-semibold">
                      <span>{stars}★ & above</span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* 11. AVAILABILITY */}
        <div>
          <SectionHeader
            title="Availability"
            isOpen={openSections.availability}
            onToggle={() => toggleSection('availability')}
            count={filters.inStock === 'true' || filters.inStock === true ? 1 : 0}
          />
          {openSections.availability && (
            <div className="pt-2">
              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-muted cursor-pointer transition-colors text-xs">
                <span className="font-semibold text-content">In Stock Only</span>
                <input
                  type="checkbox"
                  checked={filters.inStock === 'true' || filters.inStock === true}
                  onChange={(e) => onFilterChange('inStock', e.target.checked ? 'true' : '')}
                  className="w-4 h-4 rounded text-brand-primary border-border focus:ring-brand-primary cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Action Footer */}
      {(isMobile || handleClose) && (
        <div className="p-3 border-t border-border bg-surface flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClearFilters}
            className="flex-1 py-2.5 rounded-xl border border-border text-content-secondary text-xs font-bold hover:bg-surface-muted transition-colors cursor-pointer"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-2.5 rounded-xl bg-brand-primary text-black text-xs font-extrabold hover:bg-brand-primaryHover transition-colors cursor-pointer shadow-sm"
          >
            Apply Filters
          </button>
        </div>
      )}
    </div>
  );
}
