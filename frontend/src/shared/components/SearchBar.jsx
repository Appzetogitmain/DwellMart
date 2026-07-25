
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiSearch, FiClock, FiTrendingUp } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { getCatalogProducts } from '../../modules/UserApp/data/catalogData';
import Price from './Price';
import api from '../utils/api';

const RECENT_SEARCHES_KEY = 'recent-searches';
const MAX_RECENT_SEARCHES = 5;
const MAX_SUGGESTIONS = 5;

const SearchBar = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  const [isFocused, setIsFocused] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Check if we're in the mobile app section
  const isMobileApp = location.pathname.startsWith('/app');
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);
  const inputRef = useRef(null);

  // Popular searches (can be made dynamic later)
  const popularSearches = ['Diapers', 'Vegetables', 'Meat', 'Fruits', 'Baby Care'];



  // Get recent searches from localStorage
  const getRecentSearches = () => {
    try {
      const recent = localStorage.getItem(RECENT_SEARCHES_KEY);
      return recent ? JSON.parse(recent) : [];
    } catch {
      return [];
    }
  };

  // Save search to recent searches
  const saveRecentSearch = (query) => {
    if (!query.trim()) return;
    const recent = getRecentSearches();
    const updated = [query.trim(), ...recent.filter((s) => s !== query.trim())].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  // Update suggestions when query changes
  useEffect(() => {
    let cancelled = false;

    const fetchSuggestions = async () => {
      if (!searchQuery.trim()) {
        setSuggestions([]);
        setSelectedIndex(-1);
        return;
      }

      try {
        const response = await api.get('/products', {
          params: { q: searchQuery.trim(), page: 1, limit: MAX_SUGGESTIONS, sort: 'newest' },
        });
        const payload = response?.data ?? response;
        const products = Array.isArray(payload?.products) ? payload.products : [];
        if (cancelled) return;

        setSuggestions(
          products.map((product) => ({
            type: 'product',
            id: product?._id || product?.id,
            name: product?.name || '',
            image: product?.image || product?.images?.[0] || '',
            price: Number(product?.price) || 0,
          }))
        );
      } catch {
        if (cancelled) return;
        const lowerQuery = searchQuery.toLowerCase();
        const fallback = getCatalogProducts()
          .filter((product) => String(product?.name || '').toLowerCase().includes(lowerQuery))
          .slice(0, MAX_SUGGESTIONS)
          .map((product) => ({
            type: 'product',
            id: product.id,
            name: product.name,
            image: product.image,
            price: Number(product.price) || 0,
          }));
        setSuggestions(fallback);
      }
      setSelectedIndex(-1);
    };

    fetchSuggestions();

    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
    }
  }, [searchQuery]);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!showSuggestions && (suggestions.length > 0 || getRecentSearches().length > 0)) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setShowSuggestions(true);
      }
      return;
    }

    const recentSearches = getRecentSearches();
    const totalItems = suggestions.length + (searchQuery.trim() ? 0 : recentSearches.length) + (searchQuery.trim() ? 0 : popularSearches.length);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleSuggestionSelect(selectedIndex);
      } else {
        handleSubmit(e);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery);
      const searchRoute = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
      navigate(searchRoute);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionSelect = (index) => {
    const recentSearches = getRecentSearches();
    let selectedItem;

    if (searchQuery.trim()) {
      // Product suggestions
      if (index < suggestions.length) {
        selectedItem = suggestions[index];
        const productRoute = `/product/${selectedItem.id}`;
        navigate(productRoute);
      }
    } else {
      // Recent searches or popular searches
      if (index < recentSearches.length) {
        const query = recentSearches[index];
        setSearchQuery(query);
        saveRecentSearch(query);
        const searchRoute = `/search?q=${encodeURIComponent(query)}`;
        navigate(searchRoute);
      } else if (index < recentSearches.length + popularSearches.length) {
        const query = popularSearches[index - recentSearches.length];
        setSearchQuery(query);
        saveRecentSearch(query);
        const searchRoute = `/search?q=${encodeURIComponent(query)}`;
        navigate(searchRoute);
      }
    }
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleInputChange = (e) => {
    setSearchQuery(e.target.value);
    setShowSuggestions(true);
  };

  const handleInputFocus = () => {
    setIsFocused(true);
    setShowSuggestions(true);
  };

  const handleInputBlur = (e) => {
    // Delay blur to allow clicking on suggestions
    setTimeout(() => {
      if (!searchRef.current?.contains(document.activeElement)) {
        setIsFocused(false);
      }
    }, 200);
  };

  // Rotate placeholders when not focused and input is empty


  const recentSearches = getRecentSearches();
  const hasSuggestions = suggestions.length > 0 || recentSearches.length > 0 || popularSearches.length > 0;

  return (
    <div className="w-full relative" ref={searchRef}>
      <form onSubmit={handleSubmit} className="w-full">
        <div className="relative group">
          <FiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-[#ffc101] transition-colors z-10 text-base" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700/80 rounded-full focus:outline-none focus:ring-2 focus:ring-[#ffc101]/50 focus:border-[#ffc101] transition-all text-sm text-gray-100 placeholder:text-gray-400 shadow-inner"
          />
        </div>
      </form>

      {/* Autocomplete Dropdown */}
      {showSuggestions && hasSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 mt-2 w-full min-w-[300px] sm:min-w-[360px] bg-white rounded-xl shadow-2xl border border-gray-200 z-[100] max-h-96 overflow-y-auto"
        >
          {/* Product Suggestions */}
          {searchQuery.trim() && suggestions.length > 0 && (
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Products</div>
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.id}
                  onClick={() => handleSuggestionSelect(index)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors ${selectedIndex === index ? 'bg-primary-50' : ''
                    }`}
                >
                  <img
                    src={suggestion.image}
                    alt={suggestion.name}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-800">{suggestion.name}</p>
                    <Price amount={suggestion.price} className="text-xs text-gray-600" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Recent Searches */}
          {!searchQuery.trim() && recentSearches.length > 0 && (
            <div className="p-2 border-t border-gray-200">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                <FiClock className="text-xs" />
                Recent Searches
              </div>
              {recentSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionSelect(index)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left ${selectedIndex === index ? 'bg-primary-50' : ''
                    }`}
                >
                  <FiClock className="text-gray-400" />
                  <span className="text-sm text-gray-700">{search}</span>
                </button>
              ))}
            </div>
          )}

          {/* Popular Searches */}
          {!searchQuery.trim() && popularSearches.length > 0 && (
            <div className="p-2 border-t border-gray-200">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                <FiTrendingUp className="text-xs" />
                Popular Searches
              </div>
              {popularSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionSelect(recentSearches.length + index)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left ${selectedIndex === recentSearches.length + index ? 'bg-primary-50' : ''
                    }`}
                >
                  <FiTrendingUp className="text-gray-400" />
                  <span className="text-sm text-gray-700">{search}</span>
                </button>
              ))}
            </div>
          )}

          {/* No Results */}
          {searchQuery.trim() && suggestions.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No products found for "{searchQuery}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;

