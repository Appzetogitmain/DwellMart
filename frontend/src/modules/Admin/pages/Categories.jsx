import { useState, useEffect, useMemo } from "react";
import { FiPlus, FiSearch, FiTrash2, FiFilter, FiRefreshCw } from "react-icons/fi";
import { motion } from "framer-motion";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import CategoryForm from "../components/Categories/CategoryForm";
import CategoryTree from "../components/Categories/CategoryTree";
import ExportButton from "../components/ExportButton";
import Pagination from "../components/Pagination";
import AnimatedSelect from "../components/AnimatedSelect";
import toast from "react-hot-toast";
import Button from "../components/Button";

const Categories = () => {
  const {
    categories,
    initialize,
    deleteCategory,
    bulkDeleteCategories,
    seedCategories,
  } = useCategoryStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedExperience, setSelectedExperience] = useState("all");
  const [isSeeding, setIsSeeding] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [parentCategoryId, setParentCategoryId] = useState(null);
  const [viewMode, setViewMode] = useState("tree"); // 'tree' or 'list'
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    initialize();
  }, []);

  const handleSeed = async () => {
    if (window.confirm("Seed default categories for Quick Commerce, Marketplace, and Wholesale? Existing matching categories will be updated.")) {
      setIsSeeding(true);
      try {
        await seedCategories();
        await initialize();
        toast.success("Categories seeded successfully!");
      } catch (err) {
        toast.error("Failed to seed categories");
      } finally {
        setIsSeeding(false);
      }
    }
  };

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      const matchesSearch =
        !searchQuery ||
        category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (category.description &&
          category.description
            .toLowerCase()
            .includes(searchQuery.toLowerCase()));

      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active" && category.isActive) ||
        (selectedStatus === "inactive" && !category.isActive);

      const matchesExperience =
        selectedExperience === "all" ||
        (Array.isArray(category.supportedExperiences)
          ? category.supportedExperiences.includes(selectedExperience)
          : category.experience === selectedExperience);

      return matchesSearch && matchesStatus && matchesExperience;
    });
  }, [categories, searchQuery, selectedStatus, selectedExperience]);

  // Pagination for list view
  const paginatedCategories = useMemo(() => {
    if (viewMode !== "list") return filteredCategories;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredCategories.slice(startIndex, endIndex);
  }, [filteredCategories, currentPage, itemsPerPage, viewMode]);

  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedStatus]);

  const handleCreate = () => {
    setEditingCategory(null);
    setParentCategoryId(null);
    setShowForm(true);
  };

  const handleAddSubcategory = (parentId) => {
    setEditingCategory(null);
    setParentCategoryId(parentId);
    setShowForm(true);
  };

  const handleEdit = (category) => {
    setEditingCategory(category);
    setParentCategoryId(null);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this category?")) {
      deleteCategory(id);
    }
  };

  const handleBulkDelete = () => {
    if (selectedCategories.length === 0) {
      toast.error("Please select categories to delete");
      return;
    }
    if (
      window.confirm(
        `Are you sure you want to delete ${selectedCategories.length} categories?`
      )
    ) {
      bulkDeleteCategories(selectedCategories);
      setSelectedCategories([]);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingCategory(null);
    setParentCategoryId(null);
  };

  const handleFormSave = () => {
    // Categories will be refreshed automatically
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      {/* Header */}
      <div className="space-y-3 sm:space-y-0">
        {/* Title and Button Row */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 lg:hidden">
            Categories
          </h1>
          <Button
            onClick={handleCreate}
            variant="primary"
            icon={FiPlus}
            className="flex-shrink-0">
            <span className="hidden xs:inline sm:inline">Add Category</span>
            <span className="xs:hidden">Add</span>
          </Button>
        </div>
        {/* Description */}
        <p className="text-sm sm:text-base text-gray-600 lg:hidden">
          Manage your product categories
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
        {/* Mobile Filter Toggle */}
        <div className="flex items-center justify-between mb-3 sm:hidden">
          <span className="text-sm font-semibold text-gray-700">Filters</span>
          <Button
            onClick={() => setShowFilters(!showFilters)}
            variant="ghost"
            size="sm"
            icon={FiFilter}>
            {showFilters ? "Hide" : "Show"}
          </Button>
        </div>

        {/* Filter Content */}
        <div
          className={`${
            showFilters ? "block" : "hidden"
          } sm:block space-y-3 sm:space-y-0`}>
          {/* Search */}
          <div className="relative w-full sm:flex-1">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm sm:text-base" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search categories..."
              className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 text-sm sm:text-base text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Filters Row - Desktop */}
          <div className="hidden sm:flex items-center gap-2 sm:gap-3 mt-3 sm:mt-0">
            {/* Experience Filter */}
            <AnimatedSelect
              value={selectedExperience}
              onChange={(e) => setSelectedExperience(e.target.value)}
              options={[
                { value: "all", label: "All Experiences" },
                { value: "quick_commerce", label: "Quick Commerce" },
                { value: "marketplace", label: "Marketplace" },
                { value: "wholesale", label: "Wholesale" },
              ]}
              className="flex-shrink-0 min-w-[160px]"
            />

            {/* Status Filter */}
            <AnimatedSelect
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              options={[
                { value: "all", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              className="flex-shrink-0 min-w-[140px]"
            />

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <Button
                onClick={() => setViewMode("tree")}
                variant={viewMode === "tree" ? "primary" : "ghost"}
                size="sm"
                className={viewMode === "tree" ? "" : "text-gray-600"}>
                Tree View
              </Button>
              <Button
                onClick={() => setViewMode("list")}
                variant={viewMode === "list" ? "primary" : "ghost"}
                size="sm"
                className={viewMode === "list" ? "" : "text-gray-600"}>
                List View
              </Button>
            </div>

            {/* Export Button */}
            <ExportButton
              data={filteredCategories}
              headers={[
                { label: "ID", accessor: (row) => row.id },
                { label: "Name", accessor: (row) => row.name },
                {
                  label: "Description",
                  accessor: (row) => row.description || "",
                },
                {
                  label: "Status",
                  accessor: (row) => (row.isActive ? "Active" : "Inactive"),
                },
                {
                  label: "Parent ID",
                  accessor: (row) => row.parentId || "None",
                },
              ]}
              filename="categories"
            />
          </div>

          {/* Filters Stack - Mobile */}
          <div className="sm:hidden space-y-2 mt-3">
            {/* Status Filter */}
            <AnimatedSelect
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              options={[
                { value: "all", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <Button
                onClick={() => setViewMode("tree")}
                variant={viewMode === "tree" ? "primary" : "ghost"}
                size="sm"
                className={`flex-1 ${
                  viewMode === "tree" ? "" : "text-gray-600"
                }`}>
                Tree View
              </Button>
              <Button
                onClick={() => setViewMode("list")}
                variant={viewMode === "list" ? "primary" : "ghost"}
                size="sm"
                className={`flex-1 ${
                  viewMode === "list" ? "" : "text-gray-600"
                }`}>
                List View
              </Button>
            </div>

            {/* Export Button */}
            <div className="pt-1">
              <ExportButton
                data={filteredCategories}
                headers={[
                  { label: "ID", accessor: (row) => row.id },
                  { label: "Name", accessor: (row) => row.name },
                  {
                    label: "Description",
                    accessor: (row) => row.description || "",
                  },
                  {
                    label: "Status",
                    accessor: (row) => (row.isActive ? "Active" : "Inactive"),
                  },
                  {
                    label: "Parent ID",
                    accessor: (row) => row.parentId || "None",
                  },
                ]}
                filename="categories"
                className="w-full justify-center"
              />
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedCategories.length > 0 && (
          <div className="mt-3 sm:mt-4 p-3 bg-primary-50 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="text-xs sm:text-sm font-semibold text-primary-700">
              {selectedCategories.length} category(ies) selected
            </span>
            <Button
              onClick={handleBulkDelete}
              variant="danger"
              size="sm"
              className="w-full sm:w-auto">
              Delete Selected
            </Button>
          </div>
        )}
      </div>

      {/* Categories Display */}
      <div className="bg-white rounded-xl p-3 sm:p-6 shadow-sm border border-gray-200">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No categories found</p>
          </div>
        ) : viewMode === "tree" ? (
          <CategoryTree
            categories={filteredCategories}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddSubcategory={handleAddSubcategory}
          />
        ) : (
          <>
            <div className="space-y-2">
              {paginatedCategories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCategories([
                          ...selectedCategories,
                          category.id,
                        ]);
                      } else {
                        setSelectedCategories(
                          selectedCategories.filter((id) => id !== category.id)
                        );
                      }
                    }}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  {category.image && (
                    <img
                      src={category.image}
                      alt={category.name}
                      className="w-10 h-10 object-cover rounded-lg"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">
                      {category.name}
                    </p>
                    {category.description && (
                      <p className="text-xs text-gray-500">
                        {category.description}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => handleEdit(category)}
                    variant="iconBlue"
                    icon={FiSearch}
                  />
                  <Button
                    onClick={() => handleDelete(category.id)}
                    variant="iconRed"
                    icon={FiTrash2}
                  />
                </div>
              ))}
            </div>
            {viewMode === "list" && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredCategories.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                className="mt-4"
              />
            )}
          </>
        )}
      </div>

      {/* Category Form Modal */}
      {showForm && (
        <CategoryForm
          category={editingCategory}
          parentId={parentCategoryId}
          onClose={handleFormClose}
          onSave={handleFormSave}
        />
      )}
    </motion.div>
  );
};

export default Categories;
