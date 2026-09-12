import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FiChevronDown, FiSearch, FiCheck, FiX, FiAlertCircle, FiPlus } from 'react-icons/fi';

export const MASTER_UNITS = [
  {
    category: 'Count / Items',
    units: [
      { value: 'Piece', label: 'Piece (pc) — Standard' },
      { value: 'Pack', label: 'Pack' },
      { value: 'Pair', label: 'Pair (Shoes, Socks, Gloves)' },
      { value: 'Set', label: 'Set (Combos, Kits, Sets)' },
      { value: 'Box', label: 'Box' },
      { value: 'Dozen', label: 'Dozen (12 pcs)' },
      { value: 'Bundle', label: 'Bundle' },
      { value: 'Roll', label: 'Roll (Tapes, Fabrics, Foils)' },
      { value: 'Bottle', label: 'Bottle' },
      { value: 'Can', label: 'Can' },
      { value: 'Sachet', label: 'Sachet' },
    ],
  },
  {
    category: 'Weight',
    units: [
      { value: 'Gram (g)', label: 'Gram (g)' },
      { value: 'Kilogram (kg)', label: 'Kilogram (kg)' },
      { value: 'Milligram (mg)', label: 'Milligram (mg)' },
    ],
  },
  {
    category: 'Volume / Liquid',
    units: [
      { value: 'Millilitre (ml)', label: 'Millilitre (ml)' },
      { value: 'Litre (L)', label: 'Litre (L)' },
    ],
  },
  {
    category: 'Length / Area',
    units: [
      { value: 'Meter (m)', label: 'Meter (m)' },
      { value: 'Centimeter (cm)', label: 'Centimeter (cm)' },
      { value: 'Square Feet (sq ft)', label: 'Square Feet (sq ft)' },
    ],
  },
];

// Flat list of all predefined unit values
export const ALL_STANDARD_UNIT_VALUES = MASTER_UNITS.flatMap((group) =>
  group.units.map((u) => u.value)
);

const UnitSelector = ({
  value = '',
  onChange,
  name = 'unit',
  disabled = false,
  className = '',
  required = false,
  placeholder = 'Select or search unit...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [error, setError] = useState('');

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const customInputRef = useRef(null);

  // Normalize current value
  const currentValue = String(value || '').trim();

  // Determine if current value is in predefined list
  const isPredefined = useMemo(() => {
    return ALL_STANDARD_UNIT_VALUES.includes(currentValue);
  }, [currentValue]);

  // Sync internal state when external value changes
  useEffect(() => {
    if (currentValue && !isPredefined) {
      setCustomInput(currentValue);
    }
  }, [currentValue, isPredefined]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
        setIsCustomMode(false);
        setError('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Auto-focus search input on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Auto-focus custom input when custom mode is activated
  useEffect(() => {
    if (isCustomMode && customInputRef.current) {
      setTimeout(() => customInputRef.current?.focus(), 50);
    }
  }, [isCustomMode]);

  // Emit change helper compatible with standard (val) or (e) handlers
  const emitChange = (newUnit) => {
    const trimmed = String(newUnit || '').trim();
    if (onChange) {
      // Create synthetic event for compatibility with forms expecting e.target.name & e.target.value
      const syntheticEvent = {
        target: { name, value: trimmed },
        currentTarget: { name, value: trimmed },
      };
      onChange(syntheticEvent, trimmed);
    }
  };

  // Filtered unit categories based on search query
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return MASTER_UNITS;

    return MASTER_UNITS.map((group) => {
      const matchedUnits = group.units.filter(
        (u) =>
          u.label.toLowerCase().includes(q) ||
          u.value.toLowerCase().includes(q)
      );
      return { ...group, units: matchedUnits };
    }).filter((group) => group.units.length > 0);
  }, [searchQuery]);

  // Check if search query is a pure number
  const isSearchPureNumber = useMemo(() => {
    const q = searchQuery.trim();
    return q.length > 0 && /^\d+$/.test(q);
  }, [searchQuery]);

  // Check if search query is an exact match for an existing unit
  const exactMatchExists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return ALL_STANDARD_UNIT_VALUES.some((u) => u.toLowerCase() === q);
  }, [searchQuery]);

  // Select a predefined unit
  const handleSelectUnit = (unitValue) => {
    emitChange(unitValue);
    setIsOpen(false);
    setSearchQuery('');
    setIsCustomMode(false);
    setError('');
  };

  // Submit custom unit
  const handleApplyCustomUnit = (rawUnit) => {
    const cleaned = String(rawUnit || '').trim();
    if (!cleaned) {
      setError('Please enter a unit name');
      return;
    }
    // Reject pure numbers (e.g. "50")
    if (/^\d+$/.test(cleaned)) {
      setError('Unit cannot be a number alone (e.g. use Piece, Pack, 50g, etc.)');
      return;
    }
    if (cleaned.length > 30) {
      setError('Unit name cannot exceed 30 characters');
      return;
    }

    // Capitalize first letter if all lowercase
    const formatted =
      cleaned.length > 1 && cleaned === cleaned.toLowerCase()
        ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
        : cleaned;

    emitChange(formatted);
    setIsOpen(false);
    setSearchQuery('');
    setIsCustomMode(false);
    setError('');
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button / Input Display */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full px-3 py-2 text-sm border rounded-lg text-left flex items-center justify-between gap-2 transition-all shadow-2xs ${
          disabled
            ? 'bg-gray-100 cursor-not-allowed text-gray-500 border-gray-200'
            : isOpen
            ? 'bg-white border-primary-500 ring-2 ring-primary-500/20 text-gray-900'
            : 'bg-white border-gray-300 hover:border-gray-400 text-gray-800'
        }`}
      >
        <span className="truncate">
          {currentValue ? (
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-900">{currentValue}</span>
              {!isPredefined && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded">
                  Custom
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        <FiChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-primary-600' : ''
          }`}
        />
      </button>

      {/* Hidden input to ensure native form submission or required validation */}
      <input
        type="hidden"
        name={name}
        value={currentValue}
        required={required}
      />

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Header */}
          <div className="p-2 border-b border-gray-100 bg-gray-50/70">
            <div className="relative">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setError('');
                }}
                placeholder="Search units (e.g., kg, pair, pack)..."
                className="w-full pl-8 pr-7 py-1.5 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 text-gray-800"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Error or validation warning */}
            {isSearchPureNumber && (
              <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-1.5 text-xs text-rose-700">
                <FiAlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-600" />
                <span>Unit cannot be a number alone. Please enter a unit name (e.g. Piece, Pack, etc.).</span>
              </div>
            )}
          </div>

          {/* Units List */}
          <div className="max-h-60 overflow-y-auto p-1.5 divide-y divide-gray-100">
            {/* If user typed a valid non-predefined custom unit in search */}
            {searchQuery.trim() && !exactMatchExists && !isSearchPureNumber && (
              <div className="pb-1.5 mb-1.5">
                <button
                  type="button"
                  onClick={() => handleApplyCustomUnit(searchQuery)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 flex items-center justify-between gap-2 transition-colors border border-primary-200"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <FiPlus className="w-4 h-4 text-primary-600" />
                    <span>Use custom unit: <strong className="font-bold">"{searchQuery.trim()}"</strong></span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-primary-200 text-primary-800 rounded">
                    Add
                  </span>
                </button>
              </div>
            )}

            {filteredCategories.length > 0 ? (
              filteredCategories.map((group) => (
                <div key={group.category} className="py-1.5 first:pt-0 last:pb-0">
                  <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 select-none">
                    {group.category}
                  </p>
                  <div className="space-y-0.5">
                    {group.units.map((unit) => {
                      const isSelected = currentValue === unit.value;
                      return (
                        <button
                          key={unit.value}
                          type="button"
                          onClick={() => handleSelectUnit(unit.value)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs sm:text-sm flex items-center justify-between transition-colors ${
                            isSelected
                              ? 'bg-primary-50 text-primary-700 font-semibold'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <span className="truncate">{unit.label}</span>
                          {isSelected && (
                            <FiCheck className="w-4 h-4 text-primary-600 shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              !searchQuery.trim() && (
                <p className="p-4 text-center text-xs text-gray-400">No units found</p>
              )
            )}
          </div>

          {/* Footer: "Other / Custom..." Mode */}
          <div className="p-2 border-t border-gray-100 bg-gray-50/80">
            {isCustomMode ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-600">Enter custom unit:</p>
                <div className="flex items-center gap-1.5">
                  <input
                    ref={customInputRef}
                    type="text"
                    value={customInput}
                    onChange={(e) => {
                      setCustomInput(e.target.value);
                      setError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyCustomUnit(customInput);
                      }
                    }}
                    placeholder="e.g., Sachet, Can, Roll"
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyCustomUnit(customInput)}
                    className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomMode(false);
                      setError('');
                    }}
                    className="p-1.5 hover:bg-gray-200 text-gray-500 rounded-lg"
                    title="Cancel"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
                {error && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                    <FiAlertCircle className="w-3 h-3 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(true);
                  setCustomInput(!isPredefined ? currentValue : '');
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:text-primary-600 hover:bg-white flex items-center justify-between transition-colors border border-dashed border-gray-300"
              >
                <span>➕ Other / Custom Unit...</span>
                <span className="text-[10px] text-gray-400">Type your own</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UnitSelector;
