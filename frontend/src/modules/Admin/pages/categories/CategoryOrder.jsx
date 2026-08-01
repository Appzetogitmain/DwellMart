import { useState, useEffect } from 'react';
import { FiArrowUp, FiArrowDown, FiSave } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useCategoryStore } from '../../../../shared/store/categoryStore';
import { useSettingsStore } from '../../../../shared/store/settingsStore';
import toast from 'react-hot-toast';

const CategoryOrder = () => {
  const { categories, initialize, reorderCategories } = useCategoryStore();
  const { settings, initialize: initializeSettings } = useSettingsStore();
  const quickCommerceEnabled = settings?.features?.quickCommerceEnabled === true;
  const [orderedCategories, setOrderedCategories] = useState([]);
  // Ordering is per-tree; the server rejects mixing experiences in one reorder.
  const [experience, setExperience] = useState('marketplace');

  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  useEffect(() => {
    initialize(experience);
  }, [experience]);

  useEffect(() => {
    // Filter out subcategories (only show root categories)
    const rootCategories = categories.filter((cat) => !cat.parentId);
    setOrderedCategories([...rootCategories].sort((a, b) => (a.order || 0) - (b.order || 0)));
  }, [categories]);

  const moveUp = (index) => {
    if (index === 0) return;
    const newOrder = [...orderedCategories];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setOrderedCategories(newOrder);
  };

  const moveDown = (index) => {
    if (index === orderedCategories.length - 1) return;
    const newOrder = [...orderedCategories];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setOrderedCategories(newOrder);
  };

  const handleSave = async () => {
    const orderIds = orderedCategories.map((cat) => String(cat.id));
    const ok = await reorderCategories(orderIds);
    if (!ok) {
      toast.error('Failed to save category order');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Category Order</h1>
          <p className="text-sm sm:text-base text-gray-600">Reorder categories for display</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm"
        >
          <FiSave />
          <span>Save Order</span>
        </button>
      </div>

      {quickCommerceEnabled && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 mr-1">Category Tree:</span>
          {[
            { value: 'marketplace', label: '🛒 Marketplace' },
            { value: 'quick_commerce', label: '⚡ Quick Commerce' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setExperience(option.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                experience === option.value
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {orderedCategories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No categories found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orderedCategories.map((category, index) => (
              <div
                key={category.id}
                className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FiArrowUp />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === orderedCategories.length - 1}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FiArrowDown />
                  </button>
                </div>
                <div className="flex-1 flex items-center gap-3">
                  <span className="w-8 h-8 flex items-center justify-center bg-primary-100 text-primary-600 rounded-lg font-bold">
                    {index + 1}
                  </span>
                  {category.image && (
                    <img
                      src={category.image}
                      alt={category.name}
                      className="w-10 h-10 object-cover rounded-lg"
                    />
                  )}
                  <div>
                    <p className="font-semibold text-gray-800">{category.name}</p>
                    {category.description && (
                      <p className="text-xs text-gray-500">{category.description}</p>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  Order: {category.order || index + 1}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CategoryOrder;

