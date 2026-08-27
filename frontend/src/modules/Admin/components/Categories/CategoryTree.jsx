import { useState } from 'react';
import { FiChevronDown, FiChevronRight, FiEdit, FiTrash2, FiEye, FiEyeOff, FiPlus } from 'react-icons/fi';
import { useCategoryStore } from '../../../../shared/store/categoryStore';
import Badge from '../../../../shared/components/Badge';
import toast from 'react-hot-toast';
import Button from '../Button';

const CategoryTree = ({ categories, onEdit, onDelete, onAddSubcategory, level = 0 }) => {
  const { toggleCategoryStatus } = useCategoryStore();
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getChildren = (parentId) => {
    return categories.filter((cat) => cat.parentId === parentId);
  };

  const renderCategory = (category) => {
    const children = getChildren(category.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded[category.id];

    return (
      <div key={category.id} className="select-none">
        {/* Mobile Card Design */}
        <div className="sm:hidden">
          <div
            className={`bg-white border border-gray-200 rounded-2xl p-3.5 mb-2.5 shadow-sm hover:shadow-md transition-all active:scale-[0.98] ${
              level > 0 ? 'ml-3' : ''
            }`}
          >
            {/* Header Section - Image, Name, Badge, Expand */}
            <div className="flex items-start gap-3 mb-3">
              {/* Expand Button */}
              {hasChildren && (
                <Button
                  onClick={() => toggleExpand(category.id)}
                  variant="icon"
                  className="flex-shrink-0 -ml-1 text-gray-500"
                  icon={isExpanded ? FiChevronDown : FiChevronRight}
                />
              )}
              {!hasChildren && <div className="w-6" />}

              {/* Category Image */}
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex-shrink-0 border border-gray-100 flex items-center justify-center overflow-hidden relative">
                {category.image ? (
                  <img
                    src={category.image}
                    alt={category.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextElementSibling) {
                        e.currentTarget.nextElementSibling.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div
                  className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-base"
                  style={{ display: category.image ? 'none' : 'flex' }}
                >
                  {category.icon || category.name?.charAt(0)?.toUpperCase() || '📁'}
                </div>
              </div>

              {/* Category Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-1">
                    {category.name}
                  </h3>
                    {hasChildren && (
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {children.length} subcategor{children.length !== 1 ? 'ies' : 'y'}
                      </p>
                    )}
                  </div>
                  <Badge 
                    variant={category.isActive ? 'success' : 'error'} 
                    className="flex-shrink-0 text-[10px] px-2 py-0.5"
                  >
                    {category.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                {category.description && (
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                    {category.description}
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons - Horizontal Layout */}
            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
              {onAddSubcategory && (
                <Button
                  onClick={() => onAddSubcategory(category.id)}
                  variant="ghostBlue"
                  size="sm"
                  icon={FiPlus}
                  className="flex-1"
                  title="Add Subcategory"
                >
                  Add Sub
                </Button>
              )}
              <Button
                onClick={() => toggleCategoryStatus(category.id)}
                variant="ghost"
                size="sm"
                icon={category.isActive ? FiEye : FiEyeOff}
                className="flex-1"
                title={category.isActive ? 'Deactivate' : 'Activate'}
              >
                {category.isActive ? 'Hide' : 'Show'}
              </Button>
              <Button
                onClick={() => onEdit(category)}
                variant="ghostBlue"
                size="sm"
                icon={FiEdit}
                className="flex-1"
                title="Edit"
              >
                Edit
              </Button>
              <Button
                onClick={() => onDelete(category.id)}
                variant="ghostRed"
                size="sm"
                icon={FiTrash2}
                className="flex-1"
                title="Delete"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>

        {/* Desktop Design */}
        <div
          className={`hidden sm:flex items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
            level > 0 ? 'ml-6' : ''
          }`}
        >
          {hasChildren && (
            <Button
              onClick={() => toggleExpand(category.id)}
              variant="icon"
              icon={isExpanded ? FiChevronDown : FiChevronRight}
              className="text-gray-600"
            />
          )}
          {!hasChildren && <div className="w-6" />}

          <div className="flex-1 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex-shrink-0 border border-gray-100 flex items-center justify-center overflow-hidden relative">
              {category.image ? (
                <img
                  src={category.image}
                  alt={category.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.nextElementSibling) {
                      e.currentTarget.nextElementSibling.style.display = 'flex';
                    }
                  }}
                />
              ) : null}
              <div
                className="w-full h-full flex items-center justify-center text-gray-500 font-semibold text-xs"
                style={{ display: category.image ? 'none' : 'flex' }}
              >
                {category.icon || category.name?.charAt(0)?.toUpperCase() || '📁'}
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-800">{category.name}</p>
                {hasChildren && (
                  <Badge variant="info" className="text-[10px] px-1.5 py-0.5">
                    {children.length}
                  </Badge>
                )}
              </div>
              {category.description && (
                <p className="text-xs text-gray-500">{category.description}</p>
              )}
            </div>
            <Badge variant={category.isActive ? 'success' : 'error'}>
              {category.isActive ? 'Active' : 'Inactive'}
            </Badge>
            <div className="flex items-center gap-2">
              {onAddSubcategory && (
                <Button
                  onClick={() => onAddSubcategory(category.id)}
                  variant="iconBlue"
                  icon={FiPlus}
                  title="Add Subcategory"
                />
              )}
              <Button
                onClick={() => toggleCategoryStatus(category.id)}
                variant="icon"
                icon={category.isActive ? FiEye : FiEyeOff}
                title={category.isActive ? 'Deactivate' : 'Activate'}
              />
              <Button
                onClick={() => onEdit(category)}
                variant="iconBlue"
                icon={FiEdit}
                title="Edit"
              />
              <Button
                onClick={() => onDelete(category.id)}
                variant="iconRed"
                icon={FiTrash2}
                title="Delete"
              />
            </div>
          </div>
        </div>

        {/* Children - Mobile */}
        {hasChildren && isExpanded && (
          <div className={`sm:hidden ${level > 0 ? 'ml-4' : 'ml-0'} mt-2`}>
            {children.map((child) => renderCategory(child))}
          </div>
        )}

        {/* Children - Desktop */}
        {hasChildren && isExpanded && (
          <div className="hidden sm:block ml-4 border-l-2 border-gray-200">
            {children.map((child) => renderCategory(child))}
          </div>
        )}
      </div>
    );
  };

  const rootCategories = categories
    .filter((cat) => !cat.parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="space-y-2 sm:space-y-1">
      {rootCategories.map((category) => renderCategory(category))}
    </div>
  );
};

export default CategoryTree;

